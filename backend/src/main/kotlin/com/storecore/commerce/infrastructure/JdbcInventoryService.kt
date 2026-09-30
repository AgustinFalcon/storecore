package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.DesiredStockProjectionUseCase
import com.storecore.commerce.application.InsufficientInventory
import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.application.port.output.InventoryConsumePort
import com.storecore.commerce.application.port.output.InventoryReserveLine
import com.storecore.commerce.domain.InventoryRow
import com.storecore.commerce.domain.ProjectionSourceCause
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.application.ResourceNotFound
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
class JdbcInventoryService(
    private val jdbc: JdbcTemplate,
    private val transactions: TransactionTemplate,
    private val projection: DesiredStockProjectionUseCase,
) : InventoryConsumePort {
    fun list(): List<InventoryRow> = jdbc.query(
        """SELECT v.sku,b.available_quantity,b.reserved_quantity,b.safety_stock
           FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id ORDER BY v.sku""",
    ) { rs, _ -> InventoryRow(rs.getString("sku"), rs.getInt("available_quantity"), rs.getInt("reserved_quantity"), rs.getInt("safety_stock")) }

    fun variantIdBySku(sku: String): Long =
        jdbc.query("SELECT id FROM product_variants WHERE sku=?", { rs, _ -> rs.getLong("id") }, sku).firstOrNull()
            ?: throw ResourceNotFound()

    override fun reserve(saga: UUID, lineKey: UUID, variantId: Long, quantity: Int, actor: String): Long =
        reserveAll(saga, listOf(InventoryReserveLine(lineKey, variantId, quantity)), actor).single()

    override fun reserveAll(saga: UUID, lines: List<InventoryReserveLine>, actor: String): List<Long> {
        if (lines.isEmpty()) return emptyList()
        return transactions.execute {
            val variantIds = lines.map { it.variantId }
            val emit = acquireScope(variantIds)
            val ids = lines.sortedBy { it.variantId }.map { line -> reserveRow(saga, line, actor) }
            projectIfEligible(emit, variantIds, ProjectionSourceCause.WebReserve)
            ids
        }!!
    }

    override fun consumeSaga(saga: UUID, actor: String, orderId: Long?, attemptId: Long?): Int = transactions.execute {
        val discovered = jdbc.query(
            "SELECT variant_id FROM inventory_reservations WHERE reservation_saga_key=?",
            { rs, _ -> rs.getLong(1) },
            saga,
        )
        if (discovered.isEmpty()) return@execute 0
        val emit = acquireScope(discovered, orderId, attemptId, reservationSaga = saga)
        val rows = jdbc.query(
            "SELECT id,variant_id,quantity,status FROM inventory_reservations WHERE reservation_saga_key=? ORDER BY variant_id, id",
            { rs, _ -> ReservationRow(rs.getLong("id"), rs.getLong("variant_id"), rs.getInt("quantity"), rs.getString("status")) },
            saga,
        )
        val active = rows.filter { it.status == "ACTIVE" }
        active.forEach { row ->
            jdbc.update("UPDATE inventory_balances SET reserved_quantity=reserved_quantity-?,updated_at=now() WHERE variant_id=?", row.quantity, row.variantId)
            jdbc.update(
                "INSERT INTO inventory_ledger(variant_id,reservation_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,?,'SALE','WEB',?,?)",
                row.variantId, row.id, distinctKeys(1).single(), -row.quantity, actor,
            )
            jdbc.update("UPDATE inventory_reservations SET status='CONSUMED' WHERE id=?", row.id)
        }
        projectIfEligible(emit, discovered, ProjectionSourceCause.WebConsume)
        active.size
    } ?: 0

    override fun releaseSaga(saga: UUID, actor: String, orderId: Long?, attemptId: Long?): Int = transactions.execute {
        val discovered = jdbc.query(
            "SELECT id,variant_id,quantity,status FROM inventory_reservations WHERE reservation_saga_key=?",
            { rs, _ -> ReservationRow(rs.getLong("id"), rs.getLong("variant_id"), rs.getInt("quantity"), rs.getString("status")) },
            saga,
        )
        if (discovered.isEmpty()) return@execute 0
        if (discovered.any { it.status == "CONSUMED" }) return@execute 0
        val emit = acquireScope(discovered.map { it.variantId }, orderId, attemptId, reservationSaga = saga)
        val rows = jdbc.query(
            "SELECT id,variant_id,quantity,status FROM inventory_reservations WHERE reservation_saga_key=? ORDER BY variant_id, id",
            { rs, _ -> ReservationRow(rs.getLong("id"), rs.getLong("variant_id"), rs.getInt("quantity"), rs.getString("status")) },
            saga,
        )
        if (rows.any { it.status == "CONSUMED" }) return@execute 0
        val active = rows.filter { it.status == "ACTIVE" }
        if (active.isEmpty()) {
            projectIfEligible(emit, rows.map { it.variantId }, ProjectionSourceCause.WebRelease)
            return@execute 0
        }
        active.forEach { row ->
            jdbc.update(
                "INSERT INTO inventory_ledger(variant_id,reservation_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,?,'RELEASE','WEB',?,?)",
                row.variantId, row.id, distinctKeys(1).single(), row.quantity, actor,
            )
            jdbc.update(
                "UPDATE inventory_balances SET available_quantity=available_quantity+?,reserved_quantity=reserved_quantity-?,updated_at=now() WHERE variant_id=?",
                row.quantity, row.quantity, row.variantId,
            )
            jdbc.update("UPDATE inventory_reservations SET status='RELEASED' WHERE id=?", row.id)
        }
        projectIfEligible(emit, rows.map { it.variantId }, ProjectionSourceCause.WebRelease)
        active.size
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
            val overdue = jdbc.query(
                "SELECT id,variant_id,quantity FROM inventory_reservations WHERE status='ACTIVE' AND expires_at<=clock_timestamp() ORDER BY variant_id, id LIMIT 50",
                { rs, _ -> Triple(rs.getLong("id"), rs.getLong("variant_id"), rs.getInt("quantity")) },
            )
            if (overdue.isEmpty()) return@executeWithoutResult
            val emit = acquireScope(overdue.map { it.second }, reservationIds = overdue.map { it.first })
            overdue.forEach { (id, variantId, quantity) ->
                val status = jdbc.queryForObject("SELECT status FROM inventory_reservations WHERE id=?", String::class.java, id)
                if (status != "ACTIVE") return@forEach
                jdbc.update(
                    "INSERT INTO inventory_ledger(variant_id,reservation_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,?,'RELEASE','WEB',?,?)",
                    variantId, id, distinctKeys(1).single(), quantity, "EXPIRY",
                )
                jdbc.update(
                    "UPDATE inventory_balances SET available_quantity=available_quantity+?,reserved_quantity=reserved_quantity-?,updated_at=now() WHERE variant_id=?",
                    quantity, quantity, variantId,
                )
                jdbc.update("UPDATE inventory_reservations SET status='EXPIRED' WHERE id=?", id)
            }
            projectIfEligible(emit, overdue.map { it.second }, ProjectionSourceCause.WebExpiry)
        }
    }

    fun adjust(variantId: Long, quantity: Int, actor: String, reason: String): Long = transactions.execute {
        if (quantity == 0) throw CommerceValidation("INVENTORY_ADJUSTMENT_MUST_BE_NON_ZERO")
        val emit = acquireScope(listOf(variantId))
        val normalizedReason = normalizeReason(reason)
        val balance = lockBalance(variantId)
        if (balance.first + quantity < 0) throw CommerceValidation("INVENTORY_ADJUSTMENT_WOULD_MAKE_AVAILABLE_NEGATIVE")
        jdbc.update("UPDATE inventory_balances SET available_quantity=available_quantity+?,updated_at=now() WHERE variant_id=?", quantity, variantId)
        val ledgerId = appendAdjustment(variantId, quantity, actor, normalizedReason)
        projectIfEligible(emit, listOf(variantId), ProjectionSourceCause.InternalAdjustment)
        ledgerId
    }!!

    /** Sets the available (already reservation-netted) quantity, preserving reservations and safety stock. */
    fun setAvailableQuantity(variantId: Long, target: Int, actor: String, reason: String?): Long? = transactions.execute {
        if (target < 0) throw CommerceValidation("INVENTORY_AVAILABLE_QUANTITY_MUST_BE_NON_NEGATIVE")
        val emit = acquireScope(listOf(variantId))
        val current = lockBalance(variantId).first
        val delta = target - current
        if (delta == 0) {
            projectIfEligible(emit, listOf(variantId), ProjectionSourceCause.InternalAdjustment)
            return@execute null
        }
        val normalizedReason = normalizeReason(reason ?: "")
        jdbc.update("UPDATE inventory_balances SET available_quantity=?,updated_at=now() WHERE variant_id=?", target, variantId)
        val ledgerId = appendAdjustment(variantId, delta, actor, normalizedReason)
        projectIfEligible(emit, listOf(variantId), ProjectionSourceCause.InternalAdjustment)
        ledgerId
    }

    private fun reserveRow(saga: UUID, line: InventoryReserveLine, actor: String): Long {
        val existing = jdbc.query(
            "SELECT id FROM inventory_reservations WHERE reservation_line_key=? OR (reservation_saga_key=? AND variant_id=?)",
            { rs, _ -> rs.getLong("id") },
            line.lineKey, saga, line.variantId,
        ).firstOrNull()
        if (existing != null) return existing
        val balance = jdbc.query(
            "SELECT available_quantity,safety_stock FROM inventory_balances WHERE variant_id=? FOR UPDATE",
            { rs, _ -> rs.getInt("available_quantity") to rs.getInt("safety_stock") },
            line.variantId,
        ).firstOrNull() ?: throw InsufficientInventory()
        if (balance.first - balance.second < line.quantity) throw InsufficientInventory()
        jdbc.update(
            "UPDATE inventory_balances SET available_quantity=available_quantity-?,reserved_quantity=reserved_quantity+?,updated_at=now() WHERE variant_id=?",
            line.quantity, line.quantity, line.variantId,
        )
        val reservationId = jdbc.queryForObject(
            "INSERT INTO inventory_reservations(variant_id,reservation_saga_key,reservation_line_key,quantity,status,expires_at) VALUES (?,?,?,?,'ACTIVE',now()+interval '30 minutes') RETURNING id",
            Long::class.java, line.variantId, saga, line.lineKey, line.quantity,
        )!!
        jdbc.update(
            "INSERT INTO inventory_ledger(variant_id,reservation_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,?,'RESERVATION','WEB',?,?)",
            line.variantId, reservationId, distinctKeys(1).single(), -line.quantity, actor,
        )
        return reservationId
    }

    private fun acquireScope(
        variantIds: Collection<Long>,
        orderId: Long? = null,
        attemptId: Long? = null,
        reservationSaga: UUID? = null,
        reservationIds: Collection<Long> = emptyList(),
    ): Boolean {
        val variants = variantIds.distinct().sorted()
        val emit = mlSyncHeld()
        if (variants.isEmpty() && reservationSaga == null && reservationIds.isEmpty()) return emit
        val products = if (variants.isEmpty()) emptyList() else longs(
            "SELECT DISTINCT product_id FROM product_variants WHERE id IN (${placeholders(variants)}) ORDER BY 1",
            variants,
        )
        val accounts = if (variants.isEmpty()) emptyList() else longs(
            "SELECT DISTINCT account_id FROM channel_listings WHERE variant_id IN (${placeholders(variants)}) ORDER BY 1",
            variants,
        )
        lockIds("channel_accounts", accounts)
        lockIds("products", products)
        lockIds("product_variants", variants)
        if (orderId != null) lockIds("orders", listOf(orderId))
        if (attemptId != null) lockIds("mp_checkout_attempts", listOf(attemptId))
        if (reservationSaga != null) {
            jdbc.query(
                "SELECT id FROM inventory_reservations WHERE reservation_saga_key=? ORDER BY variant_id, id FOR UPDATE",
                { rs, _ -> rs.getLong(1) },
                reservationSaga,
            )
        }
        if (reservationIds.isNotEmpty()) {
            val ids = reservationIds.distinct()
            jdbc.query(
                "SELECT id FROM inventory_reservations WHERE id IN (${placeholders(ids)}) ORDER BY variant_id, id FOR UPDATE",
                { rs, _ -> rs.getLong(1) },
                *ids.toTypedArray(),
            )
        }
        variants.forEach { lockBalance(it) }
        if (variants.isNotEmpty()) {
            jdbc.query(
                "SELECT id FROM channel_listings WHERE variant_id IN (${placeholders(variants)}) ORDER BY id FOR UPDATE",
                { rs, _ -> rs.getLong(1) },
                *variants.toTypedArray(),
            )
        }
        return emit
    }

    private fun mlSyncHeld(): Boolean {
        val raw = jdbc.queryForObject("SELECT public.marketplace_ml_sync_snapshot()::text", String::class.java) ?: return false
        val photo = ObjectMapper().readTree(raw)
        val liveKills = photo.path("switches").count { switch ->
            val expires = runCatching { java.time.Instant.parse(switch.path("expiresAt").asText()) }.getOrNull()
            switch.path("active").asBoolean() &&
                expires != null &&
                expires.isAfter(java.time.Instant.now()) &&
                switch.path("owner").asText().isNotBlank() &&
                switch.path("reason").asText().isNotBlank()
        }
        return liveKills == 0 && photo.path("state").asText() == "ACTIVE"
    }

    private fun projectIfEligible(emit: Boolean, variantIds: Collection<Long>, cause: ProjectionSourceCause) {
        if (!emit) return
        val ids = variantIds.distinct().sorted()
        if (ids.isEmpty()) return
        projection.project(ids, cause, CapabilityActor.System)
    }

    private fun lockIds(table: String, ids: Collection<Long>) {
        val sorted = ids.distinct().sorted()
        if (sorted.isEmpty()) return
        jdbc.query(
            "SELECT id FROM $table WHERE id IN (${placeholders(sorted)}) ORDER BY id FOR UPDATE",
            { rs, _ -> rs.getLong(1) },
            *sorted.toTypedArray(),
        )
    }

    private fun longs(sql: String, ids: Collection<Long>): List<Long> =
        jdbc.query(sql, { rs, _ -> rs.getLong(1) }, *ids.toTypedArray())

    private fun placeholders(ids: Collection<Long>) = ids.joinToString(",") { "?" }

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

    private data class ReservationRow(val id: Long, val variantId: Long, val quantity: Int, val status: String)
}
