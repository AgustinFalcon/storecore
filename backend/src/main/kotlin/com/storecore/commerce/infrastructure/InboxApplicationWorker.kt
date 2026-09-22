package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
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
 * TODO-041: official refetch then apply. No live vendor call unless [OfficialResourceQueryPort.configured].
 * ACK never invents a sale; this worker applies only after an official resource is present.
 */
@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class InboxApplicationWorker(
    private val jdbc: JdbcTemplate,
    private val transactions: TransactionTemplate,
    private val resources: OfficialResourceQueryPort,
    private val inventory: JdbcInventoryService,
    private val capabilities: CapabilityDecisionPort,
    private val mapper: ObjectMapper,
) {
    @Scheduled(fixedDelayString = "\${storecore.integrations.refetch-delay-ms:30000}")
    fun tick() {
        if (!resources.configured()) return
        runCatching { processPayments() }
        runCatching { processMercadoLibre() }
    }

    fun processPayments(): Int = transactions.execute {
        capabilities.decide("PAYMENTS_MP", "PROCESS_WEBHOOK", CapabilityActor.System)
        if (!resources.configured()) return@execute 0
        val rows = jdbc.query(
            """SELECT i.id,i.provider_event_id FROM payment_event_processing p
               JOIN payment_event_inbox i ON i.id=p.inbox_id
               WHERE p.status='RECEIVED' ORDER BY i.id LIMIT 20 FOR UPDATE OF p SKIP LOCKED""",
            { rs, _ -> rs.getLong("id") to rs.getString("provider_event_id") },
        )
        rows.count { (inboxId, eventId) -> applyPayment(inboxId, eventId) }
    } ?: 0

    fun processMercadoLibre(): Int = transactions.execute {
        capabilities.decide("MARKETPLACE_ML", "SYNC", CapabilityActor.System)
        if (!resources.configured()) return@execute 0
        val rows = jdbc.query(
            """SELECT i.id,i.topic,i.resource,i.account_id FROM ml_notification_processing p
               JOIN ml_notification_inbox i ON i.id=p.inbox_id
               WHERE p.status='RECEIVED' ORDER BY i.id LIMIT 20 FOR UPDATE OF p SKIP LOCKED""",
            { rs, _ -> MlInbox(rs.getLong("id"), rs.getString("topic"), rs.getString("resource"), rs.getLong("account_id")) },
        )
        rows.count { applyMercadoLibre(it) }
    } ?: 0

    private fun applyPayment(inboxId: Long, eventId: String): Boolean {
        val official = runCatching { resources.payment(eventId) }.getOrElse { error ->
            retry("payment_event_processing", inboxId, error.message ?: "OFFICIAL_REFETCH_FAILED")
            return false
        } ?: run {
            fail("payment_event_processing", inboxId, "OFFICIAL_RESOURCE_NOT_FOUND")
            return false
        }
        val status = mapPaymentStatus(official.status) ?: run {
            fail("payment_event_processing", inboxId, "OFFICIAL_PAYMENT_STATUS_UNSUPPORTED")
            return false
        }
        val payment = findPayment(official, eventId)
        if (payment == null) {
            markProcessed("payment_event_processing", inboxId)
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
        markProcessed("payment_event_processing", inboxId)
        return true
    }

    private fun applyMercadoLibre(row: MlInbox): Boolean {
        val official = runCatching { resources.mercadoLibre(row.topic, row.resource) }.getOrElse { error ->
            retry("ml_notification_processing", row.id, error.message ?: "OFFICIAL_REFETCH_FAILED")
            return false
        } ?: run {
            fail("ml_notification_processing", row.id, "OFFICIAL_RESOURCE_NOT_FOUND")
            return false
        }
        official.items.forEach { item -> applyMlItem(row.accountId, official, item) }
        jdbc.update(
            """INSERT INTO reconciliation_runs(account_id,feed_cursor,observed_snapshot_hash,result,finished_at)
               VALUES (?,?,?,'COMPLETED',clock_timestamp())""",
            row.accountId, official.externalOrderId, sha256(official.externalOrderId + official.items.size),
        )
        markProcessed("ml_notification_processing", row.id)
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
            UUID.randomUUID(), accountId, listing.first,
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
            inboxId, UUID.randomUUID(),
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
        else -> raw.takeIf { it in setOf("PENDING", "APPROVED", "REJECTED", "CANCELLED", "REFUNDED", "CHARGED_BACK") }
    }

    private fun retry(table: String, inboxId: Long, error: String) {
        jdbc.update("UPDATE $table SET attempt_count=attempt_count+1,last_error=?,updated_at=now() WHERE inbox_id=?", error.take(500), inboxId)
    }

    private fun fail(table: String, inboxId: Long, error: String) {
        jdbc.update("UPDATE $table SET status='FAILED',last_error=?,updated_at=now() WHERE inbox_id=?", error.take(500), inboxId)
    }

    private fun markProcessed(table: String, inboxId: Long) {
        jdbc.update("UPDATE $table SET status='PROCESSED',last_error=NULL,updated_at=now() WHERE inbox_id=?", inboxId)
    }

    private data class MlInbox(val id: Long, val topic: String, val resource: String, val accountId: Long)
}
