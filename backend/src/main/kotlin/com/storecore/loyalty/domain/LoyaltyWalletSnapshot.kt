package com.storecore.loyalty.domain

import java.math.BigInteger
import java.time.Instant

class LoyaltyWalletSnapshot private constructor(
    val walletId: Long, val customerId: Long, val revision: LoyaltyRevision, val policy: LoyaltyPolicyId,
    val availablePoints: LoyaltyPoints, val heldPoints: LoyaltyPoints,
    val nextExpiryAt: Instant?, val nextExpiryPoints: LoyaltyPoints,
) {
    internal fun sameStateAs(other: LoyaltyWalletSnapshot): Boolean =
        walletId == other.walletId && customerId == other.customerId && revision == other.revision && policy == other.policy &&
            availablePoints == other.availablePoints && heldPoints == other.heldPoints &&
            nextExpiryAt == other.nextExpiryAt && nextExpiryPoints == other.nextExpiryPoints

    companion object {
        fun create(walletId: Long, customerId: Long, revision: LoyaltyRevision, policy: LoyaltyPolicyId,
                   lots: List<LoyaltyLot>, now: Instant): LoyaltyWalletSnapshot? {
            if (walletId <= 0 || customerId <= 0 || policy != LoyaltyPolicyId.V1 || now.nano != 0 ||
                lots.map { it.id }.toSet().size != lots.size || lots.any { it.acceptedAt > now }) return null
            fun sum(select: (LoyaltyLot) -> Long): Long? {
                val sum = lots.fold(BigInteger.ZERO) { total, lot -> total + select(lot).toBigInteger() }
                return sum.takeIf { it <= Long.MAX_VALUE.toBigInteger() }?.longValueExact()
            }
            for (select in listOf<(LoyaltyLot) -> Long>({ it.issued.value }, { it.free.value }, { it.held.value },
                { it.redeemed.value }, { it.expired.value }, { it.reversed.value })) if (sum(select) == null) return null
            val available = sum { if (it.expiresAt > now) it.free.value else 0 } ?: return null
            val held = sum { it.held.value } ?: return null
            val nextExpiry = lots.filter { it.expiresAt > now && it.free.value > 0 }.minOfOrNull { it.expiresAt }
            val next = sum { if (it.expiresAt == nextExpiry) it.free.value else 0 } ?: return null
            return LoyaltyWalletSnapshot(walletId, customerId, revision, policy,
                requireNotNull(LoyaltyPoints.of(available)), requireNotNull(LoyaltyPoints.of(held)),
                nextExpiry, requireNotNull(LoyaltyPoints.of(next)))
        }
    }
}
class LoyaltyCommandReceipt private constructor(
    val commandId: java.util.UUID, val realm: LoyaltyRealm, val actorId: Long,
    val operation: LoyaltyCommandOperation, val aggregateType: LoyaltyAggregateType, val aggregateRef: String,
    val outcome: LoyaltyOutcome, val originalHttpStatus: LoyaltyReceiptStatus,
    val before: LoyaltyWalletSnapshot, val after: LoyaltyWalletSnapshot, val recordedAt: Instant,
) {
    companion object {
        fun create(binding: LoyaltyCommandBinding, outcome: LoyaltyOutcome, status: LoyaltyReceiptStatus,
                   before: LoyaltyWalletSnapshot, after: LoyaltyWalletSnapshot, recordedAt: Instant): LoyaltyCommandReceipt? {
            if (!status.accepts(outcome) || recordedAt.nano != 0 || before.walletId != after.walletId ||
                before.customerId != after.customerId || binding.aggregateType != LoyaltyAggregateType.WALLET ||
                binding.aggregateRef != before.walletId.toString()) return null
            if (outcome == LoyaltyOutcome.APPLIED) {
                if (before.revision.next() != after.revision) return null
            } else if (!before.sameStateAs(after)) return null
            return LoyaltyCommandReceipt(binding.commandId, binding.realm, binding.actorId, binding.operation,
                binding.aggregateType, binding.aggregateRef, outcome, status, before, after, recordedAt)
        }
    }
}
