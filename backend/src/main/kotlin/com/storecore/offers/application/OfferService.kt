package com.storecore.offers.application

import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.offers.domain.DiscountKind
import com.storecore.offers.domain.OfferDraft
import com.storecore.offers.domain.OfferTransition
import com.storecore.offers.domain.OfferView
import java.math.BigDecimal

class OfferService(private val repository: OfferRepository) : OfferUseCases {
    override fun list(): List<OfferView> = repository.list()

    override fun create(actor: InternalUserPrincipal, draft: OfferDraft): OfferView {
        val normalized = draft.copy(name = draft.name.trim(), skus = draft.skus.map(String::trim).distinct())
        if (normalized.name.isEmpty() || normalized.name.length > 160 ||
            normalized.priority !in 0..1_000_000 || !normalized.endsAt.isAfter(normalized.startsAt) ||
            normalized.discountKind == DiscountKind.UNKNOWN || normalized.discountValue.scale() > 2 ||
            normalized.discountValue <= BigDecimal.ZERO ||
            (normalized.discountKind == DiscountKind.PERCENT && normalized.discountValue > HUNDRED) ||
            normalized.skus.isEmpty() || normalized.skus.size > 200 ||
            normalized.skus.any { it.isEmpty() || it.length > 128 }
        ) throw OfferValidationFailed()
        if (normalized.minMarginPercent.compareTo(BigDecimal.ZERO) != 0) throw OfferCostBasisUnavailable()
        return repository.create(actor, normalized)
    }

    override fun transition(actor: InternalUserPrincipal, id: Long, transition: OfferTransition): OfferView {
        if (id <= 0 || transition == OfferTransition.Unknown) throw OfferTransitionInvalid()
        return repository.transition(actor, id, transition)
    }

    private companion object { val HUNDRED = BigDecimal("100") }
}

class OfferValidationFailed : RuntimeException("OFFER_VALIDATION_FAILED")
class OfferCostBasisUnavailable : RuntimeException("COST_BASIS_UNAVAILABLE")
class OfferNotFound : RuntimeException("OFFER_NOT_FOUND")
class OfferTransitionInvalid : RuntimeException("OFFER_TRANSITION_INVALID")
