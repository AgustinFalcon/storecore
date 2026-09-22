package com.storecore.commerce.infrastructure.mporders

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.application.port.output.OfficialOrderCommandPort
import com.storecore.commerce.application.port.output.OfficialOrderCreateRequest
import com.storecore.commerce.application.port.output.OfficialOrderSearchQuery
import com.storecore.commerce.domain.BindDecision
import com.storecore.commerce.domain.CheckoutAttemptSnapshot
import com.storecore.commerce.domain.CheckoutAttemptState
import com.storecore.commerce.domain.CreationDecision
import com.storecore.commerce.domain.ExpectedOrderIdentity
import com.storecore.commerce.domain.MpCheckoutAttemptPolicy
import com.storecore.commerce.domain.ProposeAttemptDecision
import com.storecore.commerce.domain.ProposeAttemptInput
import com.storecore.commerce.domain.SearchDecision
import com.storecore.commerce.domain.SearchEvaluationInput
import com.storecore.commerce.domain.SearchLimits
import com.storecore.commerce.domain.SearchWindow
import com.storecore.commerce.infrastructure.sha256
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID

@Service
@ConditionalOnMpOrdersAdapter
class MpCheckoutAttemptService(
    private val jdbc: JdbcTemplate,
    private val transactions: TransactionTemplate,
    private val commands: OfficialOrderCommandPort,
    private val properties: MpOrdersProperties,
    private val mapper: ObjectMapper,
) {
    fun prepare(orderId: Long, idempotencyKey: UUID): Long {
        if (!commands.configured() && properties.adapter != "fake") throw CommerceValidation("MP_ORDERS_UNCONFIGURED")
        return transactions.execute {
            val order = jdbc.query(
                "SELECT o.id,o.status,o.total,o.currency,p.id payment_id,p.status payment_status FROM orders o JOIN payments p ON p.order_id=o.id WHERE o.id=? FOR UPDATE OF o",
                { rs, _ ->
                    OrderLock(rs.getLong("id"), rs.getString("status"), rs.getBigDecimal("total"), rs.getString("currency"), rs.getLong("payment_id"), rs.getString("payment_status"))
                },
                orderId,
            ).firstOrNull() ?: throw CommerceValidation("ORDER_NOT_FOUND")
            val existing = jdbc.query(
                "SELECT order_id,attempt_no,external_reference,idempotency_key,state FROM mp_checkout_attempts WHERE order_id=? ORDER BY attempt_no",
                { rs, _ ->
                    CheckoutAttemptSnapshot(
                        orderId = rs.getLong("order_id"),
                        attemptNo = rs.getInt("attempt_no"),
                        externalReference = rs.getString("external_reference"),
                        idempotencyKey = rs.getObject("idempotency_key", UUID::class.java),
                        state = CheckoutAttemptState.valueOf(rs.getString("state")),
                    )
                },
                orderId,
            )
            val nextNo = (existing.maxOfOrNull { it.attemptNo } ?: 0) + 1
            val decision = MpCheckoutAttemptPolicy.propose(
                ProposeAttemptInput(
                    orderId = orderId,
                    attemptNo = nextNo,
                    idempotencyKey = idempotencyKey,
                    existingAttempts = existing,
                    financialAccredited = order.paymentStatus == "APPROVED",
                ),
            )
            val snapshot = when (decision) {
                is ProposeAttemptDecision.Reuse -> decision.attempt
                is ProposeAttemptDecision.Create -> decision.attempt
                is ProposeAttemptDecision.Blocked -> throw CommerceValidation(decision.reason.name)
                is ProposeAttemptDecision.Invalid -> throw CommerceValidation(decision.reason)
            }
            if (decision is ProposeAttemptDecision.Reuse) {
                return@execute jdbc.queryForObject(
                    "SELECT id FROM mp_checkout_attempts WHERE order_id=? AND attempt_no=?",
                    Long::class.java,
                    orderId, snapshot.attemptNo,
                )!!
            }
            val requestHash = sha256("${snapshot.externalReference}|${order.total}|${order.currency}")
            jdbc.queryForObject(
                """INSERT INTO mp_checkout_attempts(
                     order_id,payment_id,attempt_no,external_reference,idempotency_key,request_hash,amount,currency,snapshot,state
                   ) VALUES (?,?,?,?,?,?,?,?,?::jsonb,'CREATED') RETURNING id""",
                Long::class.java,
                orderId, order.paymentId, snapshot.attemptNo, snapshot.externalReference, snapshot.idempotencyKey,
                requestHash, order.total, order.currency,
                mapper.createObjectNode().put("orderId", orderId).put("attemptNo", snapshot.attemptNo).toString(),
            )!!
        } ?: throw CommerceValidation("ATTEMPT_PREPARE_FAILED")
    }

    fun postAndBind(attemptId: Long): Map<String, Any?> {
        val attempt = load(attemptId)
        if (!commands.configured() && properties.adapter != "fake") throw CommerceValidation("MP_ORDERS_UNCONFIGURED")
        transactions.execute {
            jdbc.update("UPDATE mp_checkout_attempts SET state='POSTING',updated_at=now() WHERE id=? AND state IN ('CREATED','POSTING')", attemptId)
        }
        val observation = commands.create(
            OfficialOrderCreateRequest(attempt.idempotencyKey, attempt.externalReference, attempt.amount, attempt.currency, attempt.requestHash),
        )
        return when (val decision = MpCheckoutAttemptPolicy.classifyCreation(observation)) {
            is CreationDecision.ReadyForRedirect -> {
                if (!properties.allowlistedCheckoutUrl(decision.checkoutUrl)) {
                    markRecovery(attemptId, "CHECKOUT_URL_NOT_ALLOWLISTED")
                    return mapOf("state" to "RECOVERY_REQUIRED")
                }
                bind(attemptId, decision.providerOrderId, decision.checkoutUrl)
            }
            is CreationDecision.Recovery -> {
                markRecovery(attemptId, decision.reason.name)
                mapOf("state" to "RECOVERY_REQUIRED", "reason" to decision.reason.name)
            }
        }
    }

    fun recover(attemptId: Long): Map<String, Any?> {
        val attempt = load(attemptId)
        val now = Instant.now()
        val window = SearchWindow(attempt.createdAt.minus(Duration.ofMinutes(5)), now.plus(Duration.ofMinutes(5)), now)
        val result = commands.search(
            OfficialOrderSearchQuery(attempt.externalReference, window.from, window.to, 1, 20),
        )
        val decision = MpCheckoutAttemptPolicy.evaluateSearch(
            SearchEvaluationInput(
                attemptCreatedAt = attempt.createdAt,
                window = window,
                limits = SearchLimits(Duration.ofHours(24), 10),
                pagesFetched = result.pagesFetched,
                pagesExhausted = result.pagesExhausted,
                candidates = result.candidates,
                expected = ExpectedOrderIdentity(
                    attempt.externalReference, properties.expectedUserId, properties.expectedApplicationId,
                    attempt.amount, attempt.currency,
                ),
            ),
        )
        return when (decision) {
            is SearchDecision.Bind -> bind(attemptId, decision.providerOrderId, null)
            is SearchDecision.Recovery -> {
                markRecovery(attemptId, decision.reason.name)
                mapOf("state" to "RECOVERY_REQUIRED", "reason" to decision.reason.name)
            }
        }
    }

    private fun bind(attemptId: Long, providerOrderId: String, checkoutUrl: String?): Map<String, Any?> {
        return transactions.execute {
            val current = jdbc.queryForObject("SELECT provider_order_id FROM mp_checkout_attempts WHERE id=? FOR UPDATE", String::class.java, attemptId)
            when (val decision = MpCheckoutAttemptPolicy.bind(current, providerOrderId)) {
                is BindDecision.Bind, is BindDecision.Replay -> {
                    val url = checkoutUrl ?: jdbc.queryForObject("SELECT checkout_url FROM mp_checkout_attempts WHERE id=?", String::class.java, attemptId)
                    jdbc.update(
                        "UPDATE mp_checkout_attempts SET provider_order_id=?,checkout_url=COALESCE(?,checkout_url),state='READY_FOR_REDIRECT',error_sanitized=NULL,updated_at=now() WHERE id=?",
                        providerOrderId, url, attemptId,
                    )
                    mapOf("state" to "READY_FOR_REDIRECT", "providerOrderId" to providerOrderId, "checkoutUrl" to url)
                }
                is BindDecision.Conflict -> {
                    markRecovery(attemptId, "PROVIDER_ORDER_CONFLICT")
                    mapOf("state" to "RECOVERY_REQUIRED")
                }
                is BindDecision.Recovery -> {
                    markRecovery(attemptId, decision.reason.name)
                    mapOf("state" to "RECOVERY_REQUIRED")
                }
            }
        } ?: mapOf("state" to "RECOVERY_REQUIRED")
    }

    private fun markRecovery(attemptId: Long, reason: String) {
        jdbc.update(
            "UPDATE mp_checkout_attempts SET state='RECOVERY_REQUIRED',error_sanitized=?,updated_at=now() WHERE id=?",
            reason.take(200), attemptId,
        )
    }

    private fun load(attemptId: Long): StoredAttempt = jdbc.query(
        "SELECT id,order_id,external_reference,idempotency_key,request_hash,amount,currency,created_at FROM mp_checkout_attempts WHERE id=?",
        { rs, _ ->
            StoredAttempt(
                rs.getLong("id"), rs.getLong("order_id"), rs.getString("external_reference"),
                rs.getObject("idempotency_key", UUID::class.java), rs.getString("request_hash"),
                rs.getBigDecimal("amount"), rs.getString("currency"), rs.getTimestamp("created_at").toInstant(),
            )
        },
        attemptId,
    ).firstOrNull() ?: throw CommerceValidation("ATTEMPT_NOT_FOUND")

    private data class OrderLock(
        val id: Long,
        val status: String,
        val total: BigDecimal,
        val currency: String,
        val paymentId: Long,
        val paymentStatus: String,
    )

    private data class StoredAttempt(
        val id: Long,
        val orderId: Long,
        val externalReference: String,
        val idempotencyKey: UUID,
        val requestHash: String,
        val amount: BigDecimal,
        val currency: String,
        val createdAt: Instant,
    )
}
