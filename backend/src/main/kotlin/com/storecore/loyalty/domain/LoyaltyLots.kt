package com.storecore.loyalty.domain

import java.math.BigInteger
import java.time.DateTimeException
import java.time.Instant

class LoyaltyLot private constructor(
    val id: Long,
    val acceptedAt: Instant,
    val expiresAt: Instant,
    val issued: LoyaltyPoints,
    val free: LoyaltyPoints,
    val held: LoyaltyPoints,
    val redeemed: LoyaltyPoints,
    val expired: LoyaltyPoints,
    val reversed: LoyaltyPoints,
) {
    internal fun partition(
        free: Long = this.free.value, held: Long = this.held.value, redeemed: Long = this.redeemed.value,
        expired: Long = this.expired.value, reversed: Long = this.reversed.value,
    ): LoyaltyLot? {
        val values = listOf(free, held, redeemed, expired, reversed).map { LoyaltyPoints.of(it) ?: return null }
        return create(id, acceptedAt, issued, values[0], values[1], values[2], values[3], values[4])
    }

    companion object {
        fun create(
            id: Long, acceptedAt: Instant, issued: LoyaltyPoints, free: LoyaltyPoints, held: LoyaltyPoints,
            redeemed: LoyaltyPoints, expired: LoyaltyPoints, reversed: LoyaltyPoints,
        ): LoyaltyLot? {
            if (id <= 0 || acceptedAt.nano != 0 || issued.value == 0L) return null
            val sum = listOf(free, held, redeemed, expired, reversed).fold(BigInteger.ZERO) { sum, points -> sum + points.value.toBigInteger() }
            if (sum != issued.value.toBigInteger()) return null
            val expiresAt = try { acceptedAt.plusSeconds(365L * 86_400) } catch (_: DateTimeException) { return null }
            return LoyaltyLot(id, acceptedAt, expiresAt, issued, free, held, redeemed, expired, reversed)
        }
    }
}

class LoyaltyLotAllocation internal constructor(val lotId: Long, val points: LoyaltyPoints)

class LoyaltyLotResult internal constructor(
    val outcome: LoyaltyOutcome,
    val lots: List<LoyaltyLot>,
    val allocations: List<LoyaltyLotAllocation> = emptyList(),
)

object LoyaltyLotAllocator {
    private fun partitionSumsFit(lots: List<LoyaltyLot>): Boolean = listOf<(LoyaltyLot) -> Long>(
        { it.free.value }, { it.held.value }, { it.redeemed.value }, { it.expired.value }, { it.reversed.value },
    ).all { magnitude ->
        lots.fold(BigInteger.ZERO) { sum, lot -> sum + magnitude(lot).toBigInteger() } <= Long.MAX_VALUE.toBigInteger()
    }

    private fun valid(lots: List<LoyaltyLot>, now: Instant): Boolean =
        now.nano == 0 && lots.map { it.id }.toSet().size == lots.size &&
            lots.none { it.acceptedAt > now } && partitionSumsFit(lots)

    fun expire(lots: List<LoyaltyLot>, now: Instant): LoyaltyLotResult {
        if (!valid(lots, now)) return LoyaltyLotResult(LoyaltyOutcome.INVALID_DEFINITION, lots.toList())
        val expired = lots.map { lot ->
            if (now < lot.expiresAt || lot.free.value == 0L) lot
            else requireNotNull(lot.partition(free = 0, expired = Math.addExact(lot.expired.value, lot.free.value)))
        }
        return if (valid(expired, now)) LoyaltyLotResult(LoyaltyOutcome.APPLIED, expired)
        else LoyaltyLotResult(LoyaltyOutcome.INVALID_DEFINITION, lots.toList())
    }

