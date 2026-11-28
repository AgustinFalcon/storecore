package com.storecore.loyalty.domain

import java.util.Collections

private fun <T> immutable(values: List<T>): List<T> = Collections.unmodifiableList(ArrayList(values))
private fun unavailable(reason: LoyaltyEvidenceUnavailableReason) = LoyaltyEvidenceAdmission.Unavailable(reason)

class LoyaltyQuoteEvidence internal constructor(
    val cartFingerprint: CartFingerprint, val revision: LoyaltyEvidenceRevision, lines: List<LoyaltyFrozenLine>,
    val selectedPoints: LoyaltyPoints, val discount: LoyaltyMinorUnits, val eligibleBase: LoyaltyMinorUnits,
) {
    val policy = LoyaltyPolicyId.V1
    val lines: List<LoyaltyFrozenLine> = immutable(lines.sortedBy { it.cart.cartItemId })
    val hash: LoyaltyFingerprint = LoyaltyFingerprint.canonical(listOf(
        "loyalty-quote-evidence-v1", cartFingerprint.value, revision.value.toString(), policy.wire,
        selectedPoints.value.toString(), discount.value.toString(), eligibleBase.value.toString(),
    ) + this.lines.flatMap { it.identity })
}

object LoyaltyQuoteEvidenceStep {
    fun freeze(cartFingerprint: CartFingerprint, revision: LoyaltyEvidenceRevision, lines: List<LoyaltyFrozenLine>,
               availablePoints: LoyaltyPoints, selectedPoints: LoyaltyPoints): LoyaltyEvidenceAdmission<LoyaltyQuoteEvidence> {
        if (lines.isEmpty() || lines.map { it.cart.cartItemId }.toSet().size != lines.size)
            return unavailable(LoyaltyEvidenceUnavailableReason.CART_CHANGED)
        if (lines.any { it.cart.discountState != LoyaltyDiscountState.NONE }) return unavailable(LoyaltyEvidenceUnavailableReason.DISCOUNT_PRESENT)
        val base = LoyaltyCheckedMoney.sum(lines.map { it.eligiblePreRedemption }) ?: return unavailable(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN)
        if (LoyaltyCheckedMoney.sum(lines.map { it.grossLineBeforeLoyalty }) == null) return unavailable(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN)
        val quote = LoyaltyPolicyV1.quote(availablePoints, base, selectedPoints, LoyaltyDiscountState.NONE).quote
            ?: return unavailable(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN)
        return LoyaltyEvidenceAdmission.Available(LoyaltyQuoteEvidence(cartFingerprint, revision, lines, selectedPoints, quote.discountMinor, base))
    }

    fun rehydrate(
        cartFingerprint: CartFingerprint,
        revision: LoyaltyEvidenceRevision,
        expectedHash: LoyaltyFingerprint,
        lines: List<LoyaltyFrozenLine>,
        selectedPoints: LoyaltyPoints,
        discountMinor: LoyaltyMinorUnits,
    ): LoyaltyQuoteEvidence? {
        if (lines.isEmpty() || lines.map { it.cart.cartItemId }.toSet().size != lines.size) return null
        if (lines.any { it.cart.discountState != LoyaltyDiscountState.NONE }) return null
        if (selectedPoints.value <= 0 || discountMinor.value <= 0) return null
        val base = LoyaltyCheckedMoney.sum(lines.map { it.eligiblePreRedemption }) ?: return null
        if (LoyaltyCheckedMoney.sum(lines.map { it.grossLineBeforeLoyalty }) == null) return null
        val quote = LoyaltyPolicyV1.quote(selectedPoints, base, selectedPoints, LoyaltyDiscountState.NONE).quote ?: return null
        if (quote.discountMinor != discountMinor) return null
        val evidence = LoyaltyQuoteEvidence(cartFingerprint, revision, lines, selectedPoints, discountMinor, base)
        return evidence.takeIf { it.hash == expectedHash }
    }
}

