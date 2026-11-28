package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.domain.*
import com.storecore.catalog.domain.ArsAmount
import com.storecore.catalog.domain.ProductStatus
import com.storecore.catalog.domain.VariantStatus
import com.storecore.commerce.application.BuyerIdentityUnavailable
import com.storecore.commerce.application.CheckoutConflict
import com.storecore.commerce.application.CheckoutContextChanged
import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.domain.CartLineView
import com.storecore.commerce.domain.CartView
import com.storecore.commerce.domain.CheckoutReceipt
import com.storecore.commerce.domain.OrderStatus
import com.storecore.commerce.domain.PaymentStatus
import com.storecore.commerce.domain.PaymentCurrency
import com.storecore.commerce.infrastructure.mporders.MpCheckoutAttemptService
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.application.AuthenticationFailed
import com.storecore.identity.application.ResourceNotFound
import com.storecore.identity.domain.CustomerPrincipal
import com.storecore.loyalty.application.LoyaltyCheckoutConflict
import com.storecore.loyalty.application.LoyaltyCheckoutPort
import com.storecore.loyalty.application.LoyaltyEligibilityPort
import com.storecore.loyalty.domain.LoyaltyCartFingerprint
import com.storecore.loyalty.domain.LoyaltyCartLine
import com.storecore.loyalty.domain.LoyaltyCheckoutSelection
import com.storecore.loyalty.domain.LoyaltyDiscountState
import com.storecore.loyalty.domain.LoyaltyEvidenceCurrency
import com.storecore.loyalty.domain.LoyaltyMinorUnits
import com.storecore.loyalty.domain.LoyaltyOrderItemCorrelation
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcCartService(
    private val deliveryPolicies: ManualFulfillmentPolicyReader,
    private val priceAuthority: com.storecore.catalog.application.SkuPriceAuthority,
    private val jdbc: JdbcTemplate,
    private val mapper: ObjectMapper,
    private val inventory: JdbcInventoryService,
    private val capabilities: CapabilityDecisionPort,
    private val mpAttempts: ObjectProvider<MpCheckoutAttemptService>,
    private val transactions: TransactionTemplate,
    private val loyaltyEligibility: LoyaltyEligibilityPort,
    private val loyaltyCheckout: LoyaltyCheckoutPort,
) {
    fun read(customer: CustomerPrincipal): CartView = snapshot(ensureCart(customer.customerId))

    fun putItem(customer: CustomerPrincipal, sku: String, quantity: Int): CartView {
        val cartId = ensureCart(customer.customerId)
        if (quantity <= 0) {
            jdbc.update("DELETE FROM cart_items WHERE cart_id=? AND variant_id IN (SELECT id FROM product_variants WHERE sku=?)", cartId, sku)
        } else {
            val priced = price(sku)
            jdbc.update(
                "INSERT INTO cart_items(cart_id,variant_id,quantity,original_unit_price,discount_amount,offer_id,campaign_reference,effective_unit_price) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (cart_id,variant_id) DO UPDATE SET quantity=excluded.quantity,original_unit_price=excluded.original_unit_price,discount_amount=excluded.discount_amount,offer_id=excluded.offer_id,campaign_reference=excluded.campaign_reference,effective_unit_price=excluded.effective_unit_price",
                cartId, priced.variantId, quantity, priced.original, priced.discount, priced.offerId, priced.campaign, priced.effective,
            )
        }
        return snapshot(cartId)
    }

    fun checkout(
        customer: CustomerPrincipal,
        idempotencyKey: UUID,
        addressId: Long?,
        currency: PaymentCurrency,
        deliveryMode: DeliveryMode,
        deliveryConfigurationVersion: Int,
        expectedCartRevision: String,
        expectedAddressRevision: Instant?,
        loyaltySelection: LoyaltyCheckoutSelection = LoyaltyCheckoutSelection.None,
    ): CheckoutReceipt = transactions.execute {
        if (deliveryMode == DeliveryMode.UNKNOWN || deliveryConfigurationVersion <= 0 ||
            !expectedCartRevision.matches(Regex("^[0-9a-f]{64}$")) ||
            (deliveryMode.requiresAddress && (addressId == null || addressId <= 0 || expectedAddressRevision == null)) ||
            (!deliveryMode.requiresAddress && (addressId != null || expectedAddressRevision != null))
        ) throw CommerceValidation("DELIVERY_SELECTION_INVALID")
        if (currency != PaymentCurrency.ARS) throw CommerceValidation("UNSUPPORTED_CURRENCY")
        if (loyaltySelection is LoyaltyCheckoutSelection.Invalid) throw CommerceValidation("LOYALTY_SELECTION_INVALID")

        val loyaltyIdentity = when (loyaltySelection) {
            LoyaltyCheckoutSelection.None -> null
            is LoyaltyCheckoutSelection.Reservation ->
                listOf(loyaltySelection.reservationId.toString(), loyaltySelection.expectedReservationRevision.value)
            LoyaltyCheckoutSelection.Invalid -> throw CommerceValidation("LOYALTY_SELECTION_INVALID")
        }
        val fingerprint = sha256(
            mapper.writeValueAsString(
                listOf(
                    deliveryMode.name,
                    deliveryConfigurationVersion,
                    addressId,
                    expectedAddressRevision?.toString(),
                    expectedCartRevision,
                    currency.name,
                    loyaltyIdentity,
                ),
            ),
        )

        // 1. Lock customer/session first; current-auth exact replay occurs before BIND admission, TTL or QUOTED checks.
        jdbc.query("SELECT id FROM customers WHERE id=? AND active=TRUE FOR UPDATE", { rs, _ -> rs.getLong(1) }, customer.customerId)
            .singleOrNull() ?: throw AuthenticationFailed()
        if (loyaltySelection is LoyaltyCheckoutSelection.Reservation) {
            loyaltyCheckout.assertLiveCustomerSession(customer)
        }

        val existing = jdbc.query(
            "SELECT id,request_hash,checkout_snapshot FROM checkout_idempotency_claims WHERE customer_id=? AND checkout_idempotency_key=?",
            { rs, _ -> Triple(rs.getLong("id"), rs.getString("request_hash"), rs.getString("checkout_snapshot")) },
            customer.customerId, idempotencyKey,
        ).singleOrNull()
        if (existing != null) {
            val original = mapper.readTree(existing.third)
            val decision = deliveryPolicies.decision(existing.third)
            if (!currency.matchesVerified(PaymentCurrency.fromWire(original.path("currency").asText(null)))) {
                throw CommerceValidation("UNSUPPORTED_CURRENCY")
            }
            if (original.path("commandFingerprint").asText() != fingerprint ||
                decision.state != DeliverySnapshotState.KNOWN ||
                decision.resolvedMode() != deliveryMode ||
                decision.value?.configurationVersion != deliveryConfigurationVersion
            ) throw CheckoutConflict()
            return@execute replayReceipt(existing.first) ?: throw CommerceValidation("CHECKOUT_IN_PROGRESS")
        }

        capabilities.decide("PAYMENTS_MP", "CLAIM_CHECKOUT", CapabilityActor.System)
        if (loyaltySelection is LoyaltyCheckoutSelection.Reservation) {
            loyaltyCheckout.admitBind(customer)
        }

        // 2. Lock cart and stable cart items.
        val cartId = ensureCart(customer.customerId)
        jdbc.query("SELECT id FROM carts WHERE id=? FOR UPDATE", { rs, _ -> rs.getLong(1) }, cartId).single()
        val cartSnapshot = snapshotWithIds(cartId)
        val cart = cartSnapshot.view
        if (cart.revision != expectedCartRevision) throw CheckoutContextChanged()
        if (!currency.matchesVerified(cart.currency)) throw CommerceValidation("UNSUPPORTED_CURRENCY")
        if (cart.lines.isEmpty()) throw CommerceValidation("CART_EMPTY")

        val option = deliveryPolicies.selection(deliveryMode, deliveryConfigurationVersion)
        capabilities.decide("MANUAL_FULFILLMENT", "READ", CapabilityActor.System)
        val buyerIdentity = readBuyerIdentity(customer.customerId)
        val address: DeliveryAddress? = if (deliveryMode.requiresAddress) {
            jdbc.query(
                "SELECT street,number,city,province,postal_code,updated_at FROM customer_addresses WHERE id=? AND customer_id=? FOR SHARE",
                { rs, _ ->
                    if (rs.getTimestamp("updated_at").toInstant() != expectedAddressRevision) throw CheckoutContextChanged()
                    DeliveryPolicyTranslator.address(
                        mapOf(
                            "street" to rs.getString("street"),
                            "number" to rs.getString("number"),
                            "city" to rs.getString("city"),
                            "province" to rs.getString("province"),
                            "postalCode" to rs.getString("postal_code"),
                        ),
                    )
                },
                addressId, customer.customerId,
            ).singleOrNull() ?: throw ResourceNotFound()
        } else null
        val target = if (address != null) DeliveryDestination.Address(address) else DeliveryDestination.Pickup(option.destination!!)
        val delivery = DeliveryPolicySnapshot(option.mode, option.label, option.cost, option.minDays, option.maxDays, option.configurationVersion, target, option.instructions)
        val grossSubtotal = cart.lines.fold(BigDecimal.ZERO) { acc, line -> acc + line.effectiveUnitPrice.multiply(BigDecimal(line.quantity)) }
        if (ArsAmount.fromWire(grossSubtotal) == null || ArsAmount.fromWire(option.cost) == null) throw CommerceValidation("CHECKOUT_TOTAL_INVALID")

        val loyaltyCartLines = cartSnapshot.items.map { item -> toLoyaltyCartLine(item) }
        val cartFingerprint = LoyaltyCartFingerprint.compute(customer.customerId, LoyaltyEvidenceCurrency.ARS, loyaltyCartLines)
            ?: throw CommerceValidation("CART_EMPTY")

        // 3. Lock products -> product_variants in ascending identity order.
        val productVariantIdentities = lockSellableProductsAndVariants(cartSnapshot.items)

        // 4. Read/lock latest loyalty price profile heads under held product/variant locks.
        val eligibility = loyaltyEligibility.resolveCheckoutEligibility(loyaltyCartLines, loyaltySelection)

        // 5. Lock wallet -> reservation (if redeeming) and revalidate quote/TTL/session/allocations.
        val preparedBind = if (loyaltySelection is LoyaltyCheckoutSelection.Reservation) {
            loyaltyCheckout.prepareRedemptionBind(customer, loyaltySelection, cartFingerprint, eligibility)
        } else null

        val discountMinor = preparedBind?.quote?.discount?.value ?: 0L
        val grossSubtotalMinor = loyaltyCartLines.fold(0L) { acc, line -> acc + line.effectiveUnitPrice.value * line.quantity }
        val netSubtotalMinor = grossSubtotalMinor - discountMinor
        if (netSubtotalMinor < 0) throw LoyaltyCheckoutConflict("LOYALTY_DISCOUNT_EXCEEDS_SUBTOTAL")
        val netSubtotal = BigDecimal.valueOf(netSubtotalMinor, 2)
        val shippingMinor = toMinorUnits(option.cost)
        val total = netSubtotal.add(option.cost)
        if (ArsAmount.fromWire(netSubtotal) == null || ArsAmount.fromWire(total) == null) throw CommerceValidation("CHECKOUT_TOTAL_INVALID")

        // 6. Lock inventory balances -> order -> order_items -> payment -> shipment -> loyalty -> clear cart.
        lockInventoryBalances(productVariantIdentities.values.toList())

        val currencyWire = currency.name
        val hash = sha256(fingerprint + "|" + mapper.writeValueAsString(cart.lines) + "|" + mapper.writeValueAsString(delivery))
        val saga = UUID.randomUUID()
        val lineKeys = cart.lines.associate { it.sku to UUID.randomUUID() }
        val payload = mapper.createObjectNode()
            .put("addressId", addressId)
            .put("commandFingerprint", fingerprint)
            .set<com.fasterxml.jackson.databind.node.ObjectNode>("delivery", mapper.valueToTree(delivery))
            .put("currency", currencyWire)
            .put("reservationSagaKey", saga.toString())
            .set<com.fasterxml.jackson.databind.node.ObjectNode>("lines", mapper.valueToTree(cart.lines))
        if (loyaltySelection is LoyaltyCheckoutSelection.Reservation) {
            payload.withObject("loyaltyReservation")
                .put("reservationId", loyaltySelection.reservationId.toString())
                .put("expectedReservationRevision", loyaltySelection.expectedReservationRevision.value.toString())
        } else {
            payload.putNull("loyaltyReservation")
        }
        lineKeys.forEach { (sku, key) -> payload.withObject("lineKeys").put(sku, key.toString()) }

        val claimId = jdbc.query(
            "INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot,state) VALUES (?,?,?,?::jsonb,'PENDING') ON CONFLICT(customer_id,checkout_idempotency_key) DO NOTHING RETURNING id",
            { rs, _ -> rs.getLong("id") },
            customer.customerId, idempotencyKey, hash, payload.toString(),
        ).singleOrNull()
        if (claimId == null) {
            val raced = jdbc.query(
                "SELECT id,request_hash,checkout_snapshot->>'commandFingerprint' fingerprint FROM checkout_idempotency_claims WHERE customer_id=? AND checkout_idempotency_key=?",
                { rs, _ -> Triple(rs.getLong("id"), rs.getString("request_hash"), rs.getString("fingerprint")) },
                customer.customerId, idempotencyKey,
            ).singleOrNull() ?: throw CheckoutConflict()
            if (raced.second != hash || raced.third != fingerprint) throw CheckoutConflict()
            return@execute replayReceipt(raced.first) ?: throw CheckoutConflict()
        }

        cart.lines.sortedBy { productVariantIdentities.getValue(it.sku) }.forEach { line ->
            val variantId = productVariantIdentities.getValue(line.sku)
            inventory.reserve(saga, lineKeys.getValue(line.sku), variantId, line.quantity, "CUSTOMER:${customer.customerId}")
        }

        val buyer = mapper.createObjectNode()
            .put("customerId", customer.customerId)
            .put("name", buyerIdentity.name)
            .put("email", buyerIdentity.email)
        if (address != null) {
            buyer.put("addressId", addressId)
                .put("street", address.street)
                .put("number", address.number)
                .put("city", address.city)
                .put("province", address.province)
                .put("postalCode", address.postalCode)
        }

        val orderId = jdbc.queryForObject(
            "INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,status,buyer_snapshot,checkout_snapshot,subtotal,shipping_cost,total,currency) VALUES (?,?,?,?,?,'PENDING_PAYMENT',?::jsonb,?::jsonb,?,?,?,?) RETURNING id",
            Long::class.java,
            "SC-$claimId", claimId, idempotencyKey, hash, customer.customerId, buyer.toString(), payload.toString(), netSubtotal, option.cost, total, currencyWire,
        )!!

        val itemIdsByCartItemId = linkedMapOf<Long, Long>()
        cartSnapshot.items.forEach { item ->
            val line = item.view
            val offerId = line.offerRef?.toLongOrNull()
            val snapshot = mapper.createObjectNode().put("sku", line.sku).put("name", line.name).toString()
            val orderItemId = jdbc.queryForObject(
                "INSERT INTO order_items(order_id,variant_id,offer_id,campaign_reference,product_snapshot,quantity,original_unit_price,discount_amount,effective_unit_price,subtotal) VALUES (?,?,?,?,?::jsonb,?,?,?,?,?) RETURNING id",
                Long::class.java,
                orderId, item.variantId, offerId, line.campaignRef, snapshot, line.quantity,
                line.originalUnitPrice, line.discountAmount, line.effectiveUnitPrice,
                line.effectiveUnitPrice.multiply(BigDecimal(line.quantity)),
            )!!
            itemIdsByCartItemId[item.cartItemId] = orderItemId
        }

        val paymentId = jdbc.queryForObject(
            "INSERT INTO payments(order_id,external_reference,status,amount,currency) VALUES (?,?,'PENDING',?,?) RETURNING id",
            Long::class.java,
            orderId, "SC-$claimId", total, currencyWire,
        )!!
        jdbc.update("INSERT INTO shipments(order_id,status) VALUES (?,'PENDING')", orderId)

        if (preparedBind != null && loyaltySelection is LoyaltyCheckoutSelection.Reservation) {
            val frozenByCartItem = eligibility.redemptionFrozenLines!!.associateBy { it.cart.cartItemId }
            val correlations = loyaltyCartLines.map { cartLine ->
                LoyaltyOrderItemCorrelation(
                    itemIdsByCartItemId.getValue(cartLine.cartItemId),
                    frozenByCartItem.getValue(cartLine.cartItemId),
                )
            }
            loyaltyCheckout.commitRedemptionBind(
                customer = customer,
                selection = loyaltySelection,
                prepared = preparedBind,
                orderId = orderId,
                paymentId = paymentId,
                itemCorrelations = correlations,
                shippingMinor = shippingMinor,
            )
        } else {
            loyaltyCheckout.recordZeroRedemptionEarning(
                orderId = orderId,
                paymentId = paymentId,
                cartFingerprint = cartFingerprint,
                cartLines = loyaltyCartLines,
                itemIdsByCartItemId = itemIdsByCartItemId,
                eligibility = eligibility,
                shippingMinor = shippingMinor,
            )
        }

        jdbc.update("UPDATE checkout_idempotency_claims SET state='COMPLETED',updated_at=now() WHERE id=?", claimId)
        jdbc.update("DELETE FROM cart_items WHERE cart_id=?", cartId)
        CheckoutReceipt(orderId.toString(), PaymentStatus.PENDING, OrderStatus.PENDING_PAYMENT)
    } ?: throw CommerceValidation("CHECKOUT_TRANSACTION_FAILED")

    private fun replayReceipt(claimId: Long): CheckoutReceipt? {
        val order = jdbc.query("SELECT id,status FROM orders WHERE checkout_claim_id=?", { rs, _ -> rs.getLong("id") to OrderStatus.fromWire(rs.getString("status")) }, claimId).singleOrNull() ?: return null
        val accredited = jdbc.query("SELECT p.status FROM mp_order_commercial_applications c JOIN mp_checkout_attempts a ON a.id=c.attempt_id AND a.order_id=c.order_id JOIN payments p ON p.id=a.payment_id AND p.order_id=c.order_id WHERE c.order_id=? AND c.transition='PAYMENT_ACCREDITED'", { rs, _ -> PaymentStatus.fromWire(rs.getString("status")) }, order.first)
        val payments = if (accredited.isNotEmpty()) accredited else jdbc.query("SELECT status FROM payments WHERE order_id=? ORDER BY id", { rs, _ -> PaymentStatus.fromWire(rs.getString("status")) }, order.first)
        return CheckoutReceipt(order.first.toString(), payments.singleOrNull() ?: PaymentStatus.UNKNOWN, order.second)
    }

    fun attachRemoteCheckout(receipt: CheckoutReceipt): CheckoutReceipt = runCatching {
        capabilities.decide("PAYMENTS_MP", "CLAIM_CHECKOUT", CapabilityActor.System)
        val starter = mpAttempts.ifAvailable ?: return@runCatching receipt
        val url = starter.startForLocalOrder(receipt.orderId.toLong())
        if (url.isNullOrBlank()) receipt else receipt.copy(checkoutUrl = url)
    }.getOrDefault(receipt)

    private fun readBuyerIdentity(customerId: Long): BuyerSnapshotIdentity {
        val row = jdbc.query(
            "SELECT email,first_name,last_name FROM customers WHERE id=? AND active=TRUE",
            { rs, _ -> Triple(rs.getString("email"), rs.getString("first_name"), rs.getString("last_name")) },
            customerId,
        ).singleOrNull() ?: throw AuthenticationFailed()
        return BuyerSnapshotIdentity.fromCanonical(row.first, row.second, row.third)
            ?: throw BuyerIdentityUnavailable()
    }

    private fun ensureCart(customerId: Long): Long = jdbc.queryForObject(
        "INSERT INTO carts(customer_id,session_id,expires_at) VALUES (?,? ,now()+interval '7 days') ON CONFLICT (session_id) DO UPDATE SET updated_at=now(),expires_at=now()+interval '7 days' RETURNING id",
        Long::class.java, customerId, "customer-$customerId",
    )!!

    private fun snapshot(cartId: Long): CartView {
        val lines = jdbc.query(
            "SELECT v.sku,v.label,i.quantity,i.original_unit_price,i.discount_amount,i.offer_id,i.campaign_reference,i.effective_unit_price FROM cart_items i JOIN product_variants v ON v.id=i.variant_id WHERE i.cart_id=? ORDER BY i.id",
            { rs, _ -> CartLineView(rs.getString("sku"), rs.getString("label"), rs.getInt("quantity"), rs.getBigDecimal("original_unit_price"), rs.getBigDecimal("discount_amount"), rs.getObject("offer_id")?.toString(), rs.getString("campaign_reference"), rs.getBigDecimal("effective_unit_price")) },
            cartId,
        )
        val currency = installationCurrency()
        return CartView(lines, currency, deliveryPolicies.options(), sha256(mapper.writeValueAsString(listOf(currency.name, lines))))
    }

    private fun snapshotWithIds(cartId: Long): CartSnapshotWithIds {
        val items = jdbc.query(
            "SELECT i.id cart_item_id,i.variant_id,v.sku,v.label,i.quantity,i.original_unit_price,i.discount_amount,i.offer_id,i.campaign_reference,i.effective_unit_price FROM cart_items i JOIN product_variants v ON v.id=i.variant_id WHERE i.cart_id=? ORDER BY i.id FOR UPDATE OF i",
            { rs, _ ->
                CartItemWithId(
                    cartItemId = rs.getLong("cart_item_id"),
                    variantId = rs.getLong("variant_id"),
                    view = CartLineView(
                        rs.getString("sku"),
                        rs.getString("label"),
                        rs.getInt("quantity"),
                        rs.getBigDecimal("original_unit_price"),
                        rs.getBigDecimal("discount_amount"),
                        rs.getObject("offer_id")?.toString(),
                        rs.getString("campaign_reference"),
                        rs.getBigDecimal("effective_unit_price"),
                    ),
                )
            },
            cartId,
        )
        val lines = items.map { it.view }
        val currency = installationCurrency()
        val view = CartView(lines, currency, deliveryPolicies.options(), sha256(mapper.writeValueAsString(listOf(currency.name, lines))))
        return CartSnapshotWithIds(view, items)
    }

    private fun toLoyaltyCartLine(item: CartItemWithId): LoyaltyCartLine {
        val v = item.view
        val hasDiscount = v.discountAmount.compareTo(BigDecimal.ZERO) > 0 ||
            v.offerRef != null ||
            v.campaignRef != null ||
            v.originalUnitPrice.compareTo(v.effectiveUnitPrice) > 0
        val discountState = if (hasDiscount) LoyaltyDiscountState.PRESENT else LoyaltyDiscountState.NONE
        return LoyaltyCartLine(
            cartItemId = item.cartItemId,
            variantId = item.variantId,
            quantity = v.quantity.toLong(),
            originalUnitPrice = toMinorUnits(v.originalUnitPrice),
            effectiveUnitPrice = toMinorUnits(v.effectiveUnitPrice),
            discountState = discountState,
        )
    }

    private fun toMinorUnits(amount: BigDecimal): LoyaltyMinorUnits {
        val minor = runCatching { ArsAmount.fromWire(amount)?.let { amount.movePointRight(2).longValueExact() } }
            .getOrNull() ?: throw CommerceValidation("CHECKOUT_TOTAL_INVALID")
        return LoyaltyMinorUnits.fromWire(minor.toString()) ?: throw CommerceValidation("CHECKOUT_TOTAL_INVALID")
    }

    private fun installationCurrency(): PaymentCurrency = jdbc.query(
        "SELECT currency FROM installation_settings WHERE installation_id=1",
        { rs, _ -> PaymentCurrency.fromWire(rs.getString("currency")) },
    ).singleOrNull() ?: PaymentCurrency.UNKNOWN

    private data class Priced(val variantId: Long, val original: BigDecimal, val discount: BigDecimal, val effective: BigDecimal, val offerId: Long?, val campaign: String?)
    private data class CartItemWithId(val cartItemId: Long, val variantId: Long, val view: CartLineView)
    private data class CartSnapshotWithIds(val view: CartView, val items: List<CartItemWithId>)

    private fun price(sku: String): Priced {
        val (variantId, quote) = com.storecore.catalog.application.SellableSkuPrice(priceAuthority).resolve(sku)
        return Priced(variantId, quote.original, quote.original.subtract(quote.effective), quote.effective, quote.offer?.id?.toLongOrNull(), quote.offer?.name)
    }

    /** Products precede variants across every cart line; inventory balances are locked after loyalty. */
    private fun lockSellableProductsAndVariants(items: List<CartItemWithId>): Map<String, Long> {
        val identities = items.associate { item ->
            item.view.sku to (jdbc.query(
                "SELECT id,product_id FROM product_variants WHERE sku=?",
                { rs, _ -> rs.getLong("id") to rs.getLong("product_id") },
                item.view.sku,
            ).singleOrNull() ?: throw CommerceValidation("PRODUCT_NOT_SELLABLE"))
        }
        identities.values.map { it.second }.distinct().sorted().forEach { productId ->
            val status = jdbc.query(
                "SELECT status FROM products WHERE id=? FOR UPDATE",
                { rs, _ -> ProductStatus.fromWire(rs.getString("status")) },
                productId,
            ).singleOrNull()
            if (status != ProductStatus.ACTIVE) throw CommerceValidation("PRODUCT_NOT_SELLABLE")
        }
        identities.values.sortedBy { it.first }.forEach { (variantId, productId) ->
            val active = jdbc.query(
                "SELECT product_id,active FROM product_variants WHERE id=? FOR UPDATE",
                { rs, _ -> rs.getLong("product_id") to VariantStatus.fromWire(rs.getObject("active")) },
                variantId,
            ).singleOrNull()
            if (active == null || active.first != productId || active.second != VariantStatus.ACTIVE) {
                throw CommerceValidation("PRODUCT_NOT_SELLABLE")
            }
        }
        return identities.mapValues { it.value.first }
    }

    private fun lockInventoryBalances(variantIds: List<Long>) {
        variantIds.distinct().sorted().forEach { variantId ->
            jdbc.query("SELECT variant_id FROM inventory_balances WHERE variant_id=? FOR UPDATE", { rs, _ -> rs.getLong(1) }, variantId)
        }
    }
}
