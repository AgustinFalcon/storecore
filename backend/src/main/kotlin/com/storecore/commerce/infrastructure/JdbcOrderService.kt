package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.FulfillmentRejected
import com.storecore.commerce.domain.CartLineView
import com.storecore.commerce.domain.OrderView
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.application.ResourceNotFound
import com.storecore.identity.domain.CustomerPrincipal
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.time.Instant
import javax.sql.DataSource

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcOrderService(
    private val jdbc: JdbcTemplate,
    private val inventory: JdbcInventoryService,
    private val capabilities: CapabilityDecisionPort,
) {
    fun customerOrders(customer: CustomerPrincipal) = list(customer.customerId)
    fun customerOrder(customer: CustomerPrincipal, id: Long) = one(id, customer.customerId)
    fun adminOrders() = list(null)
    fun adminOrder(id: Long) = one(id, null)

    fun ship(actor: InternalUserPrincipal, orderId: Long, status: String, tracking: String?): OrderView {
        capabilities.decide("MANUAL_FULFILLMENT", "MANAGE", CapabilityActor.Internal(actor))
        val shipment = jdbc.query("SELECT id,status,tracking_code,shipped_at FROM shipments WHERE order_id=? FOR UPDATE", { rs, _ -> mapOf("id" to rs.getLong("id"), "status" to rs.getString("status"), "tracking" to rs.getString("tracking_code"), "shipped" to rs.getTimestamp("shipped_at")) }, orderId).firstOrNull()
            ?: jdbc.query("SELECT id FROM orders WHERE id=?", { rs, _ -> rs.getLong("id") }, orderId).firstOrNull()?.let {
                jdbc.queryForObject("INSERT INTO shipments(order_id,status) VALUES (?,'PENDING') RETURNING id", Long::class.java, orderId)?.let { mapOf("id" to it, "status" to "PENDING", "tracking" to null, "shipped" to null) }
            } ?: throw ResourceNotFound()
        val mapped = when (status) { "PACKED" -> "PREPARING"; "SHIPPED" -> "SHIPPED"; "DELIVERED" -> "DELIVERED"; else -> throw FulfillmentRejected() }
        val now = Instant.now()
        val shippedAt = when (mapped) {
            "SHIPPED", "DELIVERED" -> shipment["shipped"] ?: java.sql.Timestamp.from(now)
            else -> null
        }
        val deliveredAt = if (mapped == "DELIVERED") java.sql.Timestamp.from(now) else null
        val code = tracking ?: shipment["tracking"] as String?
        jdbc.update("UPDATE shipments SET status=?,tracking_code=?,shipped_at=?,delivered_at=?,updated_at=now() WHERE id=?", mapped, code, shippedAt, deliveredAt, shipment["id"])
        jdbc.update("INSERT INTO fulfillment_events(shipment_id,event_type,actor,details) VALUES (?,?,?, '{}'::jsonb)", shipment["id"], mapped, "USER:${actor.userId}")
        return adminOrder(orderId)
    }

    fun rma(actor: InternalUserPrincipal, orderId: Long, status: String): OrderView {
        capabilities.decide("MANUAL_FULFILLMENT", "MANAGE", CapabilityActor.Internal(actor))
        jdbc.query("SELECT id FROM orders WHERE id=?", { rs, _ -> rs.getLong("id") }, orderId).firstOrNull() ?: throw ResourceNotFound()
        val current = jdbc.query("SELECT id,status FROM returns WHERE order_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE", { rs, _ -> rs.getLong("id") to rs.getString("status") }, orderId).firstOrNull()
        val mapped = when (status) { "RECEIVED" -> "RETURN_RECEIVED"; "INSPECTED" -> "INSPECTED"; "ADJUSTED" -> "CLOSED"; else -> throw FulfillmentRejected() }
        val next = when {
            current == null && mapped == "RETURN_RECEIVED" -> createReturn(orderId)
            current != null && current.second == "RETURN_RECEIVED" && mapped == "INSPECTED" -> { jdbc.update("UPDATE returns SET status='INSPECTED',inspection_result='RESTOCK',updated_at=now() WHERE id=?", current.first); current.first }
            current != null && current.second == "INSPECTED" && mapped == "CLOSED" -> { restock(current.first, actor.userId); jdbc.update("UPDATE returns SET status='CLOSED',updated_at=now() WHERE id=?", current.first); current.first }
            else -> throw FulfillmentRejected()
        }
        check(next > 0)
        return adminOrder(orderId)
    }

    private fun createReturn(orderId: Long): Long {
        val id = jdbc.queryForObject("INSERT INTO returns(rma_number,order_id,status,received_at) VALUES (?,?, 'RETURN_RECEIVED', now()) RETURNING id", Long::class.java, "RMA-$orderId", orderId)!!
        jdbc.query("SELECT id,quantity FROM order_items WHERE order_id=?", { rs, _ -> rs.getLong("id") to rs.getInt("quantity") }, orderId).forEach { (itemId, qty) ->
            jdbc.update("INSERT INTO return_items(return_id,order_item_id,quantity) VALUES (?,?,?)", id, itemId, qty)
        }
        return id
    }

    private fun restock(returnId: Long, actor: Long) {
        jdbc.query("SELECT ri.id,ri.quantity,oi.variant_id FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=? AND ri.adjustment_ledger_id IS NULL", { rs, _ -> Triple(rs.getLong("id"), rs.getInt("quantity"), rs.getLong("variant_id")) }, returnId).forEach { (itemId, qty, variantId) ->
            val ledgerId = inventory.adjust(variantId, qty, "USER:$actor")
            jdbc.update("UPDATE return_items SET adjustment_ledger_id=? WHERE id=?", ledgerId, itemId)
        }
    }

    private fun list(customerId: Long?): List<OrderView> {
        val sql = """SELECT o.id FROM orders o ${if (customerId != null) "WHERE o.customer_id=?" else ""} ORDER BY o.id DESC"""
        val ids = if (customerId != null) jdbc.query(sql, { rs, _ -> rs.getLong("id") }, customerId) else jdbc.query(sql, { rs, _ -> rs.getLong("id") })
        return ids.map { one(it, customerId) }
    }

    private fun one(id: Long, customerId: Long?): OrderView {
        val sql = """SELECT o.id,o.status,o.total,COALESCE(p.status,'PENDING') payment,COALESCE(s.status,'PENDING') shipment,s.tracking_code,r.status rma
                     FROM orders o LEFT JOIN payments p ON p.order_id=o.id LEFT JOIN shipments s ON s.order_id=o.id
                     LEFT JOIN LATERAL (SELECT status FROM returns WHERE order_id=o.id ORDER BY id DESC LIMIT 1) r ON TRUE
                     WHERE o.id=? ${if (customerId != null) "AND o.customer_id=?" else ""}"""
        val row = if (customerId != null) jdbc.query(sql, mapper, id, customerId).firstOrNull() else jdbc.query(sql, mapper, id).firstOrNull()
        val header = row ?: throw ResourceNotFound()
        val lines = jdbc.query("SELECT v.sku,COALESCE(oi.product_snapshot->>'name',v.label) name,oi.quantity,oi.original_unit_price,oi.discount_amount,oi.offer_id,oi.campaign_reference,oi.effective_unit_price FROM order_items oi JOIN product_variants v ON v.id=oi.variant_id WHERE oi.order_id=? ORDER BY oi.id", { rs, _ -> CartLineView(rs.getString("sku"), rs.getString("name"), rs.getInt("quantity"), rs.getBigDecimal("original_unit_price"), rs.getBigDecimal("discount_amount"), rs.getObject("offer_id")?.toString(), rs.getString("campaign_reference"), rs.getBigDecimal("effective_unit_price")) }, id)
        return OrderView(header["id"].toString(), header["orderStatus"] as String, header["paymentStatus"] as String, header["shipmentStatus"] as String, header["tracking"] as String?, header["total"] as java.math.BigDecimal, lines, header["rmaStatus"] as String?)
    }

    private val mapper = { rs: java.sql.ResultSet, _: Int -> mapOf("id" to rs.getLong("id"), "orderStatus" to rs.getString("status"), "paymentStatus" to rs.getString("payment"), "shipmentStatus" to rs.getString("shipment"), "tracking" to rs.getString("tracking_code"), "total" to rs.getBigDecimal("total"), "rmaStatus" to rs.getString("rma")) }
}
