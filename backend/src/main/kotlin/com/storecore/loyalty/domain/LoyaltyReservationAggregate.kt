package com.storecore.loyalty.domain

import java.math.BigInteger
import java.time.Instant
import java.util.UUID

class LoyaltyReservationAllocation private constructor(
    val ordinal: Int,
    val lotId: Long,
    val points: LoyaltyPoints,
) {
    companion object {
        fun create(ordinal: Int, lotId: Long, points: LoyaltyPoints): LoyaltyReservationAllocation? {
            if (ordinal <= 0 || lotId <= 0 || points.value == 0L) return null
            return LoyaltyReservationAllocation(ordinal, lotId, points)
        }
    }
}

/** Unbound reservation evidence only; payment binding is a later delivery slice. */
class LoyaltyReservationAggregate private constructor(
    val id: UUID,
    val walletId: Long,
    val customerId: Long,
    val cartRevision: LoyaltyRevision,
    val walletRevision: LoyaltyRevision,
    val revision: LoyaltyRevision,
    val policy: LoyaltyPolicyId,
    val state: LoyaltyReservationState,
    val points: LoyaltyPoints,
    val window: LoyaltyReservationWindow,
    val allocations: List<LoyaltyReservationAllocation>,
) {
    companion object {
        fun create(
            id: UUID,
            walletId: Long,
            customerId: Long,
            cartRevision: LoyaltyRevision,
            walletRevision: LoyaltyRevision,
            revision: LoyaltyRevision,
            policy: LoyaltyPolicyId,
            state: LoyaltyReservationState,
            points: LoyaltyPoints,
            window: LoyaltyReservationWindow,
            allocations: List<LoyaltyReservationAllocation>,
            now: Instant,
        ): LoyaltyReservationAggregate? {
            if (id == UUID(0, 0) || walletId <= 0 || customerId <= 0 || policy != LoyaltyPolicyId.V1 ||
                points.value == 0L || now.nano != 0 || window.createdAt > now) return null
            when (state) {
                LoyaltyReservationState.QUOTED -> if (revision.value != 0L) return null
                LoyaltyReservationState.RELEASED -> if (revision.value != 1L) return null
                LoyaltyReservationState.EXPIRED -> if (revision.value != 1L || now < window.expiresAt) return null
                else -> return null
            }
            if (allocations.isEmpty() || allocations.map { it.lotId }.toSet().size != allocations.size ||
                allocations.withIndex().any { (index, allocation) -> allocation.ordinal != index + 1 }) return null
            val total = allocations.fold(BigInteger.ZERO) { sum, allocation -> sum + allocation.points.value.toBigInteger() }
            if (total != points.value.toBigInteger()) return null
            return LoyaltyReservationAggregate(id, walletId, customerId, cartRevision, walletRevision, revision,
                policy, state, points, window, java.util.List.copyOf(allocations))
        }
    }
}
