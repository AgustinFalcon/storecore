package com.storecore.offers.application

import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.offers.domain.OfferDraft
import com.storecore.offers.domain.OfferTransition
import com.storecore.offers.domain.OfferView

interface OfferRepository {
    fun list(): List<OfferView>
    fun create(actor: InternalUserPrincipal, draft: OfferDraft): OfferView
    fun transition(actor: InternalUserPrincipal, id: Long, transition: OfferTransition): OfferView
}

interface OfferUseCases {
    fun list(): List<OfferView>
    fun create(actor: InternalUserPrincipal, draft: OfferDraft): OfferView
    fun transition(actor: InternalUserPrincipal, id: Long, transition: OfferTransition): OfferView
}
