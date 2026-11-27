package com.storecore.loyalty.application

import com.storecore.loyalty.domain.*
import java.math.BigInteger
import java.time.Instant
import java.util.UUID

class LoyaltyReservationPlan internal constructor(
    val outcome: LoyaltyOutcome,
    val reservation: LoyaltyReservationAggregate?,
    val quote: LoyaltyQuote?,
    val materializedLots: List<LoyaltyLot>,
    val materializedExpiryPoints: LoyaltyPoints,
    val nextWalletRevision: LoyaltyRevision?,
)

/** Pure planner. The persistence adapter owns locks, fresh time and atomic evidence writes. */
object LoyaltyReservationPlanner {
    fun plan(
        command: LoyaltyReservationQuoteCommand,
        reservationId: UUID,
        walletId: Long,
        walletCustomerId: Long,
        walletRevision: LoyaltyRevision,
        walletPolicy: LoyaltyPolicyId,
        lots: List<LoyaltyLot>,
        items: List<LoyaltyEligibilitySnapshot>,
        discountState: LoyaltyDiscountState,
        now: Instant,
    ): LoyaltyReservationPlan {
        val zero = requireNotNull(LoyaltyPoints.fromWire("0"))
        fun rejected(
            outcome: LoyaltyOutcome,
            current: List<LoyaltyLot> = lots,
            expired: LoyaltyPoints = zero,
            resultingRevision: LoyaltyRevision? = null,
        ) = LoyaltyReservationPlan(outcome, null, null, java.util.List.copyOf(current), expired, resultingRevision)
        if (reservationId == UUID(0, 0) || walletId <= 0 || walletCustomerId <= 0 || now.nano != 0 ||
            command.customerId != walletCustomerId || command.binding.aggregateRef != walletId.toString()) {
            return rejected(LoyaltyOutcome.INVALID_DEFINITION)
        }
        if (walletPolicy != LoyaltyPolicyId.V1) return rejected(LoyaltyOutcome.POLICY_MISMATCH)
        if (command.expectedWalletRevision != walletRevision) return rejected(LoyaltyOutcome.REVISION_CONFLICT)
        val expiry = LoyaltyLotAllocator.expire(lots, now)
        if (expiry.outcome != LoyaltyOutcome.APPLIED) return rejected(expiry.outcome)
        val materialized = expiry.lots
        val expiryMagnitude = lots.zip(materialized).fold(BigInteger.ZERO) { total, (before, after) ->
            if (before.id != after.id || after.expired.value < before.expired.value) {
                return rejected(LoyaltyOutcome.INVALID_DEFINITION)
            }
            total + (after.expired.value - before.expired.value).toBigInteger()
        }
        if (expiryMagnitude > Long.MAX_VALUE.toBigInteger()) return rejected(LoyaltyOutcome.INVALID_DEFINITION)
        val expiredPoints = requireNotNull(LoyaltyPoints.fromWire(expiryMagnitude.toString()))
        val revisionAfterExpiry = if (expiredPoints.value == 0L) walletRevision else
            walletRevision.next() ?: return rejected(LoyaltyOutcome.REVISION_EXHAUSTED)
        val expiryRevision = revisionAfterExpiry.takeIf { expiredPoints.value > 0L }
        if (items.isEmpty() || items.map { it.itemId }.toSet().size != items.size ||
            items.any { it.policy != walletPolicy }) return rejected(LoyaltyOutcome.INELIGIBLE, materialized, expiredPoints, expiryRevision)
        val eligibleMinor = items.filter { it.eligible }.fold(BigInteger.ZERO) { sum, item ->
            sum + item.preRedemption.value.toBigInteger()
        }
        if (eligibleMinor.signum() == 0 || eligibleMinor > Long.MAX_VALUE.toBigInteger()) {
            return rejected(LoyaltyOutcome.INELIGIBLE, materialized, expiredPoints, expiryRevision)
        }
        val available = materialized.fold(BigInteger.ZERO) { sum, lot -> sum + lot.free.value.toBigInteger() }
        if (available > Long.MAX_VALUE.toBigInteger()) return rejected(LoyaltyOutcome.INVALID_DEFINITION, materialized, expiredPoints, expiryRevision)
        val quoteDecision = LoyaltyPolicyV1.quote(
            requireNotNull(LoyaltyPoints.fromWire(available.toString())),
            requireNotNull(LoyaltyMinorUnits.fromWire(eligibleMinor.toString())),
            command.points,
            discountState,
        )
        val quote = quoteDecision.quote ?: return rejected(quoteDecision.outcome, materialized, expiredPoints, expiryRevision)
        val reserved = LoyaltyLotAllocator.reserve(materialized, command.points, now)
        if (reserved.outcome != LoyaltyOutcome.APPLIED) return rejected(reserved.outcome, materialized, expiredPoints, expiryRevision)
        val finalRevision = revisionAfterExpiry.next()
            ?: return rejected(LoyaltyOutcome.REVISION_EXHAUSTED, materialized, expiredPoints, expiryRevision)
        val window = LoyaltyReservationWindow.create(now)
            ?: return rejected(LoyaltyOutcome.INVALID_DEFINITION, materialized, expiredPoints, expiryRevision)
        val allocations = reserved.allocations.mapIndexed { index, allocation ->
            LoyaltyReservationAllocation.create(index + 1, allocation.lotId, allocation.points)
                ?: return rejected(LoyaltyOutcome.INVALID_DEFINITION, materialized, expiredPoints, expiryRevision)
        }
        val aggregate = LoyaltyReservationAggregate.create(
            reservationId, walletId, walletCustomerId, command.cartRevision, walletRevision,
            requireNotNull(LoyaltyRevision.fromWire("0")), walletPolicy, LoyaltyReservationState.QUOTED,
            command.points, window, allocations, now,
        ) ?: return rejected(LoyaltyOutcome.INVALID_DEFINITION, materialized, expiredPoints, expiryRevision)
        return LoyaltyReservationPlan(LoyaltyOutcome.APPLIED, aggregate, quote,
            java.util.List.copyOf(reserved.lots), expiredPoints, finalRevision)
    }
}