    fun reserve(lots: List<LoyaltyLot>, requested: LoyaltyPoints, now: Instant): LoyaltyLotResult {
        if (!valid(lots, now) || requested.value == 0L) return LoyaltyLotResult(LoyaltyOutcome.INVALID_DEFINITION, lots.toList())
        val expiry = expire(lots, now)
        if (expiry.outcome != LoyaltyOutcome.APPLIED) return expiry
        val current = expiry.lots.sortedWith(compareBy<LoyaltyLot> { it.acceptedAt }.thenBy { it.id })
        val available = current.fold(BigInteger.ZERO) { sum, lot -> sum + lot.free.value.toBigInteger() }
        if (available > Long.MAX_VALUE.toBigInteger()) return LoyaltyLotResult(LoyaltyOutcome.INVALID_DEFINITION, lots.toList())
        if (available < requested.value.toBigInteger()) return LoyaltyLotResult(LoyaltyOutcome.INSUFFICIENT_BALANCE, lots.toList())
        var remaining = requested.value
        val allocations = mutableListOf<LoyaltyLotAllocation>()
        val next = current.map { lot ->
            val take = minOf(remaining, lot.free.value)
            if (take == 0L) lot else {
                remaining -= take
                allocations += LoyaltyLotAllocation(lot.id, requireNotNull(LoyaltyPoints.of(take)))
                requireNotNull(lot.partition(free = lot.free.value - take, held = Math.addExact(lot.held.value, take)))
            }
        }
        return if (valid(next, now)) LoyaltyLotResult(LoyaltyOutcome.APPLIED, next, allocations.toList())
        else LoyaltyLotResult(LoyaltyOutcome.INVALID_DEFINITION, lots.toList())
    }

    fun commit(lots: List<LoyaltyLot>, allocations: List<LoyaltyLotAllocation>, now: Instant): LoyaltyLotResult =
        settle(lots, allocations, now, release = false)

    fun release(lots: List<LoyaltyLot>, allocations: List<LoyaltyLotAllocation>, now: Instant): LoyaltyLotResult =
        settle(lots, allocations, now, release = true)

    private fun settle(lots: List<LoyaltyLot>, allocations: List<LoyaltyLotAllocation>, now: Instant, release: Boolean): LoyaltyLotResult {
        if (!valid(lots, now) || allocations.isEmpty() || allocations.map { it.lotId }.toSet().size != allocations.size) {
            return LoyaltyLotResult(LoyaltyOutcome.INVALID_DEFINITION, lots.toList())
        }
        val byId = lots.associateBy { it.id }
        if (allocations.any { it.points.value == 0L || byId[it.lotId]?.held?.value?.let { held -> held < it.points.value } != false }) {
            return LoyaltyLotResult(LoyaltyOutcome.INVALID_STATE, lots.toList())
        }
        val selected = allocations.associate { it.lotId to it.points.value }
        val expiry = expire(lots, now)
        if (expiry.outcome != LoyaltyOutcome.APPLIED) return expiry
        val next = expiry.lots.map { lot ->
            val amount = selected[lot.id] ?: return@map lot
            val held = lot.held.value - amount
            when {
                !release -> requireNotNull(lot.partition(held = held, redeemed = Math.addExact(lot.redeemed.value, amount)))
                now >= lot.expiresAt -> requireNotNull(lot.partition(held = held, expired = Math.addExact(lot.expired.value, amount)))
                else -> requireNotNull(lot.partition(held = held, free = Math.addExact(lot.free.value, amount)))
            }
        }
        return if (valid(next, now)) LoyaltyLotResult(LoyaltyOutcome.APPLIED, next, allocations.toList())
        else LoyaltyLotResult(LoyaltyOutcome.INVALID_DEFINITION, lots.toList())
    }
}

class LoyaltyRestoration private constructor(
    val recoveryApplied: LoyaltyPoints, val restoredFree: LoyaltyPoints, val restoredExpired: LoyaltyPoints,
) {
    companion object {
        fun plan(gross: LoyaltyPoints, recovery: LoyaltyPoints, originalExpiry: Instant, now: Instant): LoyaltyRestoration? {
            if (originalExpiry.nano != 0 || now.nano != 0) return null
            val recovered = minOf(gross.value, recovery.value)
            val remainder = gross.value - recovered
            return LoyaltyRestoration(
                requireNotNull(LoyaltyPoints.of(recovered)),
                requireNotNull(LoyaltyPoints.of(if (now < originalExpiry) remainder else 0)),
                requireNotNull(LoyaltyPoints.of(if (now >= originalExpiry) remainder else 0)),
            )
        }
    }
}

