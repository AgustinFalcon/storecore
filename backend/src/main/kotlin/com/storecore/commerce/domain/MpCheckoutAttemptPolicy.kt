package com.storecore.commerce.domain

import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID

/** Pure decision policy for one Mercado Pago checkout attempt. It performs no I/O or state mutation. */
object MpCheckoutAttemptPolicy {
    const val MAX_EXTERNAL_REFERENCE_LENGTH = 64

    fun externalReference(orderId: Long, attemptNo: Int): String {
        require(orderId > 0) { "orderId must be positive" }
        require(attemptNo > 0) { "attemptNo must be positive" }
        return "SC-$orderId-$attemptNo".also {
            require(it.length <= MAX_EXTERNAL_REFERENCE_LENGTH) { "external reference exceeds 64 characters" }
        }
    }

    fun propose(input: ProposeAttemptInput): ProposeAttemptDecision {
        if (input.orderId <= 0) return ProposeAttemptDecision.Invalid("order_id_must_be_positive")
        if (input.attemptNo <= 0) return ProposeAttemptDecision.Invalid("attempt_number_must_be_positive")
        if (input.existingAttempts.any { it.orderId != input.orderId }) {
            return ProposeAttemptDecision.Invalid("snapshot_contains_different_order")
        }
        if (input.existingAttempts.map { it.attemptNo }.distinct().size != input.existingAttempts.size ||
            input.existingAttempts.map { it.idempotencyKey }.distinct().size != input.existingAttempts.size
        ) return ProposeAttemptDecision.Invalid("snapshot_contains_duplicate_identity")
        if (input.existingAttempts.count { it.state.blocksAnotherAttempt } > 1) {
            return ProposeAttemptDecision.Invalid("snapshot_contains_multiple_active_attempts")
        }
        if (input.financialAccredited) return ProposeAttemptDecision.Blocked(AttemptBlockReason.FINANCIAL_ACCREDITED)
        val reference = externalReference(input.orderId, input.attemptNo)
        val sameNumber = input.existingAttempts.firstOrNull { it.attemptNo == input.attemptNo }
        if (sameNumber != null) {
            if (input.existingAttempts.any { it.attemptNo != input.attemptNo && it.state.blocksAnotherAttempt }) {
                return ProposeAttemptDecision.Blocked(AttemptBlockReason.ACTIVE_ATTEMPT_EXISTS)
            }
            return if (sameNumber.externalReference == reference && sameNumber.idempotencyKey == input.idempotencyKey) {
                ProposeAttemptDecision.Reuse(sameNumber)
            } else {
                ProposeAttemptDecision.Blocked(AttemptBlockReason.ATTEMPT_NUMBER_ALREADY_USED)
            }
        }
        if (input.existingAttempts.any { it.state.blocksAnotherAttempt }) {
            return ProposeAttemptDecision.Blocked(AttemptBlockReason.ACTIVE_ATTEMPT_EXISTS)
        }
        if (input.existingAttempts.any { it.attemptNo >= input.attemptNo }) {
            return ProposeAttemptDecision.Blocked(AttemptBlockReason.ATTEMPT_NUMBER_NOT_INCREASING)
        }
        if (input.existingAttempts.any { it.idempotencyKey == input.idempotencyKey }) {
            return ProposeAttemptDecision.Blocked(AttemptBlockReason.IDEMPOTENCY_KEY_ALREADY_USED)
        }
        val attempt = CheckoutAttemptSnapshot(
            orderId = input.orderId,
            attemptNo = input.attemptNo,
            externalReference = reference,
            idempotencyKey = input.idempotencyKey,
            state = CheckoutAttemptState.CREATED,
        )
        return ProposeAttemptDecision.Create(attempt)
    }

