package com.storecore.loyalty.application

import com.storecore.loyalty.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class LoyaltyReservationPlannerTest {
    private val now = Instant.parse("2026-11-27T12:00:00Z")
    private fun points(value: Long) = requireNotNull(LoyaltyPoints.fromWire(value.toString()))
    private fun money(value: Long) = requireNotNull(LoyaltyMinorUnits.fromWire(value.toString()))
    private fun lot(id: Long, accepted: Instant, free: Long) = requireNotNull(LoyaltyLot.create(
        id, accepted, points(free), points(free), points(0), points(0), points(0), points(0)))
    private fun item(amount: Long = 1_000_000) = requireNotNull(LoyaltyEligibilitySnapshot.create(
        31, 41, LoyaltyItemClassification.STANDARD, 1, money(amount), money(0), money(amount), money(0), money(amount), LoyaltyPolicyId.V1))
    private fun command(wallet: Long = 5, customer: Long = 7, walletRevision: String = "0", requested: String = "600"):
        LoyaltyReservationQuoteCommand {
        val binding = requireNotNull(LoyaltyCommandBinding.create(UUID.randomUUID(), LoyaltyRealm.CUSTOMER, customer,
            LoyaltyCommandOperation.CREATE_RESERVATION, LoyaltyAggregateType.WALLET, wallet.toString(),
            LoyaltyFingerprint.canonical(listOf(walletRevision, requested))))
        return requireNotNull(LoyaltyReservationQuoteCommand.create(binding, customer, "3", walletRevision, requested))
    }

    @Test fun `successful plan freezes FIFO allocations and increments wallet revision`() {
        val first = lot(11, now.minusSeconds(200), 400)
        val second = lot(12, now.minusSeconds(100), 700)
        val result = LoyaltyReservationPlanner.plan(command(), UUID.randomUUID(), 5, 7,
            requireNotNull(LoyaltyRevision.fromWire("0")), LoyaltyPolicyId.V1,
            listOf(second, first), listOf(item()), LoyaltyDiscountState.NONE, now)
        assertEquals(LoyaltyOutcome.APPLIED, result.outcome)
        assertEquals(1, result.nextWalletRevision!!.value)
        val reservation = requireNotNull(result.reservation)
        assertEquals(listOf(11L, 12L), reservation.allocations.map { it.lotId })
        assertEquals(listOf(400L, 200L), reservation.allocations.map { it.points.value })
        assertEquals(600, result.quote!!.requestedPoints.value)
        assertEquals(0, result.materializedExpiryPoints.value)
        assertEquals(0, result.materializedLots.single { it.id == 11L }.free.value)
        assertEquals(200, result.materializedLots.single { it.id == 12L }.held.value)
    }

    @Test fun `authority policy and revision mismatch fail without a reservation`() {
        val lots = listOf(lot(11, now.minusSeconds(100), 700))
        fun plan(command: LoyaltyReservationQuoteCommand = command(), wallet: Long = 5, customer: Long = 7,
                 revision: String = "0", policy: LoyaltyPolicyId = LoyaltyPolicyId.V1) = LoyaltyReservationPlanner.plan(
            command, UUID.randomUUID(), wallet, customer, requireNotNull(LoyaltyRevision.fromWire(revision)), policy,
            lots, listOf(item()), LoyaltyDiscountState.NONE, now)
        assertEquals(LoyaltyOutcome.REVISION_CONFLICT, plan(revision = "1").outcome)
        assertEquals(LoyaltyOutcome.POLICY_MISMATCH, plan(policy = LoyaltyPolicyId.UNKNOWN).outcome)
        assertEquals(LoyaltyOutcome.INVALID_DEFINITION, plan(wallet = 6).outcome)
        assertEquals(LoyaltyOutcome.INVALID_DEFINITION, plan(customer = 8).outcome)
        assertTrue(plan(revision = "1").reservation == null)
    }

    @Test fun `policy rejection still exposes independently materialized due expiry`() {
        val due = lot(11, now.minusSeconds(365L * 86_400), 100)
        val future = lot(12, now.minusSeconds(100), 500)
        val result = LoyaltyReservationPlanner.plan(command(requested = "600"), UUID.randomUUID(), 5, 7,
            requireNotNull(LoyaltyRevision.fromWire("0")), LoyaltyPolicyId.V1,
            listOf(due, future), listOf(item()), LoyaltyDiscountState.NONE, now)
        assertEquals(LoyaltyOutcome.INSUFFICIENT_BALANCE, result.outcome)
        assertNull(result.reservation)
        assertEquals(1, result.nextWalletRevision!!.value)
        assertEquals(100, result.materializedExpiryPoints.value)
        val expired = result.materializedLots.single { it.id == 11L }
        assertEquals(0, expired.free.value)
        assertEquals(100, expired.expired.value)
    }

    @Test fun `stale revision still materializes due expiry before serialized balance rejection`() {
        val due = lot(11, now.minusSeconds(365L * 86_400), 100)
        val future = lot(12, now.minusSeconds(100), 500)
        val result = LoyaltyReservationPlanner.plan(command(walletRevision = "0", requested = "600"), UUID.randomUUID(), 5, 7,
            requireNotNull(LoyaltyRevision.fromWire("1")), LoyaltyPolicyId.V1,
            listOf(due, future), listOf(item()), LoyaltyDiscountState.NONE, now)
        assertEquals(LoyaltyOutcome.INSUFFICIENT_BALANCE, result.outcome)
        assertNull(result.reservation)
        assertEquals(2, result.nextWalletRevision!!.value)
        assertEquals(100, result.materializedExpiryPoints.value)
        assertEquals(100, result.materializedLots.single { it.id == 11L }.expired.value)
    }

    @Test fun `successful quote after due expiry advances one revision per independent effect`() {
        val due = lot(11, now.minusSeconds(365L * 86_400), 100)
        val future = lot(12, now.minusSeconds(100), 700)
        val result = LoyaltyReservationPlanner.plan(command(requested = "600"), UUID.randomUUID(), 5, 7,
            requireNotNull(LoyaltyRevision.fromWire("0")), LoyaltyPolicyId.V1,
            listOf(due, future), listOf(item()), LoyaltyDiscountState.NONE, now)
        assertEquals(LoyaltyOutcome.APPLIED, result.outcome)
        assertEquals(2, result.nextWalletRevision!!.value)
        assertEquals(100, result.materializedExpiryPoints.value)
        assertEquals(1, result.reservation!!.walletRevision.value)
    }

    @Test fun `revision exhaustion and stacking fail closed`() {
        val lots = listOf(lot(11, now.minusSeconds(100), 700))
        val exhausted = LoyaltyReservationPlanner.plan(command(walletRevision = Long.MAX_VALUE.toString()), UUID.randomUUID(), 5, 7,
            requireNotNull(LoyaltyRevision.fromWire(Long.MAX_VALUE.toString())), LoyaltyPolicyId.V1,
            lots, listOf(item()), LoyaltyDiscountState.NONE, now)
        assertEquals(LoyaltyOutcome.REVISION_EXHAUSTED, exhausted.outcome)
        val stacked = LoyaltyReservationPlanner.plan(command(), UUID.randomUUID(), 5, 7,
            requireNotNull(LoyaltyRevision.fromWire("0")), LoyaltyPolicyId.V1,
            lots, listOf(item()), LoyaltyDiscountState.PRESENT, now)
        assertEquals(LoyaltyOutcome.STACKING_FORBIDDEN, stacked.outcome)
    }

    @Test fun `insufficient serialized balance precedes stacking rejection like the writer`() {
        val result = LoyaltyReservationPlanner.plan(command(requested = "600"), UUID.randomUUID(), 5, 7,
            requireNotNull(LoyaltyRevision.fromWire("0")), LoyaltyPolicyId.V1,
            listOf(lot(11, now.minusSeconds(100), 500)), listOf(item()), LoyaltyDiscountState.PRESENT, now)
        assertEquals(LoyaltyOutcome.INSUFFICIENT_BALANCE, result.outcome)
        assertNull(result.reservation)
    }

    @Test fun `stale revision precedes expiry exhaustion like the writer`() {
        val due = lot(11, now.minusSeconds(365L * 86_400), 100)
        val result = LoyaltyReservationPlanner.plan(
            command(walletRevision = (Long.MAX_VALUE - 1).toString(), requested = "100"),
            UUID.randomUUID(), 5, 7, requireNotNull(LoyaltyRevision.fromWire(Long.MAX_VALUE.toString())),
            LoyaltyPolicyId.V1, listOf(due), listOf(item()), LoyaltyDiscountState.NONE, now)
        assertEquals(LoyaltyOutcome.REVISION_CONFLICT, result.outcome)
        assertEquals(0, result.materializedExpiryPoints.value)
        assertEquals(100, result.materializedLots.single().free.value)
        assertNull(result.nextWalletRevision)
    }
}
