package com.storecore.loyalty.domain

import java.math.BigInteger
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

internal fun points(value: Long) = requireNotNull(LoyaltyPoints.fromWire(value.toString()))
internal fun minor(value: Long) = requireNotNull(LoyaltyMinorUnits.fromWire(value.toString()))

class LoyaltyPolicyTest {
    @Test fun `wire vocabularies recognize exact cases and reject future or normalized input`() {
        LoyaltyUnit.entries.forEach { assertSame(it, LoyaltyUnit.fromWire(it.wire)) }
        LoyaltyMovement.entries.forEach { assertSame(it, LoyaltyMovement.fromWire(it.wire)) }
        LoyaltyReservationState.entries.forEach { assertSame(it, LoyaltyReservationState.fromWire(it.wire)) }
        LoyaltyReversalReason.entries.forEach { assertSame(it, LoyaltyReversalReason.fromWire(it.wire)) }
        LoyaltyManualDirection.entries.forEach { assertSame(it, LoyaltyManualDirection.fromWire(it.wire)) }
        LoyaltySource.entries.forEach { assertSame(it, LoyaltySource.fromWire(it.wire)) }
        LoyaltyReconciliationKind.entries.forEach { assertSame(it, LoyaltyReconciliationKind.fromWire(it.wire)) }
        LoyaltyReconciliationState.entries.forEach { assertSame(it, LoyaltyReconciliationState.fromWire(it.wire)) }
        LoyaltyReconciliationEffect.entries.forEach { assertSame(it, LoyaltyReconciliationEffect.fromWire(it.wire)) }
        LoyaltyReconciliationOperation.entries.forEach { assertSame(it, LoyaltyReconciliationOperation.fromWire(it.wire)) }
        LoyaltyReleaseReason.entries.forEach { assertSame(it, LoyaltyReleaseReason.fromWire(it.wire)) }
        LoyaltyItemClassification.entries.forEach { assertSame(it, LoyaltyItemClassification.fromWire(it.wire)) }
        LoyaltyOutcome.entries.forEach { assertSame(it, LoyaltyOutcome.fromWire(it.wire)) }
        for (wire in listOf(null, "", "future", "quoted", " QUOTED ")) {
            assertSame(LoyaltyUnit.UNKNOWN, LoyaltyUnit.fromWire(wire))
            assertSame(LoyaltyMovement.UNKNOWN, LoyaltyMovement.fromWire(wire))
            assertSame(LoyaltyReservationState.UNKNOWN, LoyaltyReservationState.fromWire(wire))
            assertSame(LoyaltyReversalReason.UNKNOWN, LoyaltyReversalReason.fromWire(wire))
            assertSame(LoyaltyManualDirection.UNKNOWN, LoyaltyManualDirection.fromWire(wire))
            assertSame(LoyaltySource.UNKNOWN, LoyaltySource.fromWire(wire))
            assertSame(LoyaltyReconciliationKind.UNKNOWN, LoyaltyReconciliationKind.fromWire(wire))
            assertSame(LoyaltyReconciliationState.UNKNOWN, LoyaltyReconciliationState.fromWire(wire))
            assertSame(LoyaltyReconciliationEffect.UNKNOWN, LoyaltyReconciliationEffect.fromWire(wire))
            assertSame(LoyaltyReconciliationOperation.UNKNOWN, LoyaltyReconciliationOperation.fromWire(wire))
            assertSame(LoyaltyReleaseReason.UNKNOWN, LoyaltyReleaseReason.fromWire(wire))
            assertSame(LoyaltyItemClassification.UNKNOWN, LoyaltyItemClassification.fromWire(wire))
            assertSame(LoyaltyOutcome.UNKNOWN, LoyaltyOutcome.fromWire(wire))
        }
        assertTrue(LoyaltyReservationState.entries.all { it.label.isNotBlank() })
        assertTrue(LoyaltyMovement.entries.all { it.label.isNotBlank() })
        assertSame(LoyaltyDiscountState.UNKNOWN, LoyaltyDiscountState.fromWire("future"))
    }