    /** A URL is returned only when the caller explicitly supplies a fully verified success. */
    fun classifyCreation(result: CreationObservation): CreationDecision = when (result) {
        is CreationObservation.VerifiedSuccess -> {
            if (result.providerOrderId.isBlank() || result.checkoutUrl.isBlank()) {
                CreationDecision.Recovery(RecoveryReason.INVALID_VERIFIED_SUCCESS)
            } else {
                CreationDecision.ReadyForRedirect(result.providerOrderId, result.checkoutUrl)
            }
        }
        CreationObservation.Timeout -> CreationDecision.Recovery(RecoveryReason.CREATE_TIMEOUT)
        is CreationObservation.HttpFailure -> CreationDecision.Recovery(
            when {
                result.statusCode == 423 -> RecoveryReason.RESOURCE_LOCKED
                result.statusCode == 400 && result.errorCode == "idempotency_validation_failed" -> RecoveryReason.IDEMPOTENCY_VALIDATION_FAILED
                result.statusCode == 409 && result.errorCode == "idempotency_key_already_used" -> RecoveryReason.IDEMPOTENCY_KEY_ALREADY_USED
                result.statusCode in 500..599 -> RecoveryReason.SERVER_ERROR
                else -> RecoveryReason.UNCLASSIFIED_CREATE_FAILURE
            },
        )
    }

    fun evaluateSearch(input: SearchEvaluationInput): SearchDecision {
        val window = input.window
        val limits = input.limits
        if (limits.maxPages <= 0 || limits.maxWindow.isNegative || limits.maxWindow.isZero ||
            window.from > window.to || window.from > input.attemptCreatedAt ||
            input.attemptCreatedAt > window.queriedAt || window.queriedAt > window.to ||
            Duration.between(window.from, window.to) > limits.maxWindow
        ) return SearchDecision.Recovery(RecoveryReason.INVALID_SEARCH_WINDOW)
        if (!input.pagesExhausted || input.pagesFetched <= 0 || input.pagesFetched > limits.maxPages) {
            return SearchDecision.Recovery(RecoveryReason.SEARCH_INCOMPLETE)
        }
        if (input.candidates.isEmpty()) return SearchDecision.Recovery(RecoveryReason.ZERO_CANDIDATES)
        if (input.candidates.size > 1) return SearchDecision.Recovery(RecoveryReason.MULTIPLE_CANDIDATES)
        val candidate = input.candidates.single()
        val expected = input.expected
        if (candidate.externalReference != expected.externalReference ||
            candidate.merchantId != expected.merchantId ||
            candidate.applicationId != expected.applicationId ||
            candidate.amount.compareTo(expected.amount) != 0 ||
            !candidate.currency.equals(expected.currency, ignoreCase = true) ||
            candidate.providerOrderId.isBlank()
        ) return SearchDecision.Recovery(RecoveryReason.CANDIDATE_MISMATCH)
        return SearchDecision.Bind(candidate.providerOrderId)
    }

    fun bind(existingProviderOrderId: String?, requestedProviderOrderId: String): BindDecision {
        if (requestedProviderOrderId.isBlank()) return BindDecision.Recovery(RecoveryReason.INVALID_PROVIDER_ORDER_ID)
        return when (existingProviderOrderId) {
            null -> BindDecision.Bind(requestedProviderOrderId)
            requestedProviderOrderId -> BindDecision.Replay(requestedProviderOrderId)
            else -> BindDecision.Conflict(existingProviderOrderId, requestedProviderOrderId)
        }
    }
}

data class ProposeAttemptInput(
    val orderId: Long,
    val attemptNo: Int,
    /** Supplied by the caller and retained as-is; this policy never generates/replaces it. */
    val idempotencyKey: UUID,
    val existingAttempts: List<CheckoutAttemptSnapshot>,
    /** Financial fact supplied by the caller, including a PAID_STOCK_REVIEW case. */
    val financialAccredited: Boolean,
)

data class CheckoutAttemptSnapshot(
    val orderId: Long,
    val attemptNo: Int,
    val externalReference: String,
    val idempotencyKey: UUID,
    val state: CheckoutAttemptState,
)

