package com.storecore.loyalty.application

import com.storecore.loyalty.domain.*

/** Immutable pre-write plan. Item ids are assigned only by the local order insert. */
class LoyaltyCheckoutPlan(
    val cartFingerprint: CartFingerprint,
    val revision: LoyaltyEvidenceRevision,
    val candidates: List<LoyaltyEarningCandidate>,
    val quote: LoyaltyQuoteEvidence?,
    val unavailableReason: LoyaltyEvidenceUnavailableReason?,
) {
    val discount: LoyaltyMinorUnits get() = quote?.discount ?: requireNotNull(LoyaltyMinorUnits.of(0))

    fun finish(orderItems: Map<Long, Long>, shipping: LoyaltyMinorUnits): LoyaltyEarningEvidence {
        if (unavailableReason != null) return LoyaltyEarningEvidence.Unavailable(
            LoyaltyUnavailableEarningSnapshot.create(cartFingerprint, revision, unavailableReason))
        val correlated = candidates.map { candidate -> candidate.copy(orderItemId = orderItems.getValue(candidate.cart.cartItemId)) }
        if (quote == null) return LoyaltyEarningEvidenceStep.freeze(cartFingerprint, revision, correlated, shipping)
        val items = correlated.map { candidate ->
            val admitted = LoyaltyEvidenceAdmissionStep.admit(candidate.cart, candidate.source,
                candidate.latestProfileRevision, LoyaltyEvidencePurpose.REDEMPTION)
            require(admitted is LoyaltyEvidenceAdmission.Available)
            LoyaltyOrderItemCorrelation(candidate.orderItemId, admitted.snapshot)
        }
        val result = LoyaltyFinalEvidenceStep.bind(quote, cartFingerprint, items, shipping)
        require(result is LoyaltyEvidenceAdmission.Available)
        return LoyaltyEarningEvidence.Available(result.snapshot)
    }
}
