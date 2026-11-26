package com.storecore.loyalty.domain

import java.math.BigInteger

class LoyaltyQuote internal constructor(
    val maximumPoints: LoyaltyPoints,
    val requestedPoints: LoyaltyPoints,
    val discountMinor: LoyaltyMinorUnits,
    val finalEarningMinor: LoyaltyMinorUnits,
    val earnedPoints: LoyaltyPoints,
)

class LoyaltyQuoteDecision internal constructor(val outcome: LoyaltyOutcome, val quote: LoyaltyQuote? = null)

class LoyaltyEligibilitySnapshot private constructor(
    val itemId: Long,
    val classification: LoyaltyItemClassification,
    val quantity: Long,
    val postDiscountMerchandise: LoyaltyMinorUnits,
    val excludedTax: LoyaltyMinorUnits,
    val preRedemption: LoyaltyMinorUnits,
    val allocatedDiscount: LoyaltyMinorUnits,
    val finalEarning: LoyaltyMinorUnits,
    val policy: LoyaltyPolicyId,
) {
    val eligible: Boolean get() = classification.isEligible

    companion object {
        fun create(
            itemId: Long,
            classification: LoyaltyItemClassification,
            quantity: Long,
            postDiscountMerchandise: LoyaltyMinorUnits,
            excludedTax: LoyaltyMinorUnits,
            preRedemption: LoyaltyMinorUnits,
            allocatedDiscount: LoyaltyMinorUnits,
            finalEarning: LoyaltyMinorUnits,
            policy: LoyaltyPolicyId,
        ): LoyaltyEligibilitySnapshot? {
            if (itemId <= 0 || quantity <= 0 || classification == LoyaltyItemClassification.UNKNOWN || policy != LoyaltyPolicyId.V1) return null
            val evidencedFinal = allocatedDiscount.value.toBigInteger() + finalEarning.value.toBigInteger()
            val validAmounts = if (classification.isEligible) {
                postDiscountMerchandise.value == preRedemption.value && preRedemption.value.toBigInteger() == evidencedFinal
            } else {
                preRedemption.value == 0L && allocatedDiscount.value == 0L && finalEarning.value == 0L
            }
            if (!validAmounts) return null
            return LoyaltyEligibilitySnapshot(
                itemId, classification, quantity, postDiscountMerchandise, excludedTax,
                preRedemption, allocatedDiscount, finalEarning, policy,
            )
        }
    }
}

object LoyaltyPolicyV1 {
    fun earn(finalEarning: LoyaltyMinorUnits): LoyaltyPoints = requireNotNull(LoyaltyPoints.of(finalEarning.value / 100_000))

    fun quote(
        available: LoyaltyPoints,
        preRedemption: LoyaltyMinorUnits,
        requested: LoyaltyPoints,
        discountState: LoyaltyDiscountState,
    ): LoyaltyQuoteDecision {
        if (discountState == LoyaltyDiscountState.UNKNOWN) return LoyaltyQuoteDecision(LoyaltyOutcome.INVALID_DEFINITION)
        if (discountState == LoyaltyDiscountState.PRESENT) return LoyaltyQuoteDecision(LoyaltyOutcome.STACKING_FORBIDDEN)
        if (requested.value == 0L || preRedemption.value == 0L) return LoyaltyQuoteDecision(LoyaltyOutcome.INVALID_DEFINITION)
        if (requested.value > available.value) return LoyaltyQuoteDecision(LoyaltyOutcome.INSUFFICIENT_BALANCE)
        val maximum = minOf(available.value, preRedemption.value / 100, preRedemption.value / 1000, 10_000)
        if (requested.value > maximum) return LoyaltyQuoteDecision(LoyaltyOutcome.INVALID_DEFINITION)
        // The cap proves multiplication and subtraction stay inside signed Long.
        val discount = requireNotNull(LoyaltyMinorUnits.of(Math.multiplyExact(requested.value, 100)))
        val finalEarning = requireNotNull(LoyaltyMinorUnits.of(Math.subtractExact(preRedemption.value, discount.value)))
        return LoyaltyQuoteDecision(LoyaltyOutcome.APPLIED, LoyaltyQuote(
            requireNotNull(LoyaltyPoints.of(maximum)), requested, discount, finalEarning, earn(finalEarning),
        ))
    }
}

class LoyaltyItemBasis private constructor(val itemId: Long, val basisMinor: LoyaltyMinorUnits) {
    companion object {
        fun create(itemId: Long, basisMinor: LoyaltyMinorUnits): LoyaltyItemBasis? =
            itemId.takeIf { it > 0 }?.let { LoyaltyItemBasis(it, basisMinor) }
    }
}

class LoyaltyItemDiscount internal constructor(val itemId: Long, val discountMinor: LoyaltyMinorUnits)

object LoyaltyDiscountAllocator {
    fun allocate(points: LoyaltyPoints, bases: List<LoyaltyItemBasis>): List<LoyaltyItemDiscount>? {
        if (points.value == 0L || bases.isEmpty() || bases.map { it.itemId }.toSet().size != bases.size) return null
        val ordered = bases.sortedBy { it.itemId }
        val total = ordered.fold(BigInteger.ZERO) { sum, item -> sum + item.basisMinor.value.toBigInteger() }
        val discount = points.value.toBigInteger() * BigInteger.valueOf(100)
        if (total.signum() == 0 || total > Long.MAX_VALUE.toBigInteger() || discount > total) return null
        val amounts = ordered.map { discount * it.basisMinor.value.toBigInteger() / total }.toMutableList()
        var remainder = discount - amounts.fold(BigInteger.ZERO, BigInteger::add)
        for (index in ordered.indices) {
            if (remainder.signum() == 0) break
            if (amounts[index] < ordered[index].basisMinor.value.toBigInteger()) {
                amounts[index] += BigInteger.ONE
                remainder -= BigInteger.ONE
            }
        }
        if (remainder.signum() != 0) return null
        return ordered.mapIndexed { index, item ->
            LoyaltyItemDiscount(item.itemId, requireNotNull(LoyaltyMinorUnits.of(amounts[index].longValueExact())))
        }
    }
}
