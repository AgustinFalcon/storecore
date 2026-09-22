package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.CheckoutConflict
import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.domain.CartLineView
import com.storecore.commerce.domain.CartView
import com.storecore.commerce.domain.CheckoutReceipt
import com.storecore.commerce.infrastructure.mporders.MpCheckoutAttemptService
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
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
    private val jdbc: JdbcTemplate,
    private val mapper: ObjectMapper,
    private val inventory: JdbcInventoryService,
    private val capabilities: CapabilityDecisionPort,
    private val mpAttempts: ObjectProvider<MpCheckoutAttemptService>,
) {
    fun read(customer: CustomerPrincipal): CartView = snapshot(ensureCart(customer.customerId))

    fun putItem(customer: CustomerPrincipal, sku: String, quantity: Int): CartView {
        val cartId = ensureCart(customer.customerId)
        val priced = price(sku)
        if (quantity <= 0) jdbc.update("DELETE FROM cart_items WHERE cart_id=? AND variant_id=?", cartId, priced.variantId)
        else jdbc.update("INSERT INTO cart_items(cart_id,variant_id,quantity,original_unit_price,discount_amount,offer_id,campaign_reference,effective_unit_price) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (cart_id,variant_id) DO UPDATE SET quantity=excluded.quantity,original_unit_price=excluded.original_unit_price,discount_amount=excluded.discount_amount,offer_id=excluded.offer_id,campaign_reference=excluded.campaign_reference,effective_unit_price=excluded.effective_unit_price", cartId, priced.variantId, quantity, priced.original, priced.discount, priced.offerId, priced.campaign, priced.effective)
        return snapshot(cartId)
    }

    fun checkout(customer: CustomerPrincipal, idempotencyKey: UUID, addressId: Long, currency: String): CheckoutReceipt {
        capabilities.decide("PAYMENTS_MP", "CLAIM_CHECKOUT", CapabilityActor.System)
        if (currency != "ARS") throw CommerceValidation("UNSUPPORTED_CURRENCY")
        val cart = snapshot(ensureCart(customer.customerId))
        val hash = sha256("$addressId|$currency|${cart.lines}")
        val existing = jdbc.query("SELECT id,request_hash,checkout_snapshot FROM checkout_idempotency_claims WHERE customer_id=? AND checkout_idempotency_key=?", { rs, _ -> Triple(rs.getLong("id"), rs.getString("request_hash"), rs.getString("checkout_snapshot")) }, customer.customerId, idempotencyKey).firstOrNull()
        if (existing != null) {
            val original = mapper.readTree(existing.third)
            if (original.path("addressId").asLong() != addressId || original.path("currency").asText() != currency) throw CheckoutConflict()
            if (cart.lines.isNotEmpty() && existing.second != hash) throw CheckoutConflict()
            val replayed = jdbc.query("SELECT o.id,o.status,p.status payment FROM orders o LEFT JOIN payments p ON p.order_id=o.id WHERE o.checkout_claim_id=?", { rs, _ -> CheckoutReceipt(rs.getLong("id").toString(), rs.getString("payment") ?: "PENDING", rs.getString("status")) }, existing.first).firstOrNull()
            if (replayed != null) return withRemoteCheckout(replayed)
            throw CommerceValidation("CHECKOUT_IN_PROGRESS")
        }
        val address = jdbc.query("SELECT street,number,city,province,postal_code FROM customer_addresses WHERE id=? AND customer_id=?", { rs, _ -> mapOf("street" to rs.getString("street"), "number" to rs.getString("number"), "city" to rs.getString("city"), "province" to rs.getString("province"), "postalCode" to rs.getString("postal_code")) }, addressId, customer.customerId).firstOrNull() ?: throw ResourceNotFound()
        if (cart.lines.isEmpty()) throw CommerceValidation("CART_EMPTY")
        val saga = UUID.randomUUID()
        val lineKeys = cart.lines.associate { it.sku to UUID.randomUUID() }
        val payload = mapper.createObjectNode().put("addressId", addressId).put("currency", currency).put("reservationSagaKey", saga.toString()).set<com.fasterxml.jackson.databind.node.ObjectNode>("address", mapper.valueToTree(address)).set<com.fasterxml.jackson.databind.node.ObjectNode>("lines", mapper.valueToTree(cart.lines))
        lineKeys.forEach { (sku, key) -> payload.with("lineKeys").put(sku, key.toString()) }
        val claimId = try {
            jdbc.queryForObject("INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot,state) VALUES (?,?,?,?::jsonb,'PENDING') RETURNING id", Long::class.java, customer.customerId, idempotencyKey, hash, payload.toString())!!
        } catch (exception: org.springframework.dao.DataIntegrityViolationException) {
            val raced = jdbc.query("SELECT id,request_hash FROM checkout_idempotency_claims WHERE customer_id=? AND checkout_idempotency_key=?", { rs, _ -> rs.getLong("id") to rs.getString("request_hash") }, customer.customerId, idempotencyKey).firstOrNull() ?: throw CheckoutConflict()
            if (raced.second != hash) throw CheckoutConflict()
            val replayed = jdbc.query("SELECT o.id,o.status,p.status payment FROM orders o LEFT JOIN payments p ON p.order_id=o.id WHERE o.checkout_claim_id=?", { rs, _ -> CheckoutReceipt(rs.getLong("id").toString(), rs.getString("payment") ?: "PENDING", rs.getString("status")) }, raced.first).firstOrNull()
            return replayed?.let(::withRemoteCheckout) ?: throw CheckoutConflict()
        }
        cart.lines.forEach { line ->
            val variantId = jdbc.queryForObject("SELECT id FROM product_variants WHERE sku=?", Long::class.java, line.sku)!!
            inventory.reserve(saga, lineKeys.getValue(line.sku), variantId, line.quantity, "CUSTOMER:${customer.customerId}")
        }
        val subtotal = cart.lines.fold(BigDecimal.ZERO) { acc, line -> acc + line.effectiveUnitPrice.multiply(BigDecimal(line.quantity)) }
        val buyer = mapper.createObjectNode().put("customerId", customer.customerId).put("addressId", addressId).put("street", address["street"]).put("number", address["number"]).put("city", address["city"]).put("province", address["province"]).put("postalCode", address["postalCode"])
        val orderId = jdbc.queryForObject("INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,status,buyer_snapshot,checkout_snapshot,subtotal,shipping_cost,total,currency) VALUES (?,?,?,?,?,'PENDING_PAYMENT',?::jsonb,?::jsonb,?,0,?,?) RETURNING id", Long::class.java, "SC-$claimId", claimId, idempotencyKey, hash, customer.customerId, buyer.toString(), payload.toString(), subtotal, subtotal, "ARS")!!
        cart.lines.forEach { line ->
            val variantId = jdbc.queryForObject("SELECT id FROM product_variants WHERE sku=?", Long::class.java, line.sku)!!
            val offerId = line.offerRef?.toLongOrNull()
            val snapshot = mapper.createObjectNode().put("sku", line.sku).put("name", line.name).toString()
            jdbc.update("INSERT INTO order_items(order_id,variant_id,offer_id,campaign_reference,product_snapshot,quantity,original_unit_price,discount_amount,effective_unit_price,subtotal) VALUES (?,?,?,?,?::jsonb,?,?,?,?,?)", orderId, variantId, offerId, line.campaignRef, snapshot, line.quantity, line.originalUnitPrice, line.discountAmount, line.effectiveUnitPrice, line.effectiveUnitPrice.multiply(BigDecimal(line.quantity)))
        }
        jdbc.update("INSERT INTO payments(order_id,external_reference,status,amount,currency) VALUES (?,?,'PENDING',?,'ARS')", orderId, "SC-$claimId", subtotal)
        jdbc.update("INSERT INTO shipments(order_id,status) VALUES (?,'PENDING')", orderId)
        jdbc.update("UPDATE checkout_idempotency_claims SET state='COMPLETED',updated_at=now() WHERE id=?", claimId)
        jdbc.update("DELETE FROM cart_items WHERE cart_id=?", ensureCart(customer.customerId))
        return withRemoteCheckout(CheckoutReceipt(orderId.toString(), "PENDING", "PENDING_PAYMENT"))
    }

    private fun withRemoteCheckout(receipt: CheckoutReceipt): CheckoutReceipt {
        val starter = mpAttempts.ifAvailable ?: return receipt
        val url = runCatching { starter.startForLocalOrder(receipt.orderId.toLong()) }.getOrNull()
        return if (url.isNullOrBlank()) receipt else receipt.copy(checkoutUrl = url)
    }

    private fun ensureCart(customerId: Long): Long = jdbc.queryForObject("INSERT INTO carts(customer_id,session_id,expires_at) VALUES (?,? ,now()+interval '7 days') ON CONFLICT (session_id) DO UPDATE SET updated_at=now(),expires_at=now()+interval '7 days' RETURNING id", Long::class.java, customerId, "customer-$customerId")!!

    private fun snapshot(cartId: Long): CartView {
        val lines = jdbc.query("SELECT v.sku,v.label,i.quantity,i.original_unit_price,i.discount_amount,i.offer_id,i.campaign_reference,i.effective_unit_price FROM cart_items i JOIN product_variants v ON v.id=i.variant_id WHERE i.cart_id=? ORDER BY i.id", { rs, _ -> CartLineView(rs.getString("sku"), rs.getString("label"), rs.getInt("quantity"), rs.getBigDecimal("original_unit_price"), rs.getBigDecimal("discount_amount"), rs.getObject("offer_id")?.toString(), rs.getString("campaign_reference"), rs.getBigDecimal("effective_unit_price")) }, cartId)
        return CartView(lines, "ARS")
    }

    private data class Priced(val variantId: Long, val original: BigDecimal, val discount: BigDecimal, val effective: BigDecimal, val offerId: Long?, val campaign: String?)

    private fun price(sku: String): Priced {
        val row = jdbc.query("SELECT v.id,p.id product_id,p.base_price FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.sku=? AND p.status='ACTIVE' AND v.active", { rs, _ -> Triple(rs.getLong("id"), rs.getLong("product_id"), rs.getBigDecimal("base_price")) }, sku).firstOrNull() ?: throw ResourceNotFound()
        val offer = jdbc.query("SELECT o.id,o.name,o.discount_type,o.discount_value FROM offers o JOIN offer_products op ON op.offer_id=o.id WHERE op.product_id=? AND o.status='ACTIVE' AND now() BETWEEN o.starts_at AND o.ends_at ORDER BY o.priority DESC,o.id LIMIT 1", { rs, _ -> mapOf("id" to rs.getLong("id"), "name" to rs.getString("name"), "type" to rs.getString("discount_type"), "value" to rs.getBigDecimal("discount_value")) }, row.second).firstOrNull()
        val original = row.third
        val discount = when (offer?.get("type")) {
            "PERCENT" -> original.multiply(offer["value"] as BigDecimal).divide(BigDecimal(100), 2, java.math.RoundingMode.HALF_UP).min(original)
            "FIXED" -> (offer["value"] as BigDecimal).min(original)
            else -> BigDecimal.ZERO
        }
        return Priced(row.first, original, discount, original.subtract(discount), offer?.get("id") as Long?, offer?.get("name") as String?)
    }
}
