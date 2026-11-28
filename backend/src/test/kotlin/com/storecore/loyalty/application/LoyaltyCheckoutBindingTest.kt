package com.storecore.loyalty.application

import com.storecore.loyalty.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class LoyaltyCheckoutBindingTest {
    private val fingerprint = requireNotNull(CartFingerprint.fromWire("a".repeat(64)))
    private val revision = requireNotNull(LoyaltyEvidenceRevision.fromWire("0"))
    private fun minor(value: Long) = requireNotNull(LoyaltyMinorUnits.fromWire(value.toString()))
    private fun points(value: Long) = requireNotNull(LoyaltyPoints.fromWire(value.toString()))

    @Test fun `selection translator preserves explicit null and rejects missing and malformed values`() {
        assertSame(CheckoutLoyaltySelection.None, CheckoutLoyaltySelection.fromWire(true, null, null))
        assertSame(CheckoutLoyaltySelection.Unknown, CheckoutLoyaltySelection.fromWire(false, null, null))
        val id = UUID.randomUUID().toString()
        val selected = CheckoutLoyaltySelection.fromWire(true, id, "0") as CheckoutLoyaltySelection.Reservation
        assertEquals(UUID.fromString(id), selected.reservationId)
        assertEquals(0L, selected.expectedRevision.value)
        assertEquals(listOf(null), CheckoutLoyaltySelection.None.replayIdentity)
        assertNotEquals(selected.replayIdentity, CheckoutLoyaltySelection.None.replayIdentity)
        assertNotEquals(selected.replayIdentity, CheckoutLoyaltySelection.fromWire(true, id, "1").replayIdentity)
        assertNotEquals(selected.replayIdentity, CheckoutLoyaltySelection.fromWire(true, UUID.randomUUID().toString(), "0").replayIdentity)
        for ((wireId, wireRevision) in listOf(id.uppercase() to "0", "1-1-1-1-1" to "0", UUID(0, 0).toString() to "0", id to "01", id to "-1", id to null, null to "0")) {
            assertSame(CheckoutLoyaltySelection.Unknown, CheckoutLoyaltySelection.fromWire(true, wireId, wireRevision))
        }
    }

    @Test fun `local plan allocates only after final order item identity is known`() {
        val candidates = listOf(10L, 20L, 30L).map { id ->
            val profileRevision = requireNotNull(LoyaltyEvidenceRevision.fromWire("1"))
            val profile = LoyaltyPriceProfile(id, id, profileRevision, LoyaltyEvidenceCurrency.ARS,
                minor(400), minor(333), minor(67), LoyaltyItemClassification.STANDARD,
                LoyaltyEvidenceKind.MERCHANT_ACCOUNTANT_PROFILE, "merchant-profile", UUID(1, id), Instant.EPOCH)
            LoyaltyEarningCandidate(0, LoyaltyCartLine(id, id, 3, minor(400), minor(400), LoyaltyDiscountState.NONE), profile, profileRevision)
        }
        val lines = candidates.map { (LoyaltyEvidenceAdmissionStep.admit(it.cart, it.source, it.latestProfileRevision, LoyaltyEvidencePurpose.REDEMPTION) as LoyaltyEvidenceAdmission.Available).snapshot }
        val quote = (LoyaltyQuoteEvidenceStep.freeze(fingerprint, revision, lines, points(10), points(1)) as LoyaltyEvidenceAdmission.Available).snapshot
        val plan = LoyaltyCheckoutPlan(fingerprint, revision, candidates, quote, null)
        val final = (plan.finish(mapOf(10L to 300L, 20L to 100L, 30L to 200L), minor(51)) as LoyaltyEarningEvidence.Available).snapshot
        assertEquals(100L, plan.discount.value)
        assertEquals(listOf(34L, 33L, 33L), final.lines.map { it.allocatedDiscount.value })
        assertEquals(3500L, final.netSubtotal.value)
        assertEquals(3551L, final.total.value)
        assertTrue(final.lines.all { it.evidence.cart.effectiveUnitPrice.value == 400L })
        assertThrows(NoSuchElementException::class.java) { plan.finish(mapOf(10L to 300L), minor(0)) }
    }

    @Test fun `explicit null freezes unavailable evidence without inventing earning`() {
        val plan = LoyaltyCheckoutPlan(fingerprint, revision, emptyList(), null, LoyaltyEvidenceUnavailableReason.MISSING_PROFILE)
        assertEquals(0L, plan.discount.value)
        val final = plan.finish(mapOf(1L to 99L), minor(50)) as LoyaltyEarningEvidence.Unavailable
        assertEquals(LoyaltyEvidenceUnavailableReason.MISSING_PROFILE, final.snapshot.reason)
        assertEquals(fingerprint, final.snapshot.cartFingerprint)
    }
}