    @Test fun `point minor unit and revision values accept only canonical nonnegative signed Long wire`() {
        for (wire in listOf(null, "", "-1", "+1", "01", "1.0", "1e3", " 1", "1 ", "9223372036854775808")) {
            assertNull(LoyaltyPoints.fromWire(wire), wire)
            assertNull(LoyaltyMinorUnits.fromWire(wire), wire)
            assertNull(LoyaltyRevision.fromWire(wire), wire)
        }
        assertEquals(0L, points(0).value)
        assertEquals(Long.MAX_VALUE, points(Long.MAX_VALUE).value)
        assertEquals(Long.MAX_VALUE, minor(Long.MAX_VALUE).value)
        assertEquals(1L, LoyaltyRevision.fromWire("0")!!.next()!!.value)
        assertNull(LoyaltyRevision.fromWire(Long.MAX_VALUE.toString())!!.next())
    }

    @Test fun `policy quote freezes the smallest cap and computes earning after redemption`() {
        val decision = LoyaltyPolicyV1.quote(points(800), minor(500_000), points(500), LoyaltyDiscountState.NONE)
        assertSame(LoyaltyOutcome.APPLIED, decision.outcome)
        val quote = requireNotNull(decision.quote)
        assertEquals(500L, quote.maximumPoints.value)
        assertEquals(800L, quote.availablePoints.value)
        assertEquals(5_000L, quote.monetaryValuePoints.value)
        assertEquals(500L, quote.percentageCapPoints.value)
        assertEquals(10_000L, quote.orderCapPoints.value)
        assertEquals(500L, quote.requestedPoints.value)
        assertEquals(50_000L, quote.discountMinor.value)
        assertEquals(450_000L, quote.finalEarningMinor.value)
        assertEquals(4L, quote.earnedPoints.value)
        assertEquals(25L, LoyaltyPolicyV1.earn(minor(2_599_900)).value)
        val net = LoyaltyPolicyV1.quote(points(100), minor(100_000), points(100), LoyaltyDiscountState.NONE)
        assertEquals(0L, requireNotNull(net.quote).earnedPoints.value)
    }

    @Test fun `quote observes available global cap zero and no stacking`() {
        assertEquals(7L, requireNotNull(LoyaltyPolicyV1.quote(points(7), minor(5_000_000), points(7), LoyaltyDiscountState.NONE).quote).maximumPoints.value)
        assertEquals(10_000L, requireNotNull(LoyaltyPolicyV1.quote(points(Long.MAX_VALUE), minor(Long.MAX_VALUE), points(10_000), LoyaltyDiscountState.NONE).quote).maximumPoints.value)
        assertSame(LoyaltyOutcome.INSUFFICIENT_BALANCE, LoyaltyPolicyV1.quote(points(99), minor(100_000), points(100), LoyaltyDiscountState.NONE).outcome)
        assertNotSame(LoyaltyOutcome.APPLIED, LoyaltyPolicyV1.quote(points(1000), minor(100_000), points(101), LoyaltyDiscountState.NONE).outcome)
        assertNotSame(LoyaltyOutcome.APPLIED, LoyaltyPolicyV1.quote(points(100), minor(100_000), points(0), LoyaltyDiscountState.NONE).outcome)
        assertSame(LoyaltyOutcome.STACKING_FORBIDDEN, LoyaltyPolicyV1.quote(points(100), minor(100_000), points(1), LoyaltyDiscountState.PRESENT).outcome)
        assertNotSame(LoyaltyOutcome.APPLIED, LoyaltyPolicyV1.quote(points(100), minor(100_000), points(1), LoyaltyDiscountState.UNKNOWN).outcome)
        assertNull(LoyaltyPolicyV1.quote(points(100), minor(0), points(1), LoyaltyDiscountState.NONE).quote)
    }

    @Test fun `cent allocation conserves discount without overcharging a tiny item`() {
        val bases = listOf(item(1, 1), item(2, 99_999))
        val allocated = requireNotNull(LoyaltyDiscountAllocator.allocate(points(100), bases))
        assertEquals(listOf(1L, 9_999L), allocated.map { it.discountMinor.value })
        val many = requireNotNull(LoyaltyDiscountAllocator.allocate(points(9), (1L..100L).map { item(it, 99) }))
        assertEquals(900L, many.sumOf { it.discountMinor.value })
        assertTrue(many.all { it.discountMinor.value <= 99 })
    }