enum class CheckoutAttemptState(val blocksAnotherAttempt: Boolean) {
    CREATED(true),
    POSTING(true),
    RECOVERY_REQUIRED(true),
    READY_FOR_REDIRECT(true),
    AWAITING_RESULT(true),
    QUARANTINED(true),
    ACCREDITED(true),
    SUPERSEDED(false),
    TERMINAL_UNPAID_VERIFIED(false),
}

enum class AttemptBlockReason {
    ACTIVE_ATTEMPT_EXISTS,
    FINANCIAL_ACCREDITED,
    ATTEMPT_NUMBER_ALREADY_USED,
    ATTEMPT_NUMBER_NOT_INCREASING,
    IDEMPOTENCY_KEY_ALREADY_USED,
}

sealed interface ProposeAttemptDecision {
    data class Create(val attempt: CheckoutAttemptSnapshot) : ProposeAttemptDecision
    data class Reuse(val attempt: CheckoutAttemptSnapshot) : ProposeAttemptDecision
    data class Blocked(val reason: AttemptBlockReason) : ProposeAttemptDecision
    data class Invalid(val reason: String) : ProposeAttemptDecision
}

sealed interface CreationObservation {
    /**
     * Caller has verified identity, amount/currency and the checkout URL against an HTTPS host allowlist
     * before constructing this value. This type is not proof of verification by itself.
     */
    data class VerifiedSuccess(val providerOrderId: String, val checkoutUrl: String) : CreationObservation
    data object Timeout : CreationObservation
    data class HttpFailure(val statusCode: Int, val errorCode: String? = null) : CreationObservation
}

sealed interface CreationDecision {
    /** An adapter must still enforce the HTTPS host allowlist before sending any browser redirect. */
    data class ReadyForRedirect(val providerOrderId: String, val checkoutUrl: String) : CreationDecision
    data class Recovery(val reason: RecoveryReason) : CreationDecision
}

data class SearchWindow(val from: Instant, val to: Instant, val queriedAt: Instant)
data class SearchLimits(val maxWindow: Duration, val maxPages: Int)
data class ExpectedOrderIdentity(
    val externalReference: String,
    val merchantId: String,
    val applicationId: String,
    val amount: BigDecimal,
    val currency: String,
)
data class RemoteOrderCandidate(
    val providerOrderId: String,
    val externalReference: String,
    val merchantId: String,
    val applicationId: String,
    val amount: BigDecimal,
    val currency: String,
)
data class SearchEvaluationInput(
    val attemptCreatedAt: Instant,
    val window: SearchWindow,
    val limits: SearchLimits,
    val pagesFetched: Int,
    val pagesExhausted: Boolean,
    val candidates: List<RemoteOrderCandidate>,
    val expected: ExpectedOrderIdentity,
)

sealed interface SearchDecision {
    data class Bind(val providerOrderId: String) : SearchDecision
    data class Recovery(val reason: RecoveryReason) : SearchDecision
}

enum class RecoveryReason {
    CREATE_TIMEOUT,
    SERVER_ERROR,
    RESOURCE_LOCKED,
    IDEMPOTENCY_VALIDATION_FAILED,
    IDEMPOTENCY_KEY_ALREADY_USED,
    UNCLASSIFIED_CREATE_FAILURE,
    INVALID_VERIFIED_SUCCESS,
    INVALID_SEARCH_WINDOW,
    SEARCH_INCOMPLETE,
    ZERO_CANDIDATES,
    MULTIPLE_CANDIDATES,
    CANDIDATE_MISMATCH,
    INVALID_PROVIDER_ORDER_ID,
}

sealed interface BindDecision {
    data class Bind(val providerOrderId: String) : BindDecision
    data class Replay(val providerOrderId: String) : BindDecision
    data class Conflict(val existingProviderOrderId: String, val requestedProviderOrderId: String) : BindDecision
    data class Recovery(val reason: RecoveryReason) : BindDecision
}
