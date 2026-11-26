package com.storecore.loyalty.domain

import java.time.Instant
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class LoyaltyReservationTest {
    private val created = Instant.parse("2026-11-26T12:00:00Z")
    private val window = requireNotNull(LoyaltyReservationWindow.create(created))
    private val expires = window.expiresAt

    @Test fun `quoted hold binds strictly before expiry and expires at equality`() {
        val before = LoyaltyReservationDecision.apply(LoyaltyReservationState.QUOTED, LoyaltyReservationStep.Bind, expires.minusSeconds(1), window)
        assertSame(LoyaltyOutcome.APPLIED, before.outcome)
        assertSame(LoyaltyReservationState.PAYMENT_PENDING, before.state)
        val equal = LoyaltyReservationDecision.apply(LoyaltyReservationState.QUOTED, LoyaltyReservationStep.Bind, expires, window)
        assertNotSame(LoyaltyOutcome.APPLIED, equal.outcome)
        assertSame(LoyaltyReservationState.QUOTED, equal.state)
        assertNotSame(LoyaltyOutcome.APPLIED, LoyaltyReservationDecision.apply(LoyaltyReservationState.QUOTED, LoyaltyReservationStep.Expire, expires.minusSeconds(1), window).outcome)
        assertSame(LoyaltyReservationState.EXPIRED, LoyaltyReservationDecision.apply(LoyaltyReservationState.QUOTED, LoyaltyReservationStep.Expire, expires, window).state)
    }

    @Test fun `pending and uncertain holds survive TTL and commit late exactly through authority step`() {
        for (state in listOf(LoyaltyReservationState.PAYMENT_PENDING, LoyaltyReservationState.RECONCILIATION_REQUIRED)) {
            assertNotSame(LoyaltyOutcome.APPLIED, LoyaltyReservationDecision.apply(state, LoyaltyReservationStep.Expire, expires.plusSeconds(86400), window).outcome)
            assertNotSame(LoyaltyOutcome.APPLIED, LoyaltyReservationDecision.apply(state, LoyaltyReservationStep.Cancel, expires, window).outcome)
            val commit = LoyaltyReservationDecision.apply(state, LoyaltyReservationStep.Commit, expires.plusSeconds(86400), window)
            assertSame(LoyaltyOutcome.APPLIED, commit.outcome)
            assertSame(LoyaltyReservationState.COMMITTED, commit.state)
        }
        assertSame(LoyaltyReservationState.RECONCILIATION_REQUIRED, LoyaltyReservationDecision.apply(LoyaltyReservationState.PAYMENT_PENDING, LoyaltyReservationStep.MarkUncertain, created, window).state)
    }

    @Test fun `closed step objects own every legal edge and all terminal unknown and self edges fail`() {
        val legal: Map<LoyaltyReservationState, Map<LoyaltyReservationStep, LoyaltyReservationState>> = mapOf(
            LoyaltyReservationState.QUOTED to mapOf(LoyaltyReservationStep.Bind to LoyaltyReservationState.PAYMENT_PENDING, LoyaltyReservationStep.Cancel to LoyaltyReservationState.RELEASED, LoyaltyReservationStep.Expire to LoyaltyReservationState.EXPIRED),
            LoyaltyReservationState.PAYMENT_PENDING to mapOf(LoyaltyReservationStep.Commit to LoyaltyReservationState.COMMITTED, LoyaltyReservationStep.RejectPayment to LoyaltyReservationState.RELEASED, LoyaltyReservationStep.CancelPayment to LoyaltyReservationState.RELEASED, LoyaltyReservationStep.MarkUncertain to LoyaltyReservationState.RECONCILIATION_REQUIRED),
            LoyaltyReservationState.RECONCILIATION_REQUIRED to mapOf(LoyaltyReservationStep.Commit to LoyaltyReservationState.COMMITTED, LoyaltyReservationStep.RejectPayment to LoyaltyReservationState.RELEASED, LoyaltyReservationStep.CancelPayment to LoyaltyReservationState.RELEASED),
        )
        for (state in LoyaltyReservationState.entries) {
            for (step in LoyaltyReservationStep.known + LoyaltyReservationStep.Unknown) {
                val now = if (step == LoyaltyReservationStep.Expire) expires else created
                val decision = LoyaltyReservationDecision.apply(state, step, now, window)
                val expected = legal[state]?.get(step)
                if (expected == null) {
                    assertNotSame(LoyaltyOutcome.APPLIED, decision.outcome, "$state / $step")
                    assertSame(state, decision.state)
                } else {
                    assertSame(LoyaltyOutcome.APPLIED, decision.outcome, "$state / $step")
                    assertSame(expected, decision.state)
                }
            }
        }
        assertSame(LoyaltyReservationStep.Unknown, LoyaltyReservationStep.fromWire("commit"))
        LoyaltyReservationStep.known.forEach { assertSame(it, LoyaltyReservationStep.fromWire(it.wire)) }
    }

    @Test fun `reservation window computes exact fifteen minute lifetime and rejects invalid instants`() {
        assertEquals(created.plusSeconds(900), window.expiresAt)
        assertNull(LoyaltyReservationWindow.create(created.plusNanos(1)))
        assertNull(LoyaltyReservationWindow.create(Instant.MAX.minusSeconds(899)))
    }
}