    @Test fun `allocation orders equal remainders by item identity and rejects duplicate or insufficient bases`() {
        val a = requireNotNull(LoyaltyDiscountAllocator.allocate(points(1), listOf(item(2, 100), item(1, 100), item(3, 100))))
        assertEquals(listOf(1L, 2L, 3L), a.map { it.itemId })
        assertEquals(listOf(34L, 33L, 33L), a.map { it.discountMinor.value })
        assertNull(LoyaltyDiscountAllocator.allocate(points(1), listOf(item(1, 99))))
        assertNull(LoyaltyDiscountAllocator.allocate(points(1), listOf(item(1, 100), item(1, 100))))
        assertNull(LoyaltyItemBasis.create(0, minor(1)))
    }

    @Test fun `allocation uses wide intermediates over signed Long input bounds`() {
        val allocation = requireNotNull(LoyaltyDiscountAllocator.allocate(points(10_000), listOf(item(1, Long.MAX_VALUE / 2), item(2, Long.MAX_VALUE / 2))))
        assertEquals(BigInteger.valueOf(1_000_000), allocation.fold(BigInteger.ZERO) { sum, item -> sum + BigInteger.valueOf(item.discountMinor.value) })
        assertEquals(listOf(500_000L, 500_000L), allocation.map { it.discountMinor.value })
    }

    @Test fun `eligible snapshot owns policy classification tax and arithmetic evidence`() {
        assertSame(LoyaltyPolicyId.V1, LoyaltyPolicyId.fromWire("loyalty-policy-v1"))
        assertSame(LoyaltyPolicyId.UNKNOWN, LoyaltyPolicyId.fromWire("LOYALTY-POLICY-V1"))
        val snapshot = requireNotNull(LoyaltyEligibilitySnapshot.create(
            itemId = 7,
            variantId = 70,
            classification = LoyaltyItemClassification.STANDARD,
            quantity = 2,
            postDiscountMerchandise = minor(100_000),
            excludedTax = minor(21_000),
            preRedemption = minor(100_000),
            allocatedDiscount = minor(10_000),
            finalEarning = minor(90_000),
            policy = LoyaltyPolicyId.V1,
        ))
        assertEquals(90_000L, snapshot.finalEarning.value)
        assertEquals(70L, snapshot.variantId)
        assertTrue(snapshot.eligible)
        val outlet = requireNotNull(LoyaltyEligibilitySnapshot.create(8, 80, LoyaltyItemClassification.OUTLET, 1, minor(50_000), minor(10_500), minor(0), minor(0), minor(0), LoyaltyPolicyId.V1))
        assertFalse(outlet.eligible)
        assertNull(LoyaltyEligibilitySnapshot.create(7, 70, LoyaltyItemClassification.OUTLET, 2, minor(100_000), minor(20_000), minor(1), minor(0), minor(1), LoyaltyPolicyId.V1))
        assertNull(LoyaltyEligibilitySnapshot.create(7, 70, LoyaltyItemClassification.STANDARD, 2, minor(100_000), minor(21_000), minor(100_000), minor(10_001), minor(90_000), LoyaltyPolicyId.V1))
        assertNull(LoyaltyEligibilitySnapshot.create(7, 70, LoyaltyItemClassification.STANDARD, 2, minor(100_000), minor(21_000), minor(100_000), minor(10_000), minor(90_000), LoyaltyPolicyId.UNKNOWN))
        assertNull(LoyaltyEligibilitySnapshot.create(7, 70, LoyaltyItemClassification.UNKNOWN, 2, minor(100_000), minor(21_000), minor(0), minor(0), minor(0), LoyaltyPolicyId.V1))
        assertNull(LoyaltyEligibilitySnapshot.create(7, 0, LoyaltyItemClassification.STANDARD, 2, minor(100_000), minor(21_000), minor(100_000), minor(10_000), minor(90_000), LoyaltyPolicyId.V1))
    }

    private fun item(id: Long, basis: Long) = requireNotNull(LoyaltyItemBasis.create(id, minor(basis)))
}
