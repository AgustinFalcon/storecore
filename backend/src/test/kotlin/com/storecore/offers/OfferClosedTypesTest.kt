package com.storecore.offers

import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.offers.application.OfferCostBasisUnavailable
import com.storecore.offers.application.OfferRepository
import com.storecore.offers.application.OfferService
import com.storecore.offers.domain.DiscountKind
import com.storecore.offers.domain.OfferDraft
import com.storecore.offers.domain.OfferStatus
import com.storecore.offers.domain.OfferTransition
import com.storecore.offers.domain.OfferView
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class OfferClosedTypesTest {
    @Test fun `wire values are closed and unknown fails transitions`() {
        assertEquals(OfferStatus.UNKNOWN, OfferStatus.fromWire("ACTIVE "))
        assertEquals(DiscountKind.UNKNOWN, DiscountKind.fromWire("RATIO"))
        assertEquals(OfferTransition.Unknown, OfferTransition.fromWire("RESUME"))
        assertFalse(OfferTransition.Unknown.accepts(OfferStatus.DRAFT))
    }

    @Test fun `transition matrix keeps ended terminal`() {
        assertTrue(OfferTransition.Activate.accepts(OfferStatus.DRAFT))
        assertTrue(OfferTransition.Activate.accepts(OfferStatus.PAUSED))
        assertTrue(OfferTransition.Pause.accepts(OfferStatus.ACTIVE))
        assertFalse(OfferTransition.Activate.accepts(OfferStatus.ENDED))
        assertFalse(OfferTransition.End.accepts(OfferStatus.ENDED))
    }

    @Test fun `nonzero margin fails closed before persistence`() {
        val repository = object : OfferRepository {
            override fun list() = emptyList<OfferView>()
            override fun create(actor: InternalUserPrincipal, draft: OfferDraft): OfferView = error("must not persist")
            override fun transition(actor: InternalUserPrincipal, id: Long, transition: OfferTransition): OfferView = error("unused")
        }
        val draft = OfferDraft("Oferta", 1, Instant.now(), Instant.now().plusSeconds(60), DiscountKind.PERCENT, BigDecimal.TEN, BigDecimal.ONE, listOf("SKU"))
        assertFailsWith<OfferCostBasisUnavailable> {
            OfferService(repository).create(InternalUserPrincipal(UUID.randomUUID(), 1, setOf(InternalRole.ADMIN)), draft)
        }
    }
}