data class LoyaltyOrderItemCorrelation(val orderItemId: Long, val evidence: LoyaltyFrozenLine)

/** Verifies every stable line and every price/profile fact, independent of equal order totals. */
object LoyaltyQuoteCorrelationStep {
    fun matches(quote: LoyaltyQuoteEvidence, cartFingerprint: CartFingerprint, items: List<LoyaltyOrderItemCorrelation>): Boolean {
        if (cartFingerprint != quote.cartFingerprint || !validCorrelation(items) || items.size != quote.lines.size) return false
        val current = items.associateBy { it.evidence.cart.cartItemId }
        return quote.lines.all { frozen -> current[frozen.cart.cartItemId]?.evidence?.identity == frozen.identity }
    }
}

private fun validCorrelation(items: List<LoyaltyOrderItemCorrelation>): Boolean = items.isNotEmpty() &&
    items.all { it.orderItemId > 0 } && items.map { it.orderItemId }.toSet().size == items.size &&
    items.map { it.evidence.cart.cartItemId }.toSet().size == items.size

class LoyaltyFinalLine internal constructor(
    val orderItemId: Long, val evidence: LoyaltyFrozenLine, val allocatedDiscount: LoyaltyMinorUnits,
    val payable: LoyaltyMinorUnits, val finalEarning: LoyaltyMinorUnits,
)

object LoyaltyPayableLineStep {
    fun calculate(item: LoyaltyOrderItemCorrelation, discount: LoyaltyMinorUnits): LoyaltyFinalLine? {
        val earning = LoyaltyCheckedMoney.subtract(item.evidence.eligiblePreRedemption, discount) ?: return null
        val payable = LoyaltyCheckedMoney.subtract(item.evidence.grossLineBeforeLoyalty, discount) ?: return null
        return LoyaltyFinalLine(item.orderItemId, item.evidence, discount, payable, earning)
    }
}

class LoyaltyFinalEvidence internal constructor(
    val cartFingerprint: CartFingerprint, val revision: LoyaltyEvidenceRevision, val quoteHash: LoyaltyFingerprint?,
    lines: List<LoyaltyFinalLine>, val netSubtotal: LoyaltyMinorUnits, val shipping: LoyaltyMinorUnits,
    val total: LoyaltyMinorUnits, val finalEarning: LoyaltyMinorUnits,
) {
    val policy = LoyaltyPolicyId.V1
    val lines: List<LoyaltyFinalLine> = immutable(lines.sortedBy { it.orderItemId })
    val hash = LoyaltyFingerprint.canonical(listOf("loyalty-final-evidence-v1", cartFingerprint.value, revision.value.toString(),
        policy.wire, quoteHash?.value ?: "", netSubtotal.value.toString(), shipping.value.toString(), total.value.toString(), finalEarning.value.toString()) +
        this.lines.flatMap { listOf(it.orderItemId.toString()) + it.evidence.identity + listOf(it.allocatedDiscount.value.toString(), it.payable.value.toString(), it.finalEarning.value.toString()) })
}

/** Composes correlation, deterministic cent allocation and payable calculation; performs no persistence. */
object LoyaltyFinalEvidenceStep {
    fun bind(quote: LoyaltyQuoteEvidence, cartFingerprint: CartFingerprint, items: List<LoyaltyOrderItemCorrelation>,
             shipping: LoyaltyMinorUnits): LoyaltyEvidenceAdmission<LoyaltyFinalEvidence> {
        if (!LoyaltyQuoteCorrelationStep.matches(quote, cartFingerprint, items)) return unavailable(LoyaltyEvidenceUnavailableReason.CART_CHANGED)
        val bases = items.map { requireNotNull(LoyaltyItemBasis.create(it.orderItemId, it.evidence.eligiblePreRedemption)) }
        val allocation = LoyaltyDiscountAllocator.allocate(quote.selectedPoints, bases)
            ?: return unavailable(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN)
        if (LoyaltyCheckedMoney.sum(allocation.map { it.discountMinor }) != quote.discount) return unavailable(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN)
        return finish(cartFingerprint, quote.revision, quote.hash, items, allocation.associate { it.itemId to it.discountMinor }, shipping)
    }