class LoyaltyEarnCorrectionProgress private constructor(
    val appliedTarget: LoyaltyPoints,
    val freeReversed: LoyaltyPoints,
    val expiredCovered: LoyaltyPoints,
    val reversedCovered: LoyaltyPoints,
    val recoveryCreated: LoyaltyPoints,
) {
    companion object {
        fun empty(): LoyaltyEarnCorrectionProgress = requireNotNull(create(
            requireNotNull(LoyaltyPoints.of(0)), requireNotNull(LoyaltyPoints.of(0)),
            requireNotNull(LoyaltyPoints.of(0)), requireNotNull(LoyaltyPoints.of(0)),
            requireNotNull(LoyaltyPoints.of(0)),
        ))

        fun create(
            appliedTarget: LoyaltyPoints,
            freeReversed: LoyaltyPoints,
            expiredCovered: LoyaltyPoints,
            reversedCovered: LoyaltyPoints,
            recoveryCreated: LoyaltyPoints,
        ): LoyaltyEarnCorrectionProgress? {
            val covered = freeReversed.value.toBigInteger() + expiredCovered.value.toBigInteger() +
                reversedCovered.value.toBigInteger() + recoveryCreated.value.toBigInteger()
            if (covered != appliedTarget.value.toBigInteger()) return null
            return LoyaltyEarnCorrectionProgress(appliedTarget, freeReversed, expiredCovered, reversedCovered, recoveryCreated)
        }
    }
}

class LoyaltyEarnReduction private constructor(
    val outcome: LoyaltyOutcome,
    val freeReversal: LoyaltyPoints,
    val expiredCovered: LoyaltyPoints,
    val reversedCovered: LoyaltyPoints,
    val recoveryCreated: LoyaltyPoints,
    val lot: LoyaltyLot,
    val progress: LoyaltyEarnCorrectionProgress,
) {
    companion object {
        fun plan(
            lot: LoyaltyLot,
            requestedTarget: LoyaltyPoints,
            previous: LoyaltyEarnCorrectionProgress,
        ): LoyaltyEarnReduction {
            val zero = requireNotNull(LoyaltyPoints.of(0))
            fun result(outcome: LoyaltyOutcome) = LoyaltyEarnReduction(outcome, zero, zero, zero, zero, lot, previous)
            if (requestedTarget.value <= previous.appliedTarget.value || requestedTarget.value > lot.issued.value) {
                return result(LoyaltyOutcome.INVALID_DEFINITION)
            }
            val priorReversed = previous.freeReversed.value.toBigInteger() + previous.reversedCovered.value.toBigInteger()
            if (priorReversed > lot.reversed.value.toBigInteger() || previous.expiredCovered.value > lot.expired.value || previous.recoveryCreated.value > lot.redeemed.value) {
                return result(LoyaltyOutcome.INVALID_DEFINITION)
            }

            val delta = requestedTarget.value - previous.appliedTarget.value
            val remainingExpired = lot.expired.value - previous.expiredCovered.value
            val remainingReversed = lot.reversed.value - priorReversed.longValueExact()
            val remainingRedeemed = lot.redeemed.value - previous.recoveryCreated.value
            val unheld = lot.free.value.toBigInteger() + remainingExpired.toBigInteger() +
                remainingReversed.toBigInteger() + remainingRedeemed.toBigInteger()
            if (delta.toBigInteger() > unheld) return result(LoyaltyOutcome.RECONCILIATION_REQUIRED)

            val free = minOf(delta, lot.free.value)
            var remaining = delta - free
            val expired = minOf(remaining, remainingExpired)
            remaining -= expired
            val reversed = minOf(remaining, remainingReversed)
            remaining -= reversed
            val recovery = minOf(remaining, remainingRedeemed)
            remaining -= recovery
            if (remaining != 0L) return result(LoyaltyOutcome.INVALID_DEFINITION)

            val next = requireNotNull(lot.partition(
                free = lot.free.value - free,
                reversed = Math.addExact(lot.reversed.value, free),
            ))
            val nextProgress = requireNotNull(LoyaltyEarnCorrectionProgress.create(
                requestedTarget,
                requireNotNull(LoyaltyPoints.of(Math.addExact(previous.freeReversed.value, free))),
                requireNotNull(LoyaltyPoints.of(Math.addExact(previous.expiredCovered.value, expired))),
                requireNotNull(LoyaltyPoints.of(Math.addExact(previous.reversedCovered.value, reversed))),
                requireNotNull(LoyaltyPoints.of(Math.addExact(previous.recoveryCreated.value, recovery))),
            ))
            return LoyaltyEarnReduction(
                LoyaltyOutcome.APPLIED,
                requireNotNull(LoyaltyPoints.of(free)),
                requireNotNull(LoyaltyPoints.of(expired)),
                requireNotNull(LoyaltyPoints.of(reversed)),
                requireNotNull(LoyaltyPoints.of(recovery)),
                next,
                nextProgress,
            )
        }
    }
}
