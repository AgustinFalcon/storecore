package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.domain.*
import com.storecore.catalog.domain.ArsAmount
import com.storecore.catalog.domain.ProductStatus
import com.storecore.catalog.domain.VariantStatus
import com.storecore.offers.domain.DiscountKind
import com.storecore.commerce.application.BuyerIdentityUnavailable
import com.storecore.commerce.application.CheckoutConflict
import com.storecore.commerce.application.CheckoutContextChanged
import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.application.LocalOfferDiscount
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
import org.springframework.beans.factory.ObjectProvider
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.util.UUID
import javax.sql.DataSource

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
) {
    fun read(customer: CustomerPrincipal): CartView = snapshot(ensureCart(customer.customerId))

    fun putItem(customer: CustomerPrincipal, sku: String, quantity: Int): CartView {
        val cartId = ensureCart(customer.customerId)
        if (quantity <= 0) {
            jdbc.update("DELETE FROM cart_items WHERE cart_id=? AND variant_id IN (SELECT id FROM product_variants WHERE sku=?)", cartId, sku)
        } else {
            val priced = price(sku)
            jdbc.update("INSERT INTO cart_items(cart_id,variant_id,quantity,original_unit_price,discount_amount,offer_id,campaign_reference,effective_unit_price) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (cart_id,variant_id) DO UPDATE SET quantity=excluded.quantity,original_unit_price=excluded.original_unit_price,discount_amount=excluded.discount_amount,offer_id=excluded.offer_id,campaign_reference=excluded.campaign_reference,effective_unit_price=excluded.effective_unit_price", cartId, priced.variantId, quantity, priced.original, priced.discount, priced.offerId, priced.campaign, priced.effective)
        }
        return snapshot(cartId)
    }

    fun checkout(customer: CustomerPrincipal, idempotencyKey: UUID, addressId: Long?, currency: PaymentCurrency, deliveryMode:DeliveryMode, deliveryConfigurationVersion:Int, expectedCartRevision:String, expectedAddressRevision:java.time.Instant?): CheckoutReceipt {
        if(deliveryMode==DeliveryMode.UNKNOWN || deliveryConfigurationVersion<=0 || !expectedCartRevision.matches(Regex("^[0-9a-f]{64}$")) || (deliveryMode.requiresAddress && (addressId==null || addressId<=0 || expectedAddressRevision==null)) || (!deliveryMode.requiresAddress && (addressId!=null || expectedAddressRevision!=null))) throw CommerceValidation("DELIVERY_SELECTION_INVALID")
        if(currency!=PaymentCurrency.ARS) throw CommerceValidation("UNSUPPORTED_CURRENCY")
        val fingerprint=sha256(mapper.writeValueAsString(listOf(deliveryMode.name,deliveryConfigurationVersion,addressId,expectedAddressRevision?.toString(),expectedCartRevision,currency.name)))
        val existing=jdbc.query("SELECT id,request_hash,checkout_snapshot FROM checkout_idempotency_claims WHERE customer_id=? AND checkout_idempotency_key=?",{rs,_->Triple(rs.getLong("id"),rs.getString("request_hash"),rs.getString("checkout_snapshot"))},customer.customerId,idempotencyKey).singleOrNull()
        if(existing!=null) {
            val original=mapper.readTree(existing.third)
            val decision=deliveryPolicies.decision(existing.third)
            if(!currency.matchesVerified(PaymentCurrency.fromWire(original.path("currency").asText(null)))) throw CommerceValidation("UNSUPPORTED_CURRENCY")
            if(original.path("commandFingerprint").asText()!=fingerprint || decision.state!=DeliverySnapshotState.KNOWN || decision.resolvedMode()!=deliveryMode || decision.value?.configurationVersion!=deliveryConfigurationVersion) throw CheckoutConflict()
            return replayReceipt(existing.first)?.let(::withRemoteCheckout) ?: throw CommerceValidation("CHECKOUT_IN_PROGRESS")
        }
        capabilities.decide("PAYMENTS_MP", "CLAIM_CHECKOUT", CapabilityActor.System)
        val cartId=ensureCart(customer.customerId)
        jdbc.query("SELECT id FROM carts WHERE id=? FOR UPDATE",{rs,_->rs.getLong(1)},cartId).single()
        val cart = snapshot(cartId)
        if(cart.revision!=expectedCartRevision) throw CheckoutContextChanged()
        if(!currency.matchesVerified(cart.currency)) throw CommerceValidation("UNSUPPORTED_CURRENCY")
        if(cart.lines.isEmpty()) throw CommerceValidation("CART_EMPTY")
        val option=deliveryPolicies.selection(deliveryMode,deliveryConfigurationVersion)
        capabilities.decide("MANUAL_FULFILLMENT","READ",CapabilityActor.System)
        val buyerIdentity=readBuyerIdentity(customer.customerId)
        val address:DeliveryAddress?=if(deliveryMode.requiresAddress) jdbc.query("SELECT street,number,city,province,postal_code,updated_at FROM customer_addresses WHERE id=? AND customer_id=? FOR SHARE",{rs,_->
            if(rs.getTimestamp("updated_at").toInstant()!=expectedAddressRevision) throw CheckoutContextChanged()
            DeliveryPolicyTranslator.address(mapOf("street" to rs.getString("street"),"number" to rs.getString("number"),"city" to rs.getString("city"),"province" to rs.getString("province"),"postalCode" to rs.getString("postal_code")))
        },addressId,customer.customerId).singleOrNull() ?: throw ResourceNotFound() else null
        val target=if(address!=null) DeliveryDestination.Address(address) else DeliveryDestination.Pickup(option.destination!!)
        val delivery=DeliveryPolicySnapshot(option.mode,option.label,option.cost,option.minDays,option.maxDays,option.configurationVersion,target,option.instructions)
        val subtotal=cart.lines.fold(BigDecimal.ZERO) { acc,line -> acc+line.effectiveUnitPrice.multiply(BigDecimal(line.quantity)) }
        val total=subtotal+option.cost
        if(ArsAmount.fromWire(subtotal)==null || ArsAmount.fromWire(option.cost)==null || ArsAmount.fromWire(total)==null) throw CommerceValidation("CHECKOUT_TOTAL_INVALID")
        val currencyWire=currency.name
        val hash=sha256(fingerprint+"|"+mapper.writeValueAsString(cart.lines)+"|"+mapper.writeValueAsString(delivery))
        val identities = lockSellableIdentities(cart)
        val saga = UUID.randomUUID()
        val lineKeys = cart.lines.associate { it.sku to UUID.randomUUID() }
        val payload = mapper.createObjectNode().put("addressId", addressId).put("commandFingerprint",fingerprint).set<com.fasterxml.jackson.databind.node.ObjectNode>("delivery",mapper.valueToTree(delivery)).put("currency", currencyWire).put("reservationSagaKey", saga.toString()).set<com.fasterxml.jackson.databind.node.ObjectNode>("lines", mapper.valueToTree(cart.lines))
        lineKeys.forEach { (sku, key) -> payload.with("lineKeys").put(sku, key.toString()) }
        val claimId=jdbc.query("INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot,state) VALUES (?,?,?,?::jsonb,'PENDING') ON CONFLICT(customer_id,checkout_idempotency_key) DO NOTHING RETURNING id",{rs,_->rs.getLong("id")},customer.customerId,idempotencyKey,hash,payload.toString()).singleOrNull()
        if(claimId==null) {
            val raced=jdbc.query("SELECT id,request_hash,checkout_snapshot->>'commandFingerprint' fingerprint FROM checkout_idempotency_claims WHERE customer_id=? AND checkout_idempotency_key=?",{rs,_->Triple(rs.getLong("id"),rs.getString("request_hash"),rs.getString("fingerprint"))},customer.customerId,idempotencyKey).singleOrNull() ?: throw CheckoutConflict()
            if(raced.second!=hash || raced.third!=fingerprint) throw CheckoutConflict()
            return replayReceipt(raced.first)?.let(::withRemoteCheckout) ?: throw CheckoutConflict()
        }
        cart.lines.sortedBy { identities.getValue(it.sku) }.forEach { line ->
            val variantId = identities.getValue(line.sku)
            inventory.reserve(saga, lineKeys.getValue(line.sku), variantId, line.quantity, "CUSTOMER:${customer.customerId}")
        }
        val buyer = mapper.createObjectNode().put("customerId",customer.customerId).put("name",buyerIdentity.name).put("email",buyerIdentity.email)
        if(address!=null) buyer.put("addressId",addressId).put("street",address.street).put("number",address.number).put("city",address.city).put("province",address.province).put("postalCode",address.postalCode)
        val orderId = jdbc.queryForObject("INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,status,buyer_snapshot,checkout_snapshot,subtotal,shipping_cost,total,currency) VALUES (?,?,?,?,?,'PENDING_PAYMENT',?::jsonb,?::jsonb,?,?,?,?) RETURNING id", Long::class.java, "SC-$claimId", claimId, idempotencyKey, hash, customer.customerId, buyer.toString(), payload.toString(), subtotal, option.cost, total, currencyWire)!!
        cart.lines.forEach { line ->
            val variantId = identities.getValue(line.sku)
            val offerId = line.offerRef?.toLongOrNull()
            val snapshot = mapper.createObjectNode().put("sku", line.sku).put("name", line.name).toString()
            jdbc.update("INSERT INTO order_items(order_id,variant_id,offer_id,campaign_reference,product_snapshot,quantity,original_unit_price,discount_amount,effective_unit_price,subtotal) VALUES (?,?,?,?,?::jsonb,?,?,?,?,?)", orderId, variantId, offerId, line.campaignRef, snapshot, line.quantity, line.originalUnitPrice, line.discountAmount, line.effectiveUnitPrice, line.effectiveUnitPrice.multiply(BigDecimal(line.quantity)))
        }
        jdbc.update("INSERT INTO payments(order_id,external_reference,status,amount,currency) VALUES (?,?,'PENDING',?,?)", orderId, "SC-$claimId", total, currencyWire)
        jdbc.update("INSERT INTO shipments(order_id,status) VALUES (?,'PENDING')", orderId)
        jdbc.update("UPDATE checkout_idempotency_claims SET state='COMPLETED',updated_at=now() WHERE id=?", claimId)
        jdbc.update("DELETE FROM cart_items WHERE cart_id=?", ensureCart(customer.customerId))
        return withRemoteCheckout(CheckoutReceipt(orderId.toString(), PaymentStatus.PENDING, OrderStatus.PENDING_PAYMENT))
    }

    private fun replayReceipt(claimId: Long): CheckoutReceipt? {
        val order = jdbc.query("SELECT id,status FROM orders WHERE checkout_claim_id=?", { rs, _ -> rs.getLong("id") to OrderStatus.fromWire(rs.getString("status")) }, claimId).singleOrNull() ?: return null
        val accredited = jdbc.query("SELECT p.status FROM mp_order_commercial_applications c JOIN mp_checkout_attempts a ON a.id=c.attempt_id AND a.order_id=c.order_id JOIN payments p ON p.id=a.payment_id AND p.order_id=c.order_id WHERE c.order_id=? AND c.transition='PAYMENT_ACCREDITED'", { rs, _ -> PaymentStatus.fromWire(rs.getString("status")) }, order.first)
        val payments = if (accredited.isNotEmpty()) accredited else jdbc.query("SELECT status FROM payments WHERE order_id=? ORDER BY id", { rs, _ -> PaymentStatus.fromWire(rs.getString("status")) }, order.first)
        return CheckoutReceipt(order.first.toString(), payments.singleOrNull() ?: PaymentStatus.UNKNOWN, order.second)
    }

    private fun withRemoteCheckout(receipt: CheckoutReceipt): CheckoutReceipt {
        capabilities.decide("PAYMENTS_MP", "CLAIM_CHECKOUT", CapabilityActor.System)
        val starter = mpAttempts.ifAvailable ?: return receipt
        val url = runCatching { starter.startForLocalOrder(receipt.orderId.toLong()) }.getOrNull()
        return if (url.isNullOrBlank()) receipt else receipt.copy(checkoutUrl = url)
    }

    private fun readBuyerIdentity(customerId: Long): BuyerSnapshotIdentity {
        val row = jdbc.query(
            "SELECT email,first_name,last_name FROM customers WHERE id=? AND active=TRUE",
            { rs, _ -> Triple(rs.getString("email"), rs.getString("first_name"), rs.getString("last_name")) },
            customerId,
        ).singleOrNull() ?: throw AuthenticationFailed()
        return BuyerSnapshotIdentity.fromCanonical(row.first, row.second, row.third)
            ?: throw BuyerIdentityUnavailable()
    }

    private fun ensureCart(customerId: Long): Long = jdbc.queryForObject("INSERT INTO carts(customer_id,session_id,expires_at) VALUES (?,? ,now()+interval '7 days') ON CONFLICT (session_id) DO UPDATE SET updated_at=now(),expires_at=now()+interval '7 days' RETURNING id", Long::class.java, customerId, "customer-$customerId")!!

    private fun snapshot(cartId: Long): CartView {
        val lines = jdbc.query("SELECT v.sku,v.label,i.quantity,i.original_unit_price,i.discount_amount,i.offer_id,i.campaign_reference,i.effective_unit_price FROM cart_items i JOIN product_variants v ON v.id=i.variant_id WHERE i.cart_id=? ORDER BY i.id", { rs, _ -> CartLineView(rs.getString("sku"), rs.getString("label"), rs.getInt("quantity"), rs.getBigDecimal("original_unit_price"), rs.getBigDecimal("discount_amount"), rs.getObject("offer_id")?.toString(), rs.getString("campaign_reference"), rs.getBigDecimal("effective_unit_price")) }, cartId)
        val currency=installationCurrency()
        return CartView(lines,currency,deliveryPolicies.options(),sha256(mapper.writeValueAsString(listOf(currency.name,lines))))
    }

    private fun installationCurrency(): PaymentCurrency = jdbc.query(
        "SELECT currency FROM installation_settings WHERE installation_id=1",
        { rs, _ -> PaymentCurrency.fromWire(rs.getString("currency")) },
    ).singleOrNull() ?: PaymentCurrency.UNKNOWN

    private data class Priced(val variantId: Long, val original: BigDecimal, val discount: BigDecimal, val effective: BigDecimal, val offerId: Long?, val campaign: String?)

    private fun price(sku: String): Priced {
        val (variantId,quote)=com.storecore.catalog.application.SellableSkuPrice(priceAuthority).resolve(sku)
        return Priced(variantId,quote.original,quote.original.subtract(quote.effective),quote.effective,quote.offer?.id?.toLongOrNull(),quote.offer?.name)
    }

    /** Products precede variants, which precede balances, across every cart line. */
    private fun lockSellableIdentities(cart: CartView): Map<String, Long> {
        val identities = cart.lines.associate { line ->
            line.sku to (jdbc.query("SELECT id,product_id FROM product_variants WHERE sku=?",
                { rs, _ -> rs.getLong("id") to rs.getLong("product_id") }, line.sku).singleOrNull()
                ?: throw CommerceValidation("PRODUCT_NOT_SELLABLE"))
        }
        identities.values.map { it.second }.distinct().sorted().forEach { productId ->
            val status = jdbc.query("SELECT status FROM products WHERE id=? FOR NO KEY UPDATE",
                { rs, _ -> ProductStatus.fromWire(rs.getString("status")) }, productId).singleOrNull()
            if (status != ProductStatus.ACTIVE) throw CommerceValidation("PRODUCT_NOT_SELLABLE")
        }
        identities.values.sortedBy { it.first }.forEach { (variantId, productId) ->
            val active = jdbc.query("SELECT product_id,active FROM product_variants WHERE id=? FOR NO KEY UPDATE",
                { rs, _ -> rs.getLong("product_id") to VariantStatus.fromWire(rs.getObject("active")) }, variantId).singleOrNull()
            if (active == null || active.first != productId || active.second != VariantStatus.ACTIVE)
                throw CommerceValidation("PRODUCT_NOT_SELLABLE")
        }
        identities.values.map { it.first }.sorted().forEach { variantId ->
            jdbc.query("SELECT variant_id FROM inventory_balances WHERE variant_id=? FOR UPDATE", { rs, _ -> rs.getLong(1) }, variantId)
        }
        return identities.mapValues { it.value.first }
    }
}