    fun withoutRedemption(cartFingerprint: CartFingerprint, revision: LoyaltyEvidenceRevision,
                          items: List<LoyaltyOrderItemCorrelation>, shipping: LoyaltyMinorUnits): LoyaltyEvidenceAdmission<LoyaltyFinalEvidence> {
        if (!validCorrelation(items)) return unavailable(LoyaltyEvidenceUnavailableReason.CART_CHANGED)
        return finish(cartFingerprint, revision, null, items, items.associate { it.orderItemId to requireNotNull(LoyaltyMinorUnits.of(0)) }, shipping)
    }

    private fun finish(cartFingerprint: CartFingerprint, revision: LoyaltyEvidenceRevision, quoteHash: LoyaltyFingerprint?,
                       items: List<LoyaltyOrderItemCorrelation>, discounts: Map<Long, LoyaltyMinorUnits>,
                       shipping: LoyaltyMinorUnits): LoyaltyEvidenceAdmission<LoyaltyFinalEvidence> {
        val lines = items.map { LoyaltyPayableLineStep.calculate(it, discounts.getValue(it.orderItemId))
            ?: return unavailable(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN) }
        val subtotal = LoyaltyCheckedMoney.sum(lines.map { it.payable }) ?: return unavailable(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN)
        val total = LoyaltyCheckedMoney.sum(listOf(subtotal, shipping)) ?: return unavailable(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN)
        val earning = LoyaltyCheckedMoney.sum(lines.map { it.finalEarning }) ?: return unavailable(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN)
        return LoyaltyEvidenceAdmission.Available(LoyaltyFinalEvidence(cartFingerprint, revision, quoteHash, lines, subtotal, shipping, total, earning))
    }
}

data class LoyaltyEarningCandidate(
    val orderItemId: Long, val cart: LoyaltyCartLine,
    val source: LoyaltyPriceProfile?, val latestProfileRevision: LoyaltyEvidenceRevision,
)

sealed interface LoyaltyEarningEvidence {
    class Available internal constructor(val snapshot: LoyaltyFinalEvidence) : LoyaltyEarningEvidence
    class Unavailable internal constructor(val snapshot: LoyaltyUnavailableEarningSnapshot) : LoyaltyEarningEvidence
}

/** Explicit null selection still freezes exactly one available or unavailable earning result. */
object LoyaltyEarningEvidenceStep {
    fun freeze(cartFingerprint: CartFingerprint, revision: LoyaltyEvidenceRevision,
               candidates: List<LoyaltyEarningCandidate>, shipping: LoyaltyMinorUnits): LoyaltyEarningEvidence {
        fun unavailableEarning(reason: LoyaltyEvidenceUnavailableReason) = LoyaltyEarningEvidence.Unavailable(
            LoyaltyUnavailableEarningSnapshot.create(cartFingerprint, revision, reason))
        // Stable ordering ensures one deterministic reason even if several lines lack evidence.
        val items = candidates.sortedBy { it.cart.cartItemId }.map { candidate ->
            when (val admitted = LoyaltyEvidenceAdmissionStep.admit(candidate.cart, candidate.source,
                candidate.latestProfileRevision, LoyaltyEvidencePurpose.EARNING)) {
                is LoyaltyEvidenceAdmission.Available -> LoyaltyOrderItemCorrelation(candidate.orderItemId, admitted.snapshot)
                is LoyaltyEvidenceAdmission.Unavailable -> return unavailableEarning(admitted.reason)
            }
        }
        return when (val result = LoyaltyFinalEvidenceStep.withoutRedemption(cartFingerprint, revision, items, shipping)) {
            is LoyaltyEvidenceAdmission.Available -> LoyaltyEarningEvidence.Available(result.snapshot)
            is LoyaltyEvidenceAdmission.Unavailable -> unavailableEarning(result.reason)
        }
    }
}
