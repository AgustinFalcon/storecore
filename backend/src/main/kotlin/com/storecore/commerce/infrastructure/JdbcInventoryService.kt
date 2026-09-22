package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.InsufficientInventory
import com.storecore.commerce.domain.InventoryRow
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcInventoryService(private val jdbc: JdbcTemplate, private val transactions: TransactionTemplate) {
    fun list(): List<InventoryRow> = jdbc.query(
        """SELECT v.sku,b.available_quantity,b.reserved_quantity,b.safety_stock
           FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id ORDER BY v.sku""",
    ) { rs, _ -> InventoryRow(rs.getString("sku"), rs.getInt("available_quantity"), rs.getInt("reserved_quantity"), rs.getInt("safety_stock")) }

    fun reserve(saga: UUID, lineKey: UUID, variantId: Long, quantity: Int, actor: String): Long = transactions.execute {
        val existing = jdbc.query("SELECT id FROM inventory_reservations WHERE reservation_line_key=? OR (reservation_saga_key=? AND variant_id=?)", { rs, _ -> rs.getLong("id") }, lineKey, saga, variantId).firstOrNull()
        if (existing != null) existing else {
        val balance = jdbc.query("SELECT available_quantity,safety_stock FROM inventory_balances WHERE variant_id=? FOR UPDATE", { rs, _ -> rs.getInt("available_quantity") to rs.getInt("safety_stock") }, variantId).firstOrNull()
            ?: throw InsufficientInventory()
        if (balance.first - balance.second < quantity) throw InsufficientInventory()
        jdbc.update("UPDATE inventory_balances SET available_quantity=available_quantity-?,reserved_quantity=reserved_quantity+?,updated_at=now() WHERE variant_id=?", quantity, quantity, variantId)
        val reservationId = jdbc.queryForObject("INSERT INTO inventory_reservations(variant_id,reservation_saga_key,reservation_line_key,quantity,status,expires_at) VALUES (?,?,?,?,'ACTIVE',now()+interval '30 minutes') RETURNING id", Long::class.java, variantId, saga, lineKey, quantity)!!
        jdbc.update("INSERT INTO inventory_ledger(variant_id,reservation_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,?,'RESERVATION','WEB',?,?)", variantId, reservationId, distinctKeys(1).single(), -quantity, actor)
            reservationId
        }
    }!!

    fun expireOverdue() {
        transactions.executeWithoutResult {
            val overdue = jdbc.query("SELECT id,variant_id,quantity FROM inventory_reservations WHERE status='ACTIVE' AND expires_at<=clock_timestamp() FOR UPDATE", { rs, _ -> Triple(rs.getLong("id"), rs.getLong("variant_id"), rs.getInt("quantity")) })
            overdue.forEach { (id, variantId, quantity) ->
                jdbc.query("SELECT variant_id FROM inventory_balances WHERE variant_id=? FOR UPDATE", { rs, _ -> rs.getLong(1) }, variantId)
                jdbc.update("INSERT INTO inventory_ledger(variant_id,reservation_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,?,'RELEASE','WEB',?,?)", variantId, id, distinctKeys(1).single(), quantity, "EXPIRY")
                jdbc.update("UPDATE inventory_balances SET available_quantity=available_quantity+?,reserved_quantity=reserved_quantity-?,updated_at=now() WHERE variant_id=?", quantity, quantity, variantId)
                jdbc.update("UPDATE inventory_reservations SET status='EXPIRED' WHERE id=?", id)
            }
        }
    }

    fun adjust(variantId: Long, quantity: Int, actor: String): Long = transactions.execute {
        jdbc.update("UPDATE inventory_balances SET available_quantity=available_quantity+?,updated_at=now() WHERE variant_id=?", quantity, variantId)
        jdbc.queryForObject("INSERT INTO inventory_ledger(variant_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,'ADJUSTMENT','INTERNAL',?,?) RETURNING id", Long::class.java, variantId, distinctKeys(1).single(), quantity, actor)!!
    }!!
}
