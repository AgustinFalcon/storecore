package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.InsufficientInventory
import com.storecore.commerce.application.port.output.InventoryConsumePort
import com.storecore.commerce.application.port.output.OfficialResourceQueryPort
import com.storecore.commerce.domain.OfficialMlResource
import com.storecore.commerce.domain.OfficialPaymentResource
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID

/**
 * TODO-041: claim inbox rows, official refetch outside the lock, then apply per row.
 * ACK never invents a sale; this worker applies only after an official resource is present.
 */
@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class InboxApplicationWorker(
    private val jdbc: JdbcTemplate,
    private val transactions: TransactionTemplate,
    private val resources: OfficialResourceQueryPort,
    private val inventory: InventoryConsumePort,
    private val capabilities: CapabilityDecisionPort,
    private val mapper: ObjectMapper,
) {
    private val workerId = "inbox-worker"

    @Scheduled(initialDelayString = "\${storecore.integrations.refetch-delay-ms:30000}", fixedDelayString = "\${storecore.integrations.refetch-delay-ms:30000}")
    fun tick() {
        if (!resources.configured()) return
        runCatching { processPayments() }
        runCatching { processMercadoLibre() }
    }

    fun processPayments(): Int {
        capabilities.decide("PAYMENTS_MP", "PROCESS_WEBHOOK", CapabilityActor.System)
        if (!resources.configured()) return 0
        return claim(
            """SELECT i.id,i.provider_event_id FROM payment_event_processing p
               JOIN payment_event_inbox i ON i.id=p.inbox_id
               WHERE (p.status='RECEIVED' OR (p.status='PROCESSING' AND (p.lease_expires_at IS NULL OR p.lease_expires_at < clock_timestamp())))
               ORDER BY i.id LIMIT 20 FOR UPDATE OF p SKIP LOCKED""",
            PAYMENT_PROCESSING,
        ).count { (inboxId, eventId) ->
            val official = runCatching { resources.payment(eventId) }.getOrElse { error ->
                retry(PAYMENT_PROCESSING, inboxId, error.message ?: "OFFICIAL_REFETCH_FAILED")
                return@count false
            } ?: run {
                fail(PAYMENT_PROCESSING, inboxId, "OFFICIAL_RESOURCE_NOT_FOUND")
                return@count false
            }
            runCatching { transactions.execute { applyPayment(inboxId, eventId, official) } ?: false }
                .getOrElse { error ->
                    retry(PAYMENT_PROCESSING, inboxId, error.message ?: "PAYMENT_APPLY_FAILED")
                    false
                }
        }
    }

    fun processMercadoLibre(): Int {
        capabilities.decide("MARKETPLACE_ML", "SYNC", CapabilityActor.System)
        if (!resources.configured()) return 0
        return claim(
            """SELECT i.id,i.topic,i.resource,i.account_id FROM ml_notification_processing p
               JOIN ml_notification_inbox i ON i.id=p.inbox_id
               WHERE (p.status='RECEIVED' OR (p.status='PROCESSING' AND (p.lease_expires_at IS NULL OR p.lease_expires_at < clock_timestamp())))
               ORDER BY i.id LIMIT 20 FOR UPDATE OF p SKIP LOCKED""",
            ML_PROCESSING,
        ) { rs -> MlInbox(rs.getLong("id"), rs.getString("topic"), rs.getString("resource"), rs.getLong("account_id")) }
            .count { row ->
                val official = runCatching { resources.mercadoLibre(row.topic, row.resource) }.getOrElse { error ->
                    retry(ML_PROCESSING, row.id, error.message ?: "OFFICIAL_REFETCH_FAILED")
                    return@count false
                } ?: run {
                    fail(ML_PROCESSING, row.id, "OFFICIAL_RESOURCE_NOT_FOUND")
                    return@count false
                }
                runCatching { transactions.execute { applyMercadoLibre(row, official) } ?: false }
                    .getOrElse { error ->
                        val message = if (error is InsufficientInventory) "INSUFFICIENT_INVENTORY" else error.message ?: "ML_APPLY_FAILED"
                        retry(ML_PROCESSING, row.id, message)
                        false
                    }
            }
    }

    private fun applyPayment(inboxId: Long, eventId: String, official: OfficialPaymentResource): Boolean {
        val status = mapPaymentStatus(official.status) ?: run {
            fail(PAYMENT_PROCESSING, inboxId, "OFFICIAL_PAYMENT_STATUS_UNSUPPORTED")
            return false
        }
        val payment = findPayment(official, eventId)
        if (!isTerminal(status)) {
            if (payment != null) {
                jdbc.update("UPDATE payments SET provider_payment_id=?,status=?,updated_at=now() WHERE id=?", official.providerPaymentId, status, payment.first)
            }
            release(PAYMENT_PROCESSING, inboxId)
            return false
        }
        if (payment == null) {
            markProcessed(PAYMENT_PROCESSING, inboxId)
            return true
        }
        jdbc.update("UPDATE payments SET provider_payment_id=?,status=?,updated_at=now() WHERE id=?", official.providerPaymentId, status, payment.first)
        if (status == "APPROVED") {
            jdbc.update("UPDATE orders SET status='PAID',updated_at=now() WHERE id=? AND status='PENDING_PAYMENT'", payment.second)
            consumeCheckoutSaga(payment.second)
        }
        if (status == "REJECTED" || status == "CANCELLED") {
            jdbc.update("UPDATE orders SET status='CANCELLED',updated_at=now() WHERE id=? AND status='PENDING_PAYMENT'", payment.second)
        }
        jdbc.update(
            "INSERT INTO payment_event_applications(inbox_id,payment_id,resulting_status) VALUES (?,?,?) ON CONFLICT (inbox_id) DO NOTHING",
            inboxId, payment.first, status,
        )
        emitPaymentOutbox(inboxId, official, status)
        markProcessed(PAYMENT_PROCESSING, inboxId)
        return true
    }

    private fun applyMercadoLibre(row: MlInbox, official: OfficialMlResource): Boolean {
        official.items.forEach { item -> applyMlItem(row.accountId, official, item) }
        jdbc.update(
            """INSERT INTO reconciliation_runs(account_id,feed_cursor,observed_snapshot_hash,result,finished_at)
               VALUES (?,?,?,'COMPLETED',clock_timestamp())""",
            row.accountId, official.externalOrderId, sha256(official.externalOrderId + official.items.size),
        )
        markProcessed(ML_PROCESSING, row.id)
        return true
    }

    private fun applyMlItem(accountId: Long, official: OfficialMlResource, item: com.storecore.commerce.domain.OfficialMlItem) {
        val listing = jdbc.query(
            """SELECT l.id,l.variant_id FROM channel_listings l
               WHERE l.account_id=? AND l.external_listing_id=? AND l.variation_id IS NOT DISTINCT FROM ?""",
            { rs, _ -> rs.getLong("id") to rs.getLong("variant_id") },
            accountId, item.listingId, item.variationId,
        ).firstOrNull()
        if (listing == null) {
            jdbc.update(
                """UPDATE channel_listings SET manual_intervention_required=TRUE,updated_at=now()
                   WHERE account_id=? AND external_listing_id=?""",
                accountId, item.listingId,
            )
            return
        }
        if (item.observedQuantity != null) {
            jdbc.update("UPDATE channel_listings SET observed_quantity=?,updated_at=now() WHERE id=?", item.observedQuantity, listing.first)
        }
        val existing = jdbc.query(
            "SELECT id FROM channel_sales WHERE account_id=? AND external_order_id=? AND external_order_item_id=? AND variation_id IS NOT DISTINCT FROM ?",
            { rs, _ -> rs.getLong(1) },
            accountId, official.externalOrderId, item.externalOrderItemId, item.variationId,
        ).firstOrNull()
        if (existing != null) return
        val ledgerId = inventory.consumeChannelSale(
            listing.second, item.quantity, "ML:${official.externalOrderId}",
            official.externalOrderId, item.externalOrderItemId, item.variationId,
        )
        jdbc.update(
            "INSERT INTO channel_sales(account_id,external_order_id,external_order_item_id,variation_id,variant_id,ledger_entry_id) VALUES (?,?,?,?,?,?)",
            accountId, official.externalOrderId, item.externalOrderItemId, item.variationId, listing.second, ledgerId,
        )
        jdbc.update(
            """INSERT INTO channel_outbox(idempotency_key,account_id,listing_id,kind,payload_redacted)
               VALUES (?,? ,?,'SALE_APPLIED',?::jsonb)""",
            deterministicId("ml:$accountId:${official.externalOrderId}:${item.externalOrderItemId}"),
            accountId, listing.first,
            mapper.createObjectNode().put("externalOrderId", official.externalOrderId).put("skuVariantId", listing.second).toString(),
        )
    }

    private fun findPayment(official: OfficialPaymentResource, eventId: String): Pair<Long, Long>? {
        val byProvider = jdbc.query(
            "SELECT id,order_id FROM payments WHERE provider_payment_id=?",
            { rs, _ -> rs.getLong("id") to rs.getLong("order_id") },
            official.providerPaymentId,
        ).firstOrNull()
        if (byProvider != null) return byProvider
        val reference = official.externalReference ?: eventId
        return jdbc.query(
            "SELECT id,order_id FROM payments WHERE external_reference=?",
            { rs, _ -> rs.getLong("id") to rs.getLong("order_id") },
            reference,
        ).firstOrNull()
    }

    private fun consumeCheckoutSaga(orderId: Long) {
        val snapshot = jdbc.queryForObject("SELECT checkout_snapshot::text FROM orders WHERE id=?", String::class.java, orderId) ?: return
        val saga = mapper.readTree(snapshot).path("reservationSagaKey").asText(null) ?: return
        if (saga.isBlank()) return
        inventory.consumeSaga(UUID.fromString(saga), "PAYMENT:$orderId")
    }

    private fun emitPaymentOutbox(inboxId: Long, official: OfficialPaymentResource, status: String) {
        val outboxId = jdbc.query(
            """INSERT INTO integration_outbox(provider,source_inbox_id,idempotency_key,kind,payload_redacted)
               VALUES ('MERCADO_PAGO',?,?,'PAYMENT_STATUS_APPLIED',?::jsonb)
               ON CONFLICT (provider,source_inbox_id,kind) DO NOTHING RETURNING id""",
            { rs, _ -> rs.getLong(1) },
            inboxId, deterministicId("mp:$inboxId:$status"),
            mapper.createObjectNode().put("providerPaymentId", official.providerPaymentId).put("status", status).toString(),
        ).firstOrNull() ?: return
        jdbc.update("INSERT INTO integration_outbox_delivery(outbox_id,status) VALUES (?,'PENDING') ON CONFLICT (outbox_id) DO NOTHING", outboxId)
    }

    private fun mapPaymentStatus(raw: String): String? = when (raw.lowercase()) {
        "approved" -> "APPROVED"
        "rejected" -> "REJECTED"
        "cancelled", "canceled" -> "CANCELLED"
        "refunded" -> "REFUNDED"
        "charged_back", "charged-back" -> "CHARGED_BACK"
        "pending", "in_process", "in_mediation" -> "PENDING"
        else -> raw.takeIf { it in TERMINAL + NON_TERMINAL }
    }

    private fun isTerminal(status: String) = status in TERMINAL

    private fun claim(sql: String, table: String): List<Pair<Long, String>> = claim(sql, table) { rs ->
        rs.getLong("id") to rs.getString("provider_event_id")
    }

    private fun <T> claim(sql: String, table: String, mapper: (java.sql.ResultSet) -> T): List<T> = transactions.execute {
        val safeTable = processingTable(table)
        val rows = jdbc.query(sql, { rs, _ -> mapper(rs) })
        rows.forEach { row ->
            val inboxId = when (row) {
                is Pair<*, *> -> row.first as Long
                is MlInbox -> row.id
                else -> error("unsupported claim row")
            }
            jdbc.update(
                "UPDATE $safeTable SET status='PROCESSING',locked_by=?,lease_expires_at=now()+interval '2 minutes',updated_at=now() WHERE inbox_id=?",
                workerId, inboxId,
            )
        }
        rows
    } ?: emptyList()

    private fun retry(table: String, inboxId: Long, error: String) {
        jdbc.update(
            "UPDATE ${processingTable(table)} SET status='RECEIVED',locked_by=NULL,lease_expires_at=NULL,attempt_count=attempt_count+1,last_error=?,updated_at=now() WHERE inbox_id=?",
            error.take(500), inboxId,
        )
    }

    private fun fail(table: String, inboxId: Long, error: String) {
        jdbc.update(
            "UPDATE ${processingTable(table)} SET status='FAILED',locked_by=NULL,lease_expires_at=NULL,last_error=?,updated_at=now() WHERE inbox_id=?",
            error.take(500), inboxId,
        )
    }

    private fun markProcessed(table: String, inboxId: Long) {
        jdbc.update(
            "UPDATE ${processingTable(table)} SET status='PROCESSED',locked_by=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=now() WHERE inbox_id=?",
            inboxId,
        )
    }

    private fun release(table: String, inboxId: Long) {
        jdbc.update(
            "UPDATE ${processingTable(table)} SET status='RECEIVED',locked_by=NULL,lease_expires_at=NULL,updated_at=now() WHERE inbox_id=?",
            inboxId,
        )
    }

    private fun processingTable(table: String): String {
        check(table in PROCESSING_TABLES) { "unsupported processing table" }
        return table
    }

    private fun deterministicId(value: String): UUID = UUID.nameUUIDFromBytes(value.toByteArray())

    private data class MlInbox(val id: Long, val topic: String, val resource: String, val accountId: Long)

    private companion object {
        const val PAYMENT_PROCESSING = "payment_event_processing"
        const val ML_PROCESSING = "ml_notification_processing"
        val PROCESSING_TABLES = setOf(PAYMENT_PROCESSING, ML_PROCESSING)
        val TERMINAL = setOf("APPROVED", "REJECTED", "CANCELLED", "REFUNDED", "CHARGED_BACK")
        val NON_TERMINAL = setOf("PENDING")
    }
}
