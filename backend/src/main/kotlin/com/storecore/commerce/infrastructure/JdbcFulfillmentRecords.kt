package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.FulfillmentRecordPort
import com.storecore.commerce.domain.*
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionSynchronizationManager
import java.sql.Timestamp
import java.time.Instant

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcFulfillmentRecords(private val jdbc: JdbcTemplate) : FulfillmentRecordPort {
    data class Shipment(val id: Long, val status: ShipmentStatus, val tracking: String?, val shippedAt: Timestamp?)
    fun shipment(orderId: Long) = jdbc.query("SELECT id,status,tracking_code,shipped_at FROM shipments WHERE order_id=?", { rs, _ -> Shipment(rs.getLong("id"), ShipmentStatus.fromWire(rs.getString("status")), rs.getString("tracking_code"), rs.getTimestamp("shipped_at")) }, orderId).singleOrNull()
    override fun shipmentStatus(orderId: Long) = shipment(orderId)?.status ?: ShipmentStatus.NOT_CREATED
    override fun rmaStatus(orderId: Long): RmaStatus {
        val rows = jdbc.query("SELECT status FROM returns WHERE order_id=? ORDER BY id", { rs, _ -> RmaStatus.fromWire(rs.getString("status")) }, orderId)
        return if (rows.isEmpty()) RmaStatus.NONE else rows.singleOrNull() ?: RmaStatus.UNKNOWN
    }
    override fun saveShipment(orderId: Long, step: ShipmentStep, tracking: String?, actorId: Long) {
        requireTransaction()
        val shipment = shipment(orderId)
        val id = shipment?.id ?: jdbc.queryForObject("INSERT INTO shipments(order_id,status) VALUES (?,'PENDING') RETURNING id", Long::class.java, orderId)!!
        val now = Timestamp.from(Instant.now())
        val shippedAt = if (step.target == ShipmentStatus.SHIPPED) now else shipment?.shippedAt
        val deliveredAt = if (step.target == ShipmentStatus.DELIVERED) now else null
        jdbc.update("UPDATE shipments SET status=?,tracking_code=?,shipped_at=?,delivered_at=?,updated_at=now() WHERE id=?", step.target.name, tracking ?: shipment?.tracking, shippedAt, deliveredAt, id)
        jdbc.update("INSERT INTO fulfillment_events(shipment_id,event_type,actor,details) VALUES (?,?,?, '{}'::jsonb)", id, step.target.name, "USER:$actorId")
    }
    override fun receiveReturn(orderId: Long) {
        requireTransaction()
        val id = jdbc.queryForObject("INSERT INTO returns(rma_number,order_id,status,received_at) VALUES (?,?,'RETURN_RECEIVED',now()) RETURNING id", Long::class.java, "RMA-$orderId", orderId)!!
        jdbc.query("SELECT id,quantity FROM order_items WHERE order_id=? ORDER BY id", { rs, _ -> rs.getLong("id") to rs.getInt("quantity") }, orderId).forEach { (itemId, quantity) ->
            jdbc.update("INSERT INTO return_items(return_id,order_item_id,quantity) VALUES (?,?,?)", id, itemId, quantity)
        }
    }
    private fun requireTransaction() = check(TransactionSynchronizationManager.isActualTransactionActive()) { "FULFILLMENT_TRANSACTION_REQUIRED" }
}
