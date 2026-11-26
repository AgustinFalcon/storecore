package com.storecore.loyalty.domain

import java.time.Instant
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class LoyaltyLotsTest {
    private val now = Instant.parse("2026-11-26T12:00:00Z")

    @Test fun `lot factory protects issued point conservation and 365 day lifetime`() {
        val lot = lot(1, now, issued = 10, free = 4, held = 2, redeemed = 1, expired = 1, reversed = 2)
        assertEquals(now.plusSeconds(365L * 86400), lot.expiresAt)
        assertNull(LoyaltyLot.create(1, now, points(10), points(11), points(0), points(0), points(0), points(0)))
        assertNull(LoyaltyLot.create(0, now, points(1), points(1), points(0), points(0), points(0), points(0)))
        assertNull(LoyaltyLot.create(1, now, points(Long.MAX_VALUE), points(Long.MAX_VALUE), points(1), points(0), points(0), points(0)))
        assertNull(LoyaltyLot.create(1, now.plusNanos(1), points(1), points(1), points(0), points(0), points(0), points(0)))
    }

    @Test fun `reservation allocates oldest lots with stable identity ties and preserves original input`() {
        val early = lot(3, now.minusSeconds(100), 5, 5)
        val firstTie = lot(1, now, 8, 8)
        val lastTie = lot(2, now, 10, 10)
        val result = LoyaltyLotAllocator.reserve(listOf(lastTie, firstTie, early), points(10), now)
        assertSame(LoyaltyOutcome.APPLIED, result.outcome)
        assertEquals(listOf(3L, 1L), result.allocations.map { it.lotId })
        assertEquals(listOf(5L, 5L), result.allocations.map { it.points.value })
        assertEquals(5L, early.free.value)
        assertEquals(8L, firstTie.free.value)
        assertEquals(3L, result.lots.single { it.id == 1L }.free.value)
        result.lots.forEach(::assertConserved)
    }

    @Test fun `insufficient reservation creates no partial holds and duplicate lot identities fail closed`() {
        val original = listOf(lot(1, now, 10, 10))
        val result = LoyaltyLotAllocator.reserve(original, points(11), now)
        assertSame(LoyaltyOutcome.INSUFFICIENT_BALANCE, result.outcome)
        assertTrue(result.allocations.isEmpty())
        assertEquals(original, result.lots)
        assertNotSame(LoyaltyOutcome.APPLIED, LoyaltyLotAllocator.reserve(original + original, points(1), now).outcome)
    }

    @Test fun `wallet availability overflow fails closed before reservation`() {
        val maximum = lot(1, now, Long.MAX_VALUE, Long.MAX_VALUE)
        val extra = lot(2, now, 1, 1)
        val result = LoyaltyLotAllocator.reserve(listOf(maximum, extra), points(1), now)
        assertSame(LoyaltyOutcome.INVALID_DEFINITION, result.outcome)
        assertEquals(listOf(maximum, extra), result.lots)
        assertTrue(result.allocations.isEmpty())
    }

    @Test fun `wallet partition overflow fails closed before and after every mutation`() {
        val heldMaximum = lot(1, now, Long.MAX_VALUE, free = 0, held = Long.MAX_VALUE)
        val freeOne = lot(2, now, 1, free = 1)
        assertSame(LoyaltyOutcome.INVALID_DEFINITION, LoyaltyLotAllocator.reserve(listOf(heldMaximum, freeOne), points(1), now).outcome)

        val freeMaximum = lot(3, now, Long.MAX_VALUE, free = Long.MAX_VALUE)
        val heldOne = lot(4, now, 1, free = 0, held = 1)
        val release = LoyaltyLotAllocator.release(
            listOf(freeMaximum, heldOne),
            listOf(LoyaltyLotAllocation(4, points(1))),
            now,
        )
        assertSame(LoyaltyOutcome.INVALID_DEFINITION, release.outcome)
        assertEquals(listOf(freeMaximum, heldOne), release.lots)
    }

    @Test fun `due expiry consumes free units but never a held allocation`() {
        val due = lot(1, now.minusSeconds(365L * 86400), 10, 6, held = 4)
        val result = LoyaltyLotAllocator.expire(listOf(due), now)
        assertSame(LoyaltyOutcome.APPLIED, result.outcome)
        val after = result.lots.single()
        assertEquals(0L, after.free.value)
        assertEquals(4L, after.held.value)
        assertEquals(6L, after.expired.value)
        assertConserved(after)
        assertSame(LoyaltyOutcome.INSUFFICIENT_BALANCE, LoyaltyLotAllocator.reserve(listOf(due), points(1), now).outcome)
    }

    @Test fun `commit consumes frozen hold and release expires due units without renewing lifetime`() {
        val original = lot(1, now.minusSeconds(365L * 86400 - 10), 10, 10)
        val held = LoyaltyLotAllocator.reserve(listOf(original), points(6), now)
        val committed = LoyaltyLotAllocator.commit(held.lots, held.allocations, now)
        assertSame(LoyaltyOutcome.APPLIED, committed.outcome)
        assertEquals(6L, committed.lots.single().redeemed.value)
        assertEquals(0L, committed.lots.single().held.value)
        val released = LoyaltyLotAllocator.release(held.lots, held.allocations, original.expiresAt)
        assertSame(LoyaltyOutcome.APPLIED, released.outcome)
        assertEquals(10L, released.lots.single().expired.value)
        assertEquals(0L, released.lots.single().free.value)
        assertEquals(original.expiresAt, released.lots.single().expiresAt)
        assertConserved(committed.lots.single())
        assertConserved(released.lots.single())
    }

    @Test fun `restoration partitions gross credit into recovery free and due expiry without new lifetime`() {
        val fresh = requireNotNull(LoyaltyRestoration.plan(points(10), points(3), now.plusSeconds(1), now))
        assertEquals(3L, fresh.recoveryApplied.value)
        assertEquals(7L, fresh.restoredFree.value)
        assertEquals(0L, fresh.restoredExpired.value)
        val due = requireNotNull(LoyaltyRestoration.plan(points(10), points(3), now, now))
        assertEquals(3L, due.recoveryApplied.value)
        assertEquals(0L, due.restoredFree.value)
        assertEquals(7L, due.restoredExpired.value)
        assertEquals(10L, due.recoveryApplied.value + due.restoredFree.value + due.restoredExpired.value)
        val debt = requireNotNull(LoyaltyRestoration.plan(points(2), points(3), now.plusSeconds(1), now))
        assertEquals(2L, debt.recoveryApplied.value)
        assertEquals(0L, debt.restoredFree.value)
    }

    @Test fun `earning correction cannot partially steal a held checkout allocation`() {
        val held = lot(1, now, 10, free = 0, held = 10)
        val blocked = LoyaltyEarnReduction.plan(held, points(1), LoyaltyEarnCorrectionProgress.empty())
        assertSame(LoyaltyOutcome.RECONCILIATION_REQUIRED, blocked.outcome)
        assertEquals(0L, blocked.freeReversal.value)
        assertEquals(0L, blocked.recoveryCreated.value)
        assertEquals(held, blocked.lot)
        val mixed = lot(3, now, 10, free = 4, held = 6)
        val wholeDeltaBlocked = LoyaltyEarnReduction.plan(mixed, points(10), LoyaltyEarnCorrectionProgress.empty())
        assertSame(LoyaltyOutcome.RECONCILIATION_REQUIRED, wholeDeltaBlocked.outcome)
        assertEquals(0L, wholeDeltaBlocked.freeReversal.value)
        assertEquals(0L, wholeDeltaBlocked.recoveryCreated.value)
        assertEquals(mixed, wholeDeltaBlocked.lot)
        val spent = lot(2, now, 10, free = 4, redeemed = 6)
        val applied = LoyaltyEarnReduction.plan(spent, points(10), LoyaltyEarnCorrectionProgress.empty())
        assertSame(LoyaltyOutcome.APPLIED, applied.outcome)
        assertEquals(4L, applied.freeReversal.value)
        assertEquals(6L, applied.recoveryCreated.value)
        assertConserved(applied.lot)
    }

    @Test fun `cumulative earn targets never reuse prior reversed expired or recovery coverage`() {
        val original = lot(1, now, 10, free = 4, redeemed = 6)
        val first = LoyaltyEarnReduction.plan(original, points(4), LoyaltyEarnCorrectionProgress.empty())
        assertSame(LoyaltyOutcome.APPLIED, first.outcome)
        assertEquals(4L, first.freeReversal.value)
        assertEquals(0L, first.recoveryCreated.value)
        val full = LoyaltyEarnReduction.plan(first.lot, points(10), first.progress)
        assertSame(LoyaltyOutcome.APPLIED, full.outcome)
        assertEquals(0L, full.freeReversal.value)
        assertEquals(6L, full.recoveryCreated.value)
        assertEquals(10L, full.progress.appliedTarget.value)

        val expiredThenHeld = lot(2, now, 10, free = 0, held = 6, expired = 4)
        val covered = LoyaltyEarnReduction.plan(expiredThenHeld, points(4), LoyaltyEarnCorrectionProgress.empty())
        assertSame(LoyaltyOutcome.APPLIED, covered.outcome)
        assertEquals(4L, covered.expiredCovered.value)
        val blocked = LoyaltyEarnReduction.plan(covered.lot, points(8), covered.progress)
        assertSame(LoyaltyOutcome.RECONCILIATION_REQUIRED, blocked.outcome)
        assertEquals(covered.lot, blocked.lot)
        assertEquals(4L, blocked.progress.appliedTarget.value)
        assertNotSame(LoyaltyOutcome.APPLIED, LoyaltyEarnReduction.plan(covered.lot, points(3), covered.progress).outcome)

        val alreadyReversed = lot(3, now, 10, free = 0, reversed = 10)
        val coveredByOtherEffect = LoyaltyEarnReduction.plan(alreadyReversed, points(10), LoyaltyEarnCorrectionProgress.empty())
        assertSame(LoyaltyOutcome.APPLIED, coveredByOtherEffect.outcome)
        assertEquals(10L, coveredByOtherEffect.reversedCovered.value)
        assertEquals(10L, coveredByOtherEffect.progress.appliedTarget.value)
    }

    private fun lot(id: Long, accepted: Instant, issued: Long, free: Long, held: Long = 0, redeemed: Long = 0, expired: Long = 0, reversed: Long = 0) =
        requireNotNull(LoyaltyLot.create(id, accepted, points(issued), points(free), points(held), points(redeemed), points(expired), points(reversed)))

    private fun assertConserved(lot: LoyaltyLot) {
        assertEquals(lot.issued.value, listOf(lot.free, lot.held, lot.redeemed, lot.expired, lot.reversed).sumOf { it.value })
    }
}
