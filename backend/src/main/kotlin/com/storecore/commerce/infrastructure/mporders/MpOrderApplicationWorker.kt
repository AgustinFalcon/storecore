package com.storecore.commerce.infrastructure.mporders

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.port.output.InventoryConsumePort
import com.storecore.commerce.application.port.output.OfficialOrderQueryPort
import com.storecore.commerce.domain.CommercialEffect
import com.storecore.commerce.domain.OrderStatus
import com.storecore.commerce.domain.PaymentStatus
import com.storecore.commerce.domain.CheckoutAttemptState
import com.storecore.commerce.domain.ReservationStatus
import com.storecore.commerce.domain.MpOrderCommercialPolicy
import com.storecore.commerce.domain.OfficialOrderResource
import com.storecore.commerce.domain.OfficialOrderStatusInput
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.util.UUID

@Service
@ConditionalOnMpOrdersAdapter
class MpOrderApplicationWorker(
    private val jdbc: JdbcTemplate,
    private val transactions: TransactionTemplate,
    private val orders: OfficialOrderQueryPort,
    private val inventory: InventoryConsumePort,
    private val properties: MpOrdersProperties,
    private val capabilities: CapabilityDecisionPort,
    private val mapper: ObjectMapper,
) {
    @Scheduled(initialDelayString = "\${storecore.integrations.refetch-delay-ms:30000}", fixedDelayString = "\${storecore.integrations.refetch-delay-ms:30000}")
    fun tick() {
        if (!orders.configured() || !properties.identityReady()) return
        runCatching { process() }
    }

    fun process(): Int {
        capabilities.decide("PAYMENTS_MP", "APPLY_EVENT", CapabilityActor.System)
        if (!orders.configured() || !properties.identityReady()) return 0
        val claimed = transactions.execute {
            val rows = jdbc.query(
                """SELECT i.id,i.query_data_id FROM mp_order_notification_processing p
                   JOIN mp_order_notification_inbox i ON i.id=p.inbox_id
                   WHERE i.disposition='PROCESSABLE'
                     AND (p.status='RECEIVED' OR p.status='RETRYABLE'
                          OR (p.status='PROCESSING' AND (p.lease_expires_at IS NULL OR p.lease_expires_at < clock_timestamp())))
                   ORDER BY i.id LIMIT 20 FOR UPDATE OF p SKIP LOCKED""",
            ) { rs, _ -> rs.getLong("id") to rs.getString("query_data_id") }
            rows.forEach { (inboxId, _) ->
                jdbc.update(
                    "UPDATE mp_order_notification_processing SET status='PROCESSING',locked_by=?,lease_expires_at=now()+interval '2 minutes',updated_at=now() WHERE inbox_id=?",
                    WORKER, inboxId,
                )
            }
            rows
        } ?: emptyList()
        return claimed.count { (inboxId, queryDataId) ->
            val official = runCatching { orders.getByProviderOrderId(queryDataId) }.getOrElse { error ->
                retry(inboxId, error.message ?: "OFFICIAL_REFETCH_FAILED")
                return@count false
            } ?: run {
                retry(inboxId, "OFFICIAL_ORDER_NOT_FOUND")
                return@count false
            }
            if (official.providerOrderId != queryDataId) {
                quarantine(inboxId, "REFETCHED_ORDER_ID_MISMATCH")
                return@count false
            }
            runCatching { transactions.execute { apply(inboxId, queryDataId, official) } ?: false }
                .getOrElse { error ->
                    retry(inboxId, error.message ?: "ORDER_APPLY_FAILED")
                    false
                }
        }
    }

    private fun apply(inboxId: Long, claimedQueryDataId: String, official: OfficialOrderResource): Boolean {
        if (official.providerOrderId.isBlank() || official.providerOrderId != claimedQueryDataId) {
            quarantine(inboxId, "REFETCHED_ORDER_ID_MISMATCH")
            return false
        }
        // All eligibility writers serialize on orders before attempts/payments/children.
        val orderId = jdbc.query("SELECT order_id FROM mp_checkout_attempts WHERE provider_order_id=?", { rs, _ -> rs.getLong("order_id") }, official.providerOrderId).singleOrNull()
        if (orderId == null) {
            quarantine(inboxId, "ATTEMPT_NOT_BOUND")
            return false
        }
        jdbc.query("SELECT id FROM orders WHERE id=? FOR UPDATE", { rs, _ -> rs.getLong("id") }, orderId)
        val attempt = jdbc.query(
            """SELECT a.id,a.order_id,a.payment_id,a.external_reference,a.amount,a.currency,a.state
               FROM mp_checkout_attempts a WHERE a.provider_order_id=? FOR UPDATE""",
            { rs, _ ->
                AttemptRow(
                    rs.getLong("id"), rs.getLong("order_id"), rs.getLong("payment_id"),
                    rs.getString("external_reference"), rs.getBigDecimal("amount"),
                    rs.getString("currency"), CheckoutAttemptState.fromWire(rs.getString("state")),
                )
            },
            official.providerOrderId,
        ).firstOrNull()
        if (attempt == null) {
            quarantine(inboxId, "ATTEMPT_NOT_BOUND")
            return false
        }
        if (official.externalReference != attempt.externalReference ||
            official.merchantId != properties.expectedUserId ||
            official.applicationId != properties.expectedApplicationId ||
            official.totalAmount.compareTo(attempt.amount) != 0 ||
            !official.currency.equals(attempt.currency, ignoreCase = true)
        ) {
            quarantine(inboxId, "OFFICIAL_ORDER_MISMATCH")
            return false
        }
        val effect = MpOrderCommercialPolicy.classify(
            OfficialOrderStatusInput(official.status, official.statusDetail, official.paidAmount, attempt.amount),
        )
        return when (effect) {
            CommercialEffect.ACCREDIT -> accredit(inboxId, attempt, official)
            CommercialEffect.PENDING -> {
                release(inboxId)
                false
            }
            CommercialEffect.REJECT, CommercialEffect.CANCEL -> terminateUnpaid(inboxId, attempt, official, effect)
            CommercialEffect.REFUND_TOTAL, CommercialEffect.REFUND_PARTIAL, CommercialEffect.CHARGEBACK, CommercialEffect.FRAUD ->
                reverse(inboxId, attempt, official, effect)
            CommercialEffect.UNKNOWN -> {
                quarantine(inboxId, "UNKNOWN_STATUS")
                false
            }
        }
    }

    private fun accredit(inboxId: Long, attempt: AttemptRow, official: OfficialOrderResource): Boolean {
        jdbc.query("SELECT id FROM orders WHERE id=? FOR UPDATE", { rs, _ -> rs.getLong(1) }, attempt.orderId)
        val already = jdbc.query(
            "SELECT 1 FROM mp_order_commercial_applications WHERE order_id=? AND transition='PAYMENT_ACCREDITED'",
            { _, _ -> 1 },
            attempt.orderId,
        ).isNotEmpty()
        if (already) {
            val same = jdbc.query(
                "SELECT 1 FROM mp_order_commercial_applications WHERE provider_order_id=? AND transition='PAYMENT_ACCREDITED'",
                { _, _ -> 1 },
                official.providerOrderId,
            ).isNotEmpty()
            if (!same) {
                jdbc.update(
                    """INSERT INTO mp_order_incidents(attempt_id,order_id,kind,review_status,evidence_redacted)
                       VALUES (?,?,'DUPLICATE_REMOTE_CREDIT','OPEN',?::jsonb)""",
                    attempt.id, attempt.orderId,
                    mapper.createObjectNode().put("providerOrderId", official.providerOrderId).toString(),
                )
            }
            markProcessed(inboxId)
            return true
        }
        persistTransactions(attempt.id, official)
        jdbc.update("UPDATE payments SET status='APPROVED',updated_at=now() WHERE id=? AND order_id=?", attempt.paymentId, attempt.orderId)
        val stock = consumeOrReview(attempt.orderId)
        val orderStatus = if (stock) OrderStatus.PAID else OrderStatus.PAID_STOCK_REVIEW
        jdbc.update("UPDATE orders SET status=?,updated_at=now() WHERE id=?", orderStatus.name, attempt.orderId)
        jdbc.update("UPDATE mp_checkout_attempts SET state='ACCREDITED',updated_at=now() WHERE id=?", attempt.id)
        if (!stock) {
            jdbc.update(
                """INSERT INTO mp_order_incidents(attempt_id,order_id,kind,review_status,evidence_redacted)
                   VALUES (?,?,'PAID_WITHOUT_STOCK','OPEN',?::jsonb)""",
                attempt.id, attempt.orderId,
                mapper.createObjectNode().put("providerOrderId", official.providerOrderId).toString(),
            )
        }
        val applicationId = try {
            jdbc.queryForObject(
                """INSERT INTO mp_order_commercial_applications(
                     inbox_id,attempt_id,order_id,provider_order_id,transition,confirmed_amount,confirmed_currency
                   ) VALUES (?,?,?,?,'PAYMENT_ACCREDITED',?,'ARS') RETURNING id""",
                Long::class.java,
                inboxId, attempt.id, attempt.orderId, official.providerOrderId, official.paidAmount,
            )
        } catch (_: DataIntegrityViolationException) {
            recordDuplicate(attempt, official)
            markProcessed(inboxId)
            return true
        }
        if (applicationId != null && stock) emitVerified(applicationId, official, "PAYMENT_ACCREDITED")
        markProcessed(inboxId)
        return true
    }

    private fun recordDuplicate(attempt: AttemptRow, official: OfficialOrderResource) {
        val exists = jdbc.query(
            "SELECT 1 FROM mp_order_incidents WHERE order_id=? AND kind='DUPLICATE_REMOTE_CREDIT' AND evidence_redacted->>'providerOrderId'=?",
            { _, _ -> 1 },
            attempt.orderId, official.providerOrderId,
        ).isNotEmpty()
        if (!exists) {
            jdbc.update(
                """INSERT INTO mp_order_incidents(attempt_id,order_id,kind,review_status,evidence_redacted)
                   VALUES (?,?,'DUPLICATE_REMOTE_CREDIT','OPEN',?::jsonb)""",
                attempt.id, attempt.orderId,
                mapper.createObjectNode().put("providerOrderId", official.providerOrderId).toString(),
            )
        }
    }

    private fun consumeOrReview(orderId: Long): Boolean {
        val snapshot = jdbc.queryForObject("SELECT checkout_snapshot::text FROM orders WHERE id=? FOR UPDATE", String::class.java, orderId)
            ?: return false
        val tree = mapper.readTree(snapshot)
        val sagaText = tree.path("reservationSagaKey").asText(null) ?: return false
        val saga = UUID.fromString(sagaText)
        val expectedLines = jdbc.queryForObject("SELECT COUNT(*) FROM order_items WHERE order_id=?", Int::class.java, orderId) ?: 0
        if (expectedLines <= 0) return false
        val reservations = jdbc.query(
            "SELECT id,status,expires_at,variant_id,quantity FROM inventory_reservations WHERE reservation_saga_key=? FOR UPDATE",
            { rs, _ ->
                ReservationRow(rs.getLong("id"), ReservationStatus.fromWire(rs.getString("status")), rs.getTimestamp("expires_at")?.toInstant(), rs.getLong("variant_id"), rs.getInt("quantity"))
            },
            saga,
        )
        val usable = reservations.filter { it.status == ReservationStatus.ACTIVE && it.expiresAt != null && it.expiresAt.isAfter(java.time.Instant.now()) }
        if (usable.size == expectedLines) {
            val consumed = inventory.consumeSaga(saga, "MP_ORDERS:$orderId")
            if (consumed != expectedLines) error("CONSUME_COUNT_MISMATCH")
            return true
        }
        val items = jdbc.query(
            "SELECT variant_id,quantity FROM order_items WHERE order_id=?",
            { rs, _ -> rs.getLong("variant_id") to rs.getInt("quantity") },
            orderId,
        )
        items.forEach { (variantId, quantity) ->
            val balance = jdbc.query(
                "SELECT available_quantity,safety_stock FROM inventory_balances WHERE variant_id=? FOR UPDATE",
                { rs, _ -> rs.getInt("available_quantity") to rs.getInt("safety_stock") },
                variantId,
            ).firstOrNull() ?: return false
            if (balance.first - balance.second < quantity) return false
        }
        val newSaga = UUID.randomUUID()
        items.forEach { (variantId, quantity) ->
            inventory.reserve(newSaga, UUID.randomUUID(), variantId, quantity, "MP_ORDERS_RERESERVE:$orderId")
        }
        val consumed = inventory.consumeSaga(newSaga, "MP_ORDERS:$orderId")
        if (consumed != expectedLines) error("CONSUME_COUNT_MISMATCH")
        return true
    }

    private fun terminateUnpaid(inboxId: Long, attempt: AttemptRow, official: OfficialOrderResource, effect: CommercialEffect): Boolean {
        val paymentStatus = if (effect == CommercialEffect.REJECT) PaymentStatus.REJECTED else PaymentStatus.CANCELLED
        jdbc.update("UPDATE payments SET status=?,updated_at=now() WHERE id=? AND order_id=? AND status='PENDING'", paymentStatus.name, attempt.paymentId, attempt.orderId)
        jdbc.update("UPDATE orders SET status='CANCELLED',updated_at=now() WHERE id=? AND status='PENDING_PAYMENT'", attempt.orderId)
        jdbc.update("UPDATE mp_checkout_attempts SET state='TERMINAL_UNPAID_VERIFIED',updated_at=now() WHERE id=?", attempt.id)
        persistTransactions(attempt.id, official)
        val applicationId = jdbc.query(
            """INSERT INTO mp_order_commercial_applications(
                 inbox_id,attempt_id,order_id,provider_order_id,transition,confirmed_amount,confirmed_currency
               ) VALUES (?,?,?,?,?,?, 'ARS')
               ON CONFLICT (provider_order_id,transition) DO NOTHING RETURNING id""",
            { rs, _ -> rs.getLong(1) },
            inboxId, attempt.id, attempt.orderId, official.providerOrderId, "PAYMENT_$paymentStatus", official.paidAmount,
        ).firstOrNull()
        if (applicationId != null) emitVerified(applicationId, official, "PAYMENT_$paymentStatus")
        markProcessed(inboxId)
        return true
    }

    private fun reverse(inboxId: Long, attempt: AttemptRow, official: OfficialOrderResource, effect: CommercialEffect): Boolean {
        val kind = when (effect) {
            CommercialEffect.REFUND_TOTAL -> "REFUND_TOTAL"
            CommercialEffect.REFUND_PARTIAL -> "REFUND_PARTIAL"
            CommercialEffect.CHARGEBACK -> "CHARGEBACK"
            else -> "FRAUD"
        }
        persistTransactions(attempt.id, official)
        val exists = jdbc.query(
            """SELECT 1 FROM mp_order_reversal_cases
               WHERE provider_order_id=? AND kind=? AND COALESCE(provider_payment_id,'')=?""",
            { _, _ -> 1 },
            official.providerOrderId, kind, official.transactions.firstOrNull()?.providerPaymentId.orEmpty(),
        ).isNotEmpty()
        if (!exists) {
            jdbc.update(
                """INSERT INTO mp_order_reversal_cases(
                     attempt_id,provider_order_id,provider_payment_id,kind,review_status,inbox_id,evidence_redacted
                   ) VALUES (?,?,?,?, 'UNDER_REVIEW',?,?::jsonb)""",
                attempt.id, official.providerOrderId, official.transactions.firstOrNull()?.providerPaymentId,
                kind, inboxId, mapper.createObjectNode().put("status", official.status).put("statusDetail", official.statusDetail).toString(),
            )
        }
        markProcessed(inboxId)
        return true
    }

    private fun persistTransactions(attemptId: Long, official: OfficialOrderResource) {
        official.transactions.forEach { tx ->
            jdbc.update(
                """INSERT INTO mp_order_payment_transactions(
                     attempt_id,provider_payment_id,provider_order_id,status,status_detail,amount_total,amount_paid,payment_type
                   ) VALUES (?,?,?,?,?,?,?,?)
                   ON CONFLICT (provider_payment_id) DO UPDATE
                     SET status=excluded.status,status_detail=excluded.status_detail,amount_paid=excluded.amount_paid,updated_at=now()""",
                attemptId, tx.providerPaymentId, official.providerOrderId, tx.status, tx.statusDetail,
                official.totalAmount, tx.amount, tx.paymentType,
            )
        }
    }

    private fun emitVerified(applicationId: Long, official: OfficialOrderResource, type: String) {
        val eventId = jdbc.queryForObject(
            """INSERT INTO mp_verified_business_events(application_id,event_key,event_type,payload_redacted)
               VALUES (?,?,?,?::jsonb) RETURNING id""",
            Long::class.java,
            applicationId, UUID.nameUUIDFromBytes("mp-event:$applicationId".toByteArray()), type,
            mapper.createObjectNode().put("providerOrderId", official.providerOrderId).put("type", type).toString(),
        )!!
        val outboxId = jdbc.queryForObject(
            """INSERT INTO mp_order_outbox(business_event_id,idempotency_key,kind,payload_redacted)
               VALUES (?,?,?,?::jsonb) RETURNING id""",
            Long::class.java,
            eventId, UUID.nameUUIDFromBytes("mp-outbox:$eventId".toByteArray()), type,
            mapper.createObjectNode().put("providerOrderId", official.providerOrderId).toString(),
        )!!
        jdbc.update("INSERT INTO mp_order_outbox_delivery(outbox_id,status) VALUES (?,'PENDING') ON CONFLICT (outbox_id) DO NOTHING", outboxId)
    }

    private fun retry(inboxId: Long, error: String) {
        jdbc.update(
            "UPDATE mp_order_notification_processing SET status='RETRYABLE',locked_by=NULL,lease_expires_at=NULL,attempt_count=attempt_count+1,last_error=?,updated_at=now() WHERE inbox_id=?",
            error.take(500), inboxId,
        )
    }

    private fun quarantine(inboxId: Long, error: String) {
        jdbc.update(
            "UPDATE mp_order_notification_processing SET status='QUARANTINED',locked_by=NULL,lease_expires_at=NULL,last_error=?,updated_at=now() WHERE inbox_id=?",
            error.take(500), inboxId,
        )
    }

    private fun markProcessed(inboxId: Long) {
        jdbc.update(
            "UPDATE mp_order_notification_processing SET status='PROCESSED',locked_by=NULL,lease_expires_at=NULL,last_error=NULL,updated_at=now() WHERE inbox_id=?",
            inboxId,
        )
    }

    private fun release(inboxId: Long) {
        jdbc.update(
            "UPDATE mp_order_notification_processing SET status='RECEIVED',locked_by=NULL,lease_expires_at=NULL,updated_at=now() WHERE inbox_id=?",
            inboxId,
        )
    }

    private data class AttemptRow(
        val id: Long,
        val orderId: Long,
        val paymentId: Long,
        val externalReference: String,
        val amount: BigDecimal,
        val currency: String,
        val state: CheckoutAttemptState,
    )

    private data class ReservationRow(
        val id: Long,
        val status: ReservationStatus,
        val expiresAt: java.time.Instant?,
        val variantId: Long,
        val quantity: Int,
    )

    private companion object {
        const val WORKER = "mp-orders-worker"
    }
}
