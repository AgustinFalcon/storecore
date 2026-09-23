package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.InsufficientInventory
import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.application.port.output.InventoryConsumePort
import com.storecore.commerce.domain.InventoryRow
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.scheduling.annotation.EnableScheduling
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID

@Service
@EnableScheduling
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcInventoryService(private val jdbc: JdbcTemplate, private val transactions: TransactionTemplate) : InventoryConsumePort {
    fun list(): List<InventoryRow> = jdbc.query(
        """SELECT v.sku,b.available_quantity,b.reserved_quantity,b.safety_stock
           FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id ORDER BY v.sku""",
    ) { rs, _ -> InventoryRow(rs.getString("sku"), rs.getInt("available_quantity"), rs.getInt("reserved_quantity"), rs.getInt("safety_stock")) }

    override fun reserve(saga: UUID, lineKey: UUID, variantId: Long, quantity: Int, actor: String): Long = transactions.execute {
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

    override fun consumeSaga(saga: UUID, actor: String): Int = transactions.execute {
        val rows = jdbc.query(
            "SELECT id,variant_id,quantity FROM inventory_reservations WHERE reservation_saga_key=? AND status='ACTIVE' FOR UPDATE",
            { rs, _ -> Triple(rs.getLong("id"), rs.getLong("variant_id"), rs.getInt("quantity")) },
            saga,
        )
        rows.forEach { (id, variantId, quantity) ->
            jdbc.query("SELECT variant_id FROM inventory_balances WHERE variant_id=? FOR UPDATE", { rs, _ -> rs.getLong(1) }, variantId)
            jdbc.update("UPDATE inventory_balances SET reserved_quantity=reserved_quantity-?,updated_at=now() WHERE variant_id=?", quantity, variantId)
            jdbc.update(
                "INSERT INTO inventory_ledger(variant_id,reservation_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,?,'SALE','WEB',?,?)",
                variantId, id, distinctKeys(1).single(), -quantity, actor,
            )
            jdbc.update("UPDATE inventory_reservations SET status='CONSUMED' WHERE id=?", id)
        }
        rows.size
    } ?: 0

    override fun consumeChannelSale(
        variantId: Long,
        quantity: Int,
        actor: String,
        externalOrderId: String,
        externalOrderItemId: String,
        variationId: String?,
    ): Long = transactions.execute {
        val existing = jdbc.query(
            "SELECT id FROM inventory_ledger WHERE channel='MERCADO_LIBRE' AND external_order_id=? AND external_order_item_id=? AND variation_id IS NOT DISTINCT FROM ?",
            { rs, _ -> rs.getLong(1) },
            externalOrderId, externalOrderItemId, variationId,
        ).firstOrNull()
        if (existing != null) return@execute existing
        val balance = lockBalance(variantId)
        if (balance.first < quantity) throw InsufficientInventory()
        jdbc.update("UPDATE inventory_balances SET available_quantity=available_quantity-?,updated_at=now() WHERE variant_id=?", quantity, variantId)
        jdbc.queryForObject(
            """INSERT INTO inventory_ledger(variant_id,event_idempotency_key,event_type,channel,external_order_id,external_order_item_id,variation_id,quantity_delta,actor)
               VALUES (?,?,'SALE','MERCADO_LIBRE',?,?,?,?,?) RETURNING id""",
            Long::class.java,
            variantId, distinctKeys(1).single(), externalOrderId, externalOrderItemId, variationId, -quantity, actor,
        )!!
    }!!

    @Scheduled(fixedDelayString = "\${storecore.inventory.expiry-delay-ms:60000}")
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

    fun adjust(variantId: Long, quantity: Int, actor: String, reason: String): Long = transactions.execute {
        if (quantity == 0) throw CommerceValidation("INVENTORY_ADJUSTMENT_MUST_BE_NON_ZERO")
        val normalizedReason = normalizeReason(reason)
        val balance = lockBalance(variantId)
        if (balance.first + quantity < 0) throw CommerceValidation("INVENTORY_ADJUSTMENT_WOULD_MAKE_AVAILABLE_NEGATIVE")
        jdbc.update("UPDATE inventory_balances SET available_quantity=available_quantity+?,updated_at=now() WHERE variant_id=?", quantity, variantId)
        appendAdjustment(variantId, quantity, actor, normalizedReason)
    }!!

    /** Sets the available (already reservation-netted) quantity, preserving reservations and safety stock. */
    fun setAvailableQuantity(variantId: Long, target: Int, actor: String, reason: String?): Long? = transactions.execute {
        if (target < 0) throw CommerceValidation("INVENTORY_AVAILABLE_QUANTITY_MUST_BE_NON_NEGATIVE")
        val current = lockBalance(variantId).first
        val delta = target - current
        if (delta == 0) return@execute null
        val normalizedReason = normalizeReason(reason ?: "")
        jdbc.update("UPDATE inventory_balances SET available_quantity=?,updated_at=now() WHERE variant_id=?", target, variantId)
        appendAdjustment(variantId, delta, actor, normalizedReason)
    }

    private fun lockBalance(variantId: Long): Pair<Int, Int> {
        jdbc.update("INSERT INTO inventory_balances(variant_id) VALUES (?) ON CONFLICT (variant_id) DO NOTHING", variantId)
        return jdbc.query("SELECT available_quantity,reserved_quantity FROM inventory_balances WHERE variant_id=? FOR UPDATE", { rs, _ -> rs.getInt("available_quantity") to rs.getInt("reserved_quantity") }, variantId).firstOrNull()
            ?: throw CommerceValidation("INVENTORY_BALANCE_NOT_FOUND")
    }

    private fun appendAdjustment(variantId: Long, delta: Int, actor: String, reason: String): Long {
        val ledgerId = jdbc.queryForObject("INSERT INTO inventory_ledger(variant_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,'ADJUSTMENT','INTERNAL',?,?) RETURNING id", Long::class.java, variantId, distinctKeys(1).single(), delta, actor)!!
        jdbc.update(
            "INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted) VALUES ('USER',?,'INVENTORY_ADJUSTED','INVENTORY_VARIANT',?,jsonb_build_object('ledgerId',?,'quantityDelta',?,'reason',?))",
            actor.removePrefix("USER:"), variantId, ledgerId, delta, reason,
        )
        return ledgerId
    }

    private fun normalizeReason(reason: String): String = reason.trim().also {
        if (it.isEmpty() || it.length > 500) throw CommerceValidation("INVENTORY_ADJUSTMENT_REASON_REQUIRED")
    }
}
