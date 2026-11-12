package com.storecore.identity.domain

import java.time.Duration
import java.time.Instant

/**
 * SMTP protocol position is evidence, never inferred from an exception message.
 * A transport leaves BEFORE_DATA before attempting any DATA write, even when that write throws.
 * FINAL_ACCEPTANCE means the positive final response to the entire DATA transfer was read.
 */
enum class SmtpProtocolPosition { BEFORE_DATA, DATA_STARTED, FINAL_ACCEPTANCE, Unknown }
enum class SmtpObservation { ACCEPTED, TRANSIENT_REJECTION, CONNECTION_FAILED, AUTHENTICATION_FAILED, CONFIGURATION_FAILED, PERMANENT_REJECTION, CONNECTION_LOST, TIMEOUT, Unknown }

object SmtpResultClassifier {
    fun classify(position: SmtpProtocolPosition, observation: SmtpObservation): SmtpDeliveryResult = when {
        position == SmtpProtocolPosition.FINAL_ACCEPTANCE && observation == SmtpObservation.ACCEPTED -> SmtpDeliveryResult.ACCEPTED
        position != SmtpProtocolPosition.BEFORE_DATA -> SmtpDeliveryResult.ACCEPTANCE_UNCERTAIN
        else -> when (observation) {
            SmtpObservation.TRANSIENT_REJECTION, SmtpObservation.CONNECTION_FAILED,
            SmtpObservation.CONNECTION_LOST, SmtpObservation.TIMEOUT -> SmtpDeliveryResult.RETRYABLE_BEFORE_HANDOFF
            SmtpObservation.AUTHENTICATION_FAILED -> SmtpDeliveryResult.AUTHENTICATION_FAILED
            SmtpObservation.CONFIGURATION_FAILED -> SmtpDeliveryResult.CONFIGURATION_FAILED
            SmtpObservation.PERMANENT_REJECTION -> SmtpDeliveryResult.PERMANENT_REJECTION
            else -> SmtpDeliveryResult.ACCEPTANCE_UNCERTAIN
        }
    }
}

enum class IdentityDeliveryError { NONE, PRE_DATA_TRANSIENT, SMTP_UNCERTAIN, AUTHENTICATION, CONFIGURATION, REJECTED, EXPIRED, INVALIDATED, PAYLOAD_INVALID, ATTEMPTS_EXHAUSTED }
enum class IdentityHandoffProgress { NOT_STARTED, STARTED, Unknown }

class IdentityDeliverySettlement(val state: IdentityOutboxState, val error: IdentityDeliveryError, val retryAt: Instant? = null) {
    init {
        require(state in setOf(IdentityOutboxState.RETRY, IdentityOutboxState.SENT, IdentityOutboxState.UNCERTAIN, IdentityOutboxState.DEAD, IdentityOutboxState.CANCELLED))
        require((state == IdentityOutboxState.RETRY) == (retryAt != null))
    }
    val destroySecret: Boolean get() = state.isTerminal
}

/** attempt is the one-based count already incremented atomically by lease acquisition. */
class IdentityDeliveryPolicy(private val jitter: () -> Double) {
    /** A crashed process can have transmitted DATA only after recording STARTED durably. */
    fun recoverExpiredLease(progress: IdentityHandoffProgress, attempt: Int, now: Instant): IdentityDeliverySettlement =
        settle(if (progress == IdentityHandoffProgress.NOT_STARTED) SmtpDeliveryResult.RETRYABLE_BEFORE_HANDOFF else SmtpDeliveryResult.ACCEPTANCE_UNCERTAIN, attempt, now)

    fun settle(result: SmtpDeliveryResult, attempt: Int, now: Instant): IdentityDeliverySettlement {
        require(attempt in 1..MAX_ATTEMPTS)
        if (result == SmtpDeliveryResult.RETRYABLE_BEFORE_HANDOFF) {
            if (attempt == MAX_ATTEMPTS) return IdentityDeliverySettlement(IdentityOutboxState.DEAD, IdentityDeliveryError.ATTEMPTS_EXHAUSTED)
            val sample = jitter()
            require(sample.isFinite() && sample in 0.0..1.0) { "INVALID_DELIVERY_JITTER" }
            val delay = (BACKOFF[attempt - 1].toMillis() * (0.8 + 0.4 * sample)).toLong()
            return IdentityDeliverySettlement(IdentityOutboxState.RETRY, IdentityDeliveryError.PRE_DATA_TRANSIENT, now.plusMillis(delay))
        }
        val error = when (result) {
            SmtpDeliveryResult.ACCEPTED -> IdentityDeliveryError.NONE
            SmtpDeliveryResult.AUTHENTICATION_FAILED -> IdentityDeliveryError.AUTHENTICATION
            SmtpDeliveryResult.CONFIGURATION_FAILED -> IdentityDeliveryError.CONFIGURATION
            SmtpDeliveryResult.PERMANENT_REJECTION -> IdentityDeliveryError.REJECTED
            SmtpDeliveryResult.EXPIRED -> IdentityDeliveryError.EXPIRED
            SmtpDeliveryResult.INVALIDATED -> IdentityDeliveryError.INVALIDATED
            else -> IdentityDeliveryError.SMTP_UNCERTAIN
        }
        return IdentityDeliverySettlement(result.resultingState, error)
    }
    companion object {
        const val MAX_ATTEMPTS = 5
        val LEASE: Duration = Duration.ofSeconds(60)
        val CONNECT_TIMEOUT: Duration = Duration.ofSeconds(5)
        val IO_TIMEOUT: Duration = Duration.ofSeconds(10)
        private val BACKOFF = listOf(Duration.ofSeconds(30), Duration.ofMinutes(2), Duration.ofMinutes(10), Duration.ofMinutes(30))
    }
}
