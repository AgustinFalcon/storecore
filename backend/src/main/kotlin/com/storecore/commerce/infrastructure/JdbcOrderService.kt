package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.FulfillmentRejected
import com.storecore.commerce.domain.CartLineView
import com.storecore.commerce.domain.FulfillmentCommand
import com.storecore.commerce.domain.FulfillmentNextAction
import com.storecore.commerce.domain.OrderStatus
import com.storecore.commerce.domain.OrderView
import com.storecore.commerce.domain.RmaStatus
import com.storecore.commerce.domain.RmaTransition
import com.storecore.commerce.domain.ShipmentStatus
import com.storecore.commerce.domain.ShipmentTransition
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
        val orderStatus = jdbc.query("SELECT status FROM orders WHERE id=?", { rs, _ -> rs.getString("status") }, orderId).firstOrNull()
            ?: throw ResourceNotFound()
        val shipment = jdbc.query("SELECT id,status,tracking_code,shipped_at FROM shipments WHERE order_id=? FOR UPDATE", { rs, _ -> mapOf("id" to rs.getLong("id"), "status" to rs.getString("status"), "tracking" to rs.getString("tracking_code"), "shipped" to rs.getTimestamp("shipped_at")) }, orderId).firstOrNull()
            ?: jdbc.query("SELECT id FROM orders WHERE id=?", { rs, _ -> rs.getLong("id") }, orderId).firstOrNull()?.let {
                jdbc.queryForObject("INSERT INTO shipments(order_id,status) VALUES (?,?) RETURNING id", Long::class.java, orderId, ShipmentStatus.Pending.wire)?.let { mapOf("id" to it, "status" to ShipmentStatus.Pending.wire, "tracking" to null, "shipped" to null) }
            } ?: throw ResourceNotFound()
        val stored = FulfillmentCommand.storedShipment(
            OrderStatus.fromWire(orderStatus),
            ShipmentStatus.fromWire(shipment["status"] as String?),
            ShipmentTransition.fromWire(status),
        ) ?: throw FulfillmentRejected()
        val now = Instant.now()
        val shippedAt = when (stored) {
            is ShipmentStatus.Shipped, is ShipmentStatus.Delivered -> shipment["shipped"] ?: java.sql.Timestamp.from(now)
            else -> null
        }
        val deliveredAt = if (stored is ShipmentStatus.Delivered) java.sql.Timestamp.from(now) else null
        val code = tracking ?: shipment["tracking"] as String?
        jdbc.update("UPDATE shipments SET status=?,tracking_code=?,shipped_at=?,delivered_at=?,updated_at=now() WHERE id=?", stored.wire, code, shippedAt, deliveredAt, shipment["id"])
        jdbc.update("INSERT INTO fulfillment_events(shipment_id,event_type,actor,details) VALUES (?,?,?, '{}'::jsonb)", shipment["id"], stored.wire, "USER:${actor.userId}")
        return adminOrder(orderId)
    }

    fun rma(actor: InternalUserPrincipal, orderId: Long, status: String): OrderView {
        capabilities.decide("MANUAL_FULFILLMENT", "MANAGE", CapabilityActor.Internal(actor))
        val orderStatus = jdbc.query("SELECT status FROM orders WHERE id=?", { rs, _ -> rs.getString("status") }, orderId).firstOrNull()
            ?: throw ResourceNotFound()
        val current = jdbc.query("SELECT id,status FROM returns WHERE order_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE", { rs, _ -> rs.getLong("id") to rs.getString("status") }, orderId).firstOrNull()
        val stored = FulfillmentCommand.storedRma(
            OrderStatus.fromWire(orderStatus),
            RmaStatus.fromOptionalWire(current?.second),
            RmaTransition.fromWire(status),
        ) ?: throw FulfillmentRejected()
        val next = when (stored) {
            is RmaStatus.ReturnReceived -> if (current == null) createReturn(orderId) else throw FulfillmentRejected()
            is RmaStatus.Inspected -> {
                val id = current?.first ?: throw FulfillmentRejected()
                jdbc.update("UPDATE returns SET status=?,inspection_result='RESTOCK',updated_at=now() WHERE id=?", stored.wire, id)
                id
            }
            is RmaStatus.Closed -> {
                val id = current?.first ?: throw FulfillmentRejected()
                restock(id, actor.userId)
                jdbc.update("UPDATE returns SET status=?,updated_at=now() WHERE id=?", stored.wire, id)
                id
            }
            else -> throw FulfillmentRejected()
        }
        check(next > 0)
        return adminOrder(orderId)
    }

    private fun createReturn(orderId: Long): Long {
        val id = jdbc.queryForObject("INSERT INTO returns(rma_number,order_id,status,received_at) VALUES (?,?, ?, now()) RETURNING id", Long::class.java, "RMA-$orderId", orderId, RmaStatus.ReturnReceived.wire)!!
        jdbc.query("SELECT id,quantity FROM order_items WHERE order_id=?", { rs, _ -> rs.getLong("id") to rs.getInt("quantity") }, orderId).forEach { (itemId, qty) ->
            jdbc.update("INSERT INTO return_items(return_id,order_item_id,quantity) VALUES (?,?,?)", id, itemId, qty)
        }
        return id
    }

    private fun restock(returnId: Long, actor: Long) {
        jdbc.query("SELECT ri.id,ri.quantity,oi.variant_id FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=? AND ri.adjustment_ledger_id IS NULL", { rs, _ -> Triple(rs.getLong("id"), rs.getInt("quantity"), rs.getLong("variant_id")) }, returnId).forEach { (itemId, qty, variantId) ->
            val ledgerId = inventory.adjust(variantId, qty, "USER:$actor", "RMA_RESTOCK:$returnId")
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
        val orderStatus = header["orderStatus"] as String
        val shipmentStatus = header["shipmentStatus"] as String
        val rmaStatus = header["rmaStatus"] as String?
        return OrderView(header["id"].toString(), orderStatus, header["paymentStatus"] as String, shipmentStatus, header["tracking"] as String?, header["total"] as java.math.BigDecimal, lines, rmaStatus, FulfillmentNextAction.ship(orderStatus, shipmentStatus), FulfillmentNextAction.rma(orderStatus, rmaStatus))
    }

    private val mapper = { rs: java.sql.ResultSet, _: Int -> mapOf("id" to rs.getLong("id"), "orderStatus" to rs.getString("status"), "paymentStatus" to rs.getString("payment"), "shipmentStatus" to rs.getString("shipment"), "tracking" to rs.getString("tracking_code"), "total" to rs.getBigDecimal("total"), "rmaStatus" to rs.getString("rma")) }
}
