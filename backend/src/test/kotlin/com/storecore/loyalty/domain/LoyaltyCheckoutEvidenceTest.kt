package com.storecore.loyalty.domain

import java.time.Instant
import java.util.UUID
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class LoyaltyCheckoutEvidenceTest {
    private val fingerprint = requireNotNull(CartFingerprint.fromWire("a".repeat(64)))
    private val revision = requireNotNull(LoyaltyEvidenceRevision.fromWire("1"))
    private fun profile(id: Long = 1, gross: Long = 400, merchandise: Long = 333,
                        classification: LoyaltyItemClassification = LoyaltyItemClassification.STANDARD) = LoyaltyPriceProfile(
        id, 10, revision, LoyaltyEvidenceCurrency.ARS, minor(gross), minor(merchandise), minor(gross - merchandise),
        classification, LoyaltyEvidenceKind.MERCHANT_ACCOUNTANT_PROFILE, "merchant-profile", UUID(1, 1), Instant.EPOCH,
    )
    private fun line(id: Long = 1, quantity: Long = 3, gross: Long = 400,
                     discount: LoyaltyDiscountState = LoyaltyDiscountState.NONE) = LoyaltyCartLine(
        id, 10, quantity, minor(if (discount == LoyaltyDiscountState.PRESENT) Math.addExact(gross, 1) else gross), minor(gross), discount,
    )
    private fun admitted(line: LoyaltyCartLine, profile: LoyaltyPriceProfile = profile()) =
        (LoyaltyEvidenceAdmissionStep.admit(line, profile, revision, LoyaltyEvidencePurpose.REDEMPTION) as LoyaltyEvidenceAdmission.Available).snapshot

    @Test fun `cart fingerprint and evidence revision are strict distinct values`() {
        for (wire in listOf(null, "", "A".repeat(64), "a".repeat(63), "1", " a".repeat(32))) assertNull(CartFingerprint.fromWire(wire))
        assertEquals(fingerprint, CartFingerprint.fromWire("a".repeat(64)))
        assertNull(LoyaltyEvidenceRevision.fromWire("01"))
        assertNull(LoyaltyEvidenceRevision.fromWire("-1"))
        assertNull(LoyaltyEvidenceRevision.fromWire(Long.MAX_VALUE.toString())!!.next())
        LoyaltyEvidenceKind.entries.forEach { assertSame(it, LoyaltyEvidenceKind.fromWire(it.wire)) }
        LoyaltyEvidenceUnavailableReason.entries.forEach { assertSame(it, LoyaltyEvidenceUnavailableReason.fromWire(it.wire)) }
        assertSame(LoyaltyEvidenceKind.UNKNOWN, LoyaltyEvidenceKind.fromWire("future"))
        assertSame(LoyaltyEvidenceUnavailableReason.UNKNOWN, LoyaltyEvidenceUnavailableReason.fromWire("future"))
    }

    @Test fun `admission freezes exact tax inclusive equations and excludes nonstandard merchandise`() {
        val basis = admitted(line())
        assertEquals(1200L, basis.grossLineBeforeLoyalty.value)
        assertEquals(999L, basis.eligiblePreRedemption.value)
        assertEquals(201L, basis.excludedTax.value)
        for (kind in listOf(LoyaltyItemClassification.OUTLET, LoyaltyItemClassification.GIFT_VALUE, LoyaltyItemClassification.LOYALTY_VALUE)) {
            assertEquals(0L, admitted(line(), profile(classification = kind)).eligiblePreRedemption.value)
        }
    }

    @Test fun `missing stale unknown currency tax contradictions and discounts fail closed`() {
        fun reason(p: LoyaltyPriceProfile?, latest: LoyaltyEvidenceRevision = revision,
                   cart: LoyaltyCartLine = line()) = (LoyaltyEvidenceAdmissionStep.admit(cart, p, latest, LoyaltyEvidencePurpose.REDEMPTION) as LoyaltyEvidenceAdmission.Unavailable).reason
        assertSame(LoyaltyEvidenceUnavailableReason.MISSING_PROFILE, reason(null))
        assertSame(LoyaltyEvidenceUnavailableReason.STALE_SOURCE, reason(profile(), revision.next()!!))
        assertSame(LoyaltyEvidenceUnavailableReason.UNKNOWN, reason(profile().copy(classification = LoyaltyItemClassification.UNKNOWN)))
        assertSame(LoyaltyEvidenceUnavailableReason.WRONG_CURRENCY, reason(profile().copy(currency = LoyaltyEvidenceCurrency.UNKNOWN)))
        assertSame(LoyaltyEvidenceUnavailableReason.MISSING_TAX_EVIDENCE, reason(profile().copy(excludedTaxUnit = null)))
        assertSame(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN, reason(profile().copy(excludedTaxUnit = minor(1))))
        assertSame(LoyaltyEvidenceUnavailableReason.STALE_SOURCE, reason(profile(gross = 401)))
        assertSame(LoyaltyEvidenceUnavailableReason.DISCOUNT_PRESENT, reason(profile(), cart = line(discount = LoyaltyDiscountState.PRESENT)))
        assertSame(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN, reason(profile(), cart = line().copy(discountState = LoyaltyDiscountState.PRESENT)))
        assertSame(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN, reason(profile(), cart = line().copy(originalUnitPrice = minor(401))))
        assertSame(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN, reason(profile(gross = Long.MAX_VALUE, merchandise = 0), cart = line(gross = Long.MAX_VALUE)))
    }

    @Test fun `quote has no allocation and final ids decide remainder without changing quantity three unit price`() {
        val lines = listOf(1L, 2L, 3L).map { admitted(line(it)) }
        val quote = (LoyaltyQuoteEvidenceStep.freeze(fingerprint, revision, lines, points(10), points(1)) as LoyaltyEvidenceAdmission.Available).snapshot
        val mapping = listOf(LoyaltyOrderItemCorrelation(30, lines[0]), LoyaltyOrderItemCorrelation(10, lines[1]), LoyaltyOrderItemCorrelation(20, lines[2]))
        val final = (LoyaltyFinalEvidenceStep.bind(quote, fingerprint, mapping, minor(51)) as LoyaltyEvidenceAdmission.Available).snapshot
        assertEquals(listOf(10L, 20L, 30L), final.lines.map { it.orderItemId })
        assertEquals(listOf(34L, 33L, 33L), final.lines.map { it.allocatedDiscount.value })
        assertEquals(3500L, final.netSubtotal.value)
        assertEquals(3551L, final.total.value)
        assertEquals(2897L, final.finalEarning.value)
        assertTrue(final.lines.all { it.evidence.cart.effectiveUnitPrice.value == 400L && it.evidence.cart.quantity == 3L })
        assertEquals(quote.hash, final.quoteHash)
        assertEquals(final.hash, (LoyaltyFinalEvidenceStep.bind(quote, fingerprint, mapping.reversed(), minor(51)) as LoyaltyEvidenceAdmission.Available).snapshot.hash)
    }

    @Test fun `equal total substitutions duplicate identities and changed fingerprint cannot bind`() {
        val basis = admitted(line(gross = 500), profile(gross = 500, merchandise = 400))
        val quote = (LoyaltyQuoteEvidenceStep.freeze(fingerprint, revision, listOf(basis), points(10), points(1)) as LoyaltyEvidenceAdmission.Available).snapshot
        val changed = admitted(line(quantity = 4, gross = 375), profile(gross = 375, merchandise = 300))
        for (mapping in listOf(emptyList(), listOf(LoyaltyOrderItemCorrelation(1, changed)), listOf(LoyaltyOrderItemCorrelation(1, basis), LoyaltyOrderItemCorrelation(1, basis)))) {
            assertTrue(LoyaltyFinalEvidenceStep.bind(quote, fingerprint, mapping, minor(0)) is LoyaltyEvidenceAdmission.Unavailable)
        }
        assertTrue(LoyaltyFinalEvidenceStep.bind(quote, CartFingerprint.fromWire("b".repeat(64))!!, listOf(LoyaltyOrderItemCorrelation(1, basis)), minor(0)) is LoyaltyEvidenceAdmission.Unavailable)
        val source = profile(gross = 500, merchandise = 400)
        val mutations = listOf(
            source.copy(id = 2),
            source.copy(classification = LoyaltyItemClassification.OUTLET),
            source.copy(merchandiseExcludingTaxUnit = minor(399), excludedTaxUnit = minor(101)),
            source.copy(revision = revision.next()!!),
            source.copy(variantId = 11),
        )
        for (mutation in mutations) {
            val cart = line(gross = 500).copy(variantId = mutation.variantId)
            val fresh = (LoyaltyEvidenceAdmissionStep.admit(cart, mutation, mutation.revision,
                LoyaltyEvidencePurpose.REDEMPTION) as LoyaltyEvidenceAdmission.Available).snapshot
            assertFalse(LoyaltyQuoteCorrelationStep.matches(quote, fingerprint, listOf(LoyaltyOrderItemCorrelation(1, fresh))))
        }
    }

    @Test fun `null selection freezes discounted earnings or a single typed unavailable snapshot`() {
        val discounted = line(discount = LoyaltyDiscountState.PRESENT)
        val evidence = (LoyaltyEvidenceAdmissionStep.admit(discounted, profile(), revision, LoyaltyEvidencePurpose.EARNING) as LoyaltyEvidenceAdmission.Available).snapshot
        val result = LoyaltyFinalEvidenceStep.withoutRedemption(fingerprint, revision, listOf(LoyaltyOrderItemCorrelation(8, evidence)), minor(21))
        val final = (result as LoyaltyEvidenceAdmission.Available).snapshot
        assertNull(final.quoteHash)
        assertEquals(401L, final.lines.single().evidence.cart.originalUnitPrice.value)
        assertEquals(400L, final.lines.single().evidence.cart.effectiveUnitPrice.value)
        assertEquals(0L, final.lines.single().allocatedDiscount.value)
        assertEquals(999L, final.finalEarning.value)
        assertEquals(1221L, final.total.value)
        val unavailable = LoyaltyUnavailableEarningSnapshot.create(fingerprint, revision, LoyaltyEvidenceUnavailableReason.MISSING_PROFILE)
        assertEquals(fingerprint, unavailable.cartFingerprint)
        assertSame(LoyaltyEvidenceUnavailableReason.MISSING_PROFILE, unavailable.reason)
        val candidates = listOf(LoyaltyEarningCandidate(8, discounted, profile(), revision))
        val frozen = LoyaltyEarningEvidenceStep.freeze(fingerprint, revision, candidates, minor(21)) as LoyaltyEarningEvidence.Available
        assertEquals(final.hash, frozen.snapshot.hash)
        val missing = LoyaltyEarningEvidenceStep.freeze(fingerprint, revision,
            candidates + LoyaltyEarningCandidate(9, line(2), null, revision), minor(21)) as LoyaltyEarningEvidence.Unavailable
        assertSame(LoyaltyEvidenceUnavailableReason.MISSING_PROFILE, missing.snapshot.reason)
    }

    @Test fun `final sum and shipping overflow produce typed unavailable without wrapping money`() {
        val basis = admitted(line(quantity = 1, gross = Long.MAX_VALUE), profile(gross = Long.MAX_VALUE, merchandise = 0))
        assertTrue(LoyaltyFinalEvidenceStep.withoutRedemption(fingerprint, revision,
            listOf(LoyaltyOrderItemCorrelation(1, basis)), minor(1)) is LoyaltyEvidenceAdmission.Unavailable)
        val second = admitted(line(id = 2, quantity = 1, gross = Long.MAX_VALUE), profile(gross = Long.MAX_VALUE, merchandise = 0))
        assertTrue(LoyaltyFinalEvidenceStep.withoutRedemption(fingerprint, revision,
            listOf(LoyaltyOrderItemCorrelation(1, basis), LoyaltyOrderItemCorrelation(2, second)), minor(0)) is LoyaltyEvidenceAdmission.Unavailable)
    }

    @Test fun `mixed classifications never allocate loyalty to excluded merchandise or tax`() {
        val standard = admitted(line(1, 3, 500), profile(gross = 500, merchandise = 400))
        val outlet = admitted(line(2), profile(classification = LoyaltyItemClassification.OUTLET))
        val gift = admitted(line(3), profile(classification = LoyaltyItemClassification.GIFT_VALUE))
        val loyaltyValue = admitted(line(4), profile(classification = LoyaltyItemClassification.LOYALTY_VALUE))
        val lines = mutableListOf(standard, outlet, gift, loyaltyValue)
        val quote = (LoyaltyQuoteEvidenceStep.freeze(fingerprint, revision, lines, points(10), points(1)) as LoyaltyEvidenceAdmission.Available).snapshot
        lines.clear()
        assertEquals(4, quote.lines.size)
        val final = (LoyaltyFinalEvidenceStep.bind(quote, fingerprint,
            quote.lines.map { LoyaltyOrderItemCorrelation(it.cart.cartItemId, it) }, minor(1000)) as LoyaltyEvidenceAdmission.Available).snapshot
        assertEquals(1200L, quote.eligibleBase.value)
        assertEquals(listOf(100L, 0L, 0L, 0L), final.lines.map { it.allocatedDiscount.value })
        assertEquals(1100L, final.finalEarning.value)
        assertEquals(6000L, final.total.value)
        assertThrows(UnsupportedOperationException::class.java) { (quote.lines as MutableList<*>).clear() }
    }
}
