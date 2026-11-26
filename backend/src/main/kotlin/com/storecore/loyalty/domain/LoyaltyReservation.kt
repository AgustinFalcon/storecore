package com.storecore.loyalty.domain

import java.time.Instant
import java.time.DateTimeException

class LoyaltyReservationWindow private constructor(val createdAt: Instant, val expiresAt: Instant) {
    companion object {
        private const val TTL_SECONDS = 15L * 60

        fun create(createdAt: Instant): LoyaltyReservationWindow? {
            if (createdAt.nano != 0) return null
            val expiresAt = try {
                createdAt.plusSeconds(TTL_SECONDS)
            } catch (_: DateTimeException) {
                return null
            }
            return LoyaltyReservationWindow(createdAt, expiresAt)
        }
    }
}

sealed class LoyaltyReservationStep(val wire: String) {
    internal abstract fun destination(state: LoyaltyReservationState, now: Instant, expiresAt: Instant): LoyaltyReservationState?

    data object Bind : LoyaltyReservationStep("BIND") {
        override fun destination(state: LoyaltyReservationState, now: Instant, expiresAt: Instant) =
            LoyaltyReservationState.PAYMENT_PENDING.takeIf { state == LoyaltyReservationState.QUOTED && now < expiresAt }
    }
    data object Cancel : LoyaltyReservationStep("CANCEL") {
        override fun destination(state: LoyaltyReservationState, now: Instant, expiresAt: Instant) =
            LoyaltyReservationState.RELEASED.takeIf { state == LoyaltyReservationState.QUOTED }
    }
    data object Expire : LoyaltyReservationStep("EXPIRE") {
        override fun destination(state: LoyaltyReservationState, now: Instant, expiresAt: Instant) =
            LoyaltyReservationState.EXPIRED.takeIf { state == LoyaltyReservationState.QUOTED && now >= expiresAt }
    }
    data object Commit : LoyaltyReservationStep("COMMIT") {
        override fun destination(state: LoyaltyReservationState, now: Instant, expiresAt: Instant) =
            LoyaltyReservationState.COMMITTED.takeIf { state.acceptsAuthority }
    }
    data object RejectPayment : LoyaltyReservationStep("REJECT_PAYMENT") {
        override fun destination(state: LoyaltyReservationState, now: Instant, expiresAt: Instant) =
            LoyaltyReservationState.RELEASED.takeIf { state.acceptsAuthority }
    }
    data object CancelPayment : LoyaltyReservationStep("CANCEL_PAYMENT") {
        override fun destination(state: LoyaltyReservationState, now: Instant, expiresAt: Instant) =
            LoyaltyReservationState.RELEASED.takeIf { state.acceptsAuthority }
    }
    data object MarkUncertain : LoyaltyReservationStep("MARK_UNCERTAIN") {
        override fun destination(state: LoyaltyReservationState, now: Instant, expiresAt: Instant) =
            LoyaltyReservationState.RECONCILIATION_REQUIRED.takeIf { state == LoyaltyReservationState.PAYMENT_PENDING }
    }
    data object Unknown : LoyaltyReservationStep("UNKNOWN") {
        override fun destination(state: LoyaltyReservationState, now: Instant, expiresAt: Instant): LoyaltyReservationState? = null
    }

    companion object {
        val known: List<LoyaltyReservationStep> get() = listOf(Bind, Cancel, Expire, Commit, RejectPayment, CancelPayment, MarkUncertain)
        fun fromWire(raw: String?): LoyaltyReservationStep = known.firstOrNull { it.wire == raw } ?: Unknown
    }
}

private val LoyaltyReservationState.acceptsAuthority: Boolean
    get() = this == LoyaltyReservationState.PAYMENT_PENDING || this == LoyaltyReservationState.RECONCILIATION_REQUIRED

class LoyaltyReservationDecision private constructor(val outcome: LoyaltyOutcome, val state: LoyaltyReservationState) {
    companion object {
        fun apply(state: LoyaltyReservationState, step: LoyaltyReservationStep, now: Instant, window: LoyaltyReservationWindow): LoyaltyReservationDecision {
            val destination = step.destination(state, now, window.expiresAt)
            return if (destination == null) LoyaltyReservationDecision(LoyaltyOutcome.INVALID_STATE, state)
            else LoyaltyReservationDecision(LoyaltyOutcome.APPLIED, destination)
        }
    }
}
