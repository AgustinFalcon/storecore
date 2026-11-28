package com.storecore.loyalty.domain

import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.domain.CapabilityState
import com.storecore.identity.domain.CustomerPrincipal
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class LoyaltyActionAdmissionTest {

    private val customer = CapabilityActor.Customer(CustomerPrincipal(UUID.fromString("11111111-1111-1111-1111-111111111111"), 11L))
    private val invalidCustomer = CapabilityActor.Customer(CustomerPrincipal(UUID.fromString("11111111-1111-1111-1111-111111111111"), 0L))
    private val admin = CapabilityActor.Internal(InternalUserPrincipal(UUID.fromString("22222222-2222-2222-2222-222222222222"), 1L, setOf(InternalRole.ADMIN)))
    private val operator = CapabilityActor.Internal(InternalUserPrincipal(UUID.fromString("33333333-3333-3333-3333-333333333333"), 2L, setOf(InternalRole.OPERATOR)))

    @Test
    fun `action wire parser is closed`() {
        assertEquals(LoyaltyAction.BIND_CHECKOUT, LoyaltyAction.fromWire("BIND_CHECKOUT"))
        assertEquals(LoyaltyAction.TERMINAL_SETTLE, LoyaltyAction.fromWire("TERMINAL_SETTLE"))
        assertEquals(LoyaltyAction.UNKNOWN, LoyaltyAction.fromWire("POST_LEDGER"))
        assertEquals(LoyaltyAction.UNKNOWN, LoyaltyAction.fromWire(null))
    }

    @Test
    fun `actor authorization enforces closed customer admin and system boundaries`() {
        assertEquals(LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.UNKNOWN_ACTION),
            LoyaltyActionAdmission.evaluate(LoyaltyAction.UNKNOWN, customer, CapabilityState.ACTIVE, LoyaltyKillSwitchStatus.NONE))

        assertEquals(LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.ACTOR_NOT_AUTHORIZED),
            LoyaltyActionAdmission.evaluate(LoyaltyAction.READ_SELF, CapabilityActor.Public, CapabilityState.ACTIVE, LoyaltyKillSwitchStatus.NONE))
        assertEquals(LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.ACTOR_NOT_AUTHORIZED),
            LoyaltyActionAdmission.evaluate(LoyaltyAction.READ_SELF, invalidCustomer, CapabilityState.ACTIVE, LoyaltyKillSwitchStatus.NONE))
        assertEquals(LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.ACTOR_NOT_AUTHORIZED),
            LoyaltyActionAdmission.evaluate(LoyaltyAction.BIND_CHECKOUT, admin, CapabilityState.ACTIVE, LoyaltyKillSwitchStatus.NONE))
        assertEquals(LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.ACTOR_NOT_AUTHORIZED),
            LoyaltyActionAdmission.evaluate(LoyaltyAction.BIND_CHECKOUT, CapabilityActor.System, CapabilityState.ACTIVE, LoyaltyKillSwitchStatus.NONE))
        assertEquals(LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.ACTOR_NOT_AUTHORIZED),
            LoyaltyActionAdmission.evaluate(LoyaltyAction.READ_ADMIN, operator, CapabilityState.ACTIVE, LoyaltyKillSwitchStatus.NONE))
        assertEquals(LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.ACTOR_NOT_AUTHORIZED),
            LoyaltyActionAdmission.evaluate(LoyaltyAction.ADMIN_ADJUST, customer, CapabilityState.ACTIVE, LoyaltyKillSwitchStatus.NONE))
        assertEquals(LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.ACTOR_NOT_AUTHORIZED),
            LoyaltyActionAdmission.evaluate(LoyaltyAction.EXPIRE_QUOTED, customer, CapabilityState.ACTIVE, LoyaltyKillSwitchStatus.NONE))
        assertEquals(LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.ACTOR_NOT_AUTHORIZED),
            LoyaltyActionAdmission.evaluate(LoyaltyAction.TERMINAL_SETTLE, admin, CapabilityState.ACTIVE, LoyaltyKillSwitchStatus.NONE))
    }

    @Test
    fun `kill switches override active and safety actions`() {
        for (action in LoyaltyAction.entries.filter { it != LoyaltyAction.UNKNOWN }) {
            val actor = when (action) {
                LoyaltyAction.READ_SELF, LoyaltyAction.RESERVE, LoyaltyAction.BIND_CHECKOUT, LoyaltyAction.CANCEL_HELD -> customer
                LoyaltyAction.READ_ADMIN, LoyaltyAction.ADMIN_ADJUST -> admin
                LoyaltyAction.EXPIRE_QUOTED, LoyaltyAction.TERMINAL_SETTLE -> CapabilityActor.System
                LoyaltyAction.UNKNOWN -> continue
            }
            assertEquals(LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.KILL_SWITCH_ACTIVE),
                LoyaltyActionAdmission.evaluate(action, actor, CapabilityState.ACTIVE, LoyaltyKillSwitchStatus.ACTIVE))
            assertEquals(LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.KILL_SWITCH_CORRUPT),
                LoyaltyActionAdmission.evaluate(action, actor, CapabilityState.ACTIVE, LoyaltyKillSwitchStatus.CORRUPT))
        }
    }

    @Test
    fun `module states admit safety and read actions while blocking mutations outside active`() {
        val nonActive = mapOf(
            CapabilityState.DISABLED to LoyaltyAdmissionDenial.MODULE_DISABLED,
            CapabilityState.READ_ONLY to LoyaltyAdmissionDenial.MODULE_READ_ONLY,
            CapabilityState.PAUSED to LoyaltyAdmissionDenial.MODULE_PAUSED,
            CapabilityState.ERROR to LoyaltyAdmissionDenial.MODULE_ERROR,
        )
        for ((state, expectedDenial) in nonActive) {
            assertEquals(LoyaltyAdmissionDecision.Admitted, LoyaltyActionAdmission.evaluate(LoyaltyAction.READ_SELF, customer, state, LoyaltyKillSwitchStatus.NONE))
            assertEquals(LoyaltyAdmissionDecision.Admitted, LoyaltyActionAdmission.evaluate(LoyaltyAction.CANCEL_HELD, customer, state, LoyaltyKillSwitchStatus.NONE))
            assertEquals(LoyaltyAdmissionDecision.Admitted, LoyaltyActionAdmission.evaluate(LoyaltyAction.READ_ADMIN, admin, state, LoyaltyKillSwitchStatus.NONE))
            assertEquals(LoyaltyAdmissionDecision.Admitted, LoyaltyActionAdmission.evaluate(LoyaltyAction.EXPIRE_QUOTED, CapabilityActor.System, state, LoyaltyKillSwitchStatus.NONE))
            assertEquals(LoyaltyAdmissionDecision.Admitted, LoyaltyActionAdmission.evaluate(LoyaltyAction.TERMINAL_SETTLE, CapabilityActor.System, state, LoyaltyKillSwitchStatus.NONE))

            assertEquals(LoyaltyAdmissionDecision.Denied(expectedDenial), LoyaltyActionAdmission.evaluate(LoyaltyAction.RESERVE, customer, state, LoyaltyKillSwitchStatus.NONE))
            assertEquals(LoyaltyAdmissionDecision.Denied(expectedDenial), LoyaltyActionAdmission.evaluate(LoyaltyAction.BIND_CHECKOUT, customer, state, LoyaltyKillSwitchStatus.NONE))
            assertEquals(LoyaltyAdmissionDecision.Denied(expectedDenial), LoyaltyActionAdmission.evaluate(LoyaltyAction.ADMIN_ADJUST, admin, state, LoyaltyKillSwitchStatus.NONE))
        }
        assertEquals(LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.MODULE_CONFIG_INVALID),
            LoyaltyActionAdmission.evaluate(LoyaltyAction.READ_SELF, customer, CapabilityState.UNKNOWN, LoyaltyKillSwitchStatus.NONE))
        assertEquals(LoyaltyAdmissionDecision.Admitted,
            LoyaltyActionAdmission.evaluate(LoyaltyAction.BIND_CHECKOUT, customer, CapabilityState.ACTIVE, LoyaltyKillSwitchStatus.NONE))
    }

    @Test
    fun `checkout selection parsing is closed and validates identity and revision`() {
        val id = UUID.fromString("44444444-4444-4444-4444-444444444444")
        val valid = LoyaltyCheckoutSelection.Reservation.of(id, 0L)
        assertTrue(valid is LoyaltyCheckoutSelection.Reservation)
        assertEquals(valid, LoyaltyCheckoutSelection.Reservation.of(id, 0L))
        assertNotEquals(valid, LoyaltyCheckoutSelection.Reservation.of(id, 1L))
        assertEquals(LoyaltyCheckoutSelection.Invalid, LoyaltyCheckoutSelection.Reservation.of(null, 0L))
        assertEquals(LoyaltyCheckoutSelection.Invalid, LoyaltyCheckoutSelection.Reservation.of(UUID(0, 0), 0L))
        assertEquals(LoyaltyCheckoutSelection.Invalid, LoyaltyCheckoutSelection.Reservation.of(id, null))
        assertEquals(LoyaltyCheckoutSelection.Invalid, LoyaltyCheckoutSelection.Reservation.of(id, -1L))
    }

    @Test
    fun `cart fingerprint is canonical regardless of line ordering and sensitive to every field`() {
        val line1 = LoyaltyCartLine(1L, 10L, 2L, LoyaltyMinorUnits.of(50000)!!, LoyaltyMinorUnits.of(50000)!!, LoyaltyDiscountState.NONE)
        val line2 = LoyaltyCartLine(2L, 20L, 1L, LoyaltyMinorUnits.of(30000)!!, LoyaltyMinorUnits.of(25000)!!, LoyaltyDiscountState.PRESENT)
        val fpA = LoyaltyCartFingerprint.compute(9L, LoyaltyEvidenceCurrency.ARS, listOf(line1, line2))
        val fpB = LoyaltyCartFingerprint.compute(9L, LoyaltyEvidenceCurrency.ARS, listOf(line2, line1))
        assertNotNull(fpA)
        assertEquals(fpA, fpB)
        assertNotEquals(fpA, LoyaltyCartFingerprint.compute(10L, LoyaltyEvidenceCurrency.ARS, listOf(line1, line2)))
        assertNotEquals(fpA, LoyaltyCartFingerprint.compute(9L, LoyaltyEvidenceCurrency.ARS, listOf(line1.copy(quantity = 3L), line2)))
        assertNull(LoyaltyCartFingerprint.compute(9L, LoyaltyEvidenceCurrency.UNKNOWN, listOf(line1)))
        assertNull(LoyaltyCartFingerprint.compute(9L, LoyaltyEvidenceCurrency.ARS, emptyList()))
    }

    @Test
    fun `quote evidence rehydrate verifies hash and rejects tampered snapshots`() {
        val rev1 = LoyaltyEvidenceRevision.fromWire("1")!!
        val rev0 = LoyaltyEvidenceRevision.fromWire("0")!!
        val line = LoyaltyCartLine(1L, 10L, 1L, LoyaltyMinorUnits.of(200_000)!!, LoyaltyMinorUnits.of(200_000)!!, LoyaltyDiscountState.NONE)
        val fp = LoyaltyCartFingerprint.compute(1L, LoyaltyEvidenceCurrency.ARS, listOf(line))!!
        val profile = LoyaltyPriceProfile(
            id = 5L,
            variantId = 10L,
            revision = rev1,
            currency = LoyaltyEvidenceCurrency.ARS,
            grossUnit = LoyaltyMinorUnits.of(200_000)!!,
            merchandiseExcludingTaxUnit = LoyaltyMinorUnits.of(165_289)!!,
            excludedTaxUnit = LoyaltyMinorUnits.of(34_711)!!,
            classification = LoyaltyItemClassification.STANDARD,
            kind = LoyaltyEvidenceKind.MERCHANT_ACCOUNTANT_PROFILE,
            sourceReference = "profile-5",
            authorizingCommandId = UUID.fromString("55555555-5555-5555-5555-555555555555"),
            recordedAt = Instant.parse("2026-11-28T01:00:00Z"),
        )
        val frozen = (LoyaltyEvidenceAdmissionStep.admit(line, profile, rev1, LoyaltyEvidencePurpose.REDEMPTION) as LoyaltyEvidenceAdmission.Available).snapshot
        val quoted = (LoyaltyQuoteEvidenceStep.freeze(fp, rev0, listOf(frozen), LoyaltyPoints.of(200)!!, LoyaltyPoints.of(100)!!) as LoyaltyEvidenceAdmission.Available).snapshot

        val rehydrated = LoyaltyQuoteEvidenceStep.rehydrate(
            cartFingerprint = fp,
            revision = rev0,
            expectedHash = quoted.hash,
            lines = listOf(frozen),
            selectedPoints = LoyaltyPoints.of(100)!!,
            discountMinor = LoyaltyMinorUnits.of(10_000)!!,
        )
        assertNotNull(rehydrated)
        assertEquals(quoted.hash, rehydrated!!.hash)

        assertNull(
            LoyaltyQuoteEvidenceStep.rehydrate(
                cartFingerprint = fp,
                revision = rev0,
                expectedHash = LoyaltyFingerprint.fromWire("0".repeat(64))!!,
                lines = listOf(frozen),
                selectedPoints = LoyaltyPoints.of(100)!!,
                discountMinor = LoyaltyMinorUnits.of(10_000)!!,
            ),
        )
        assertNull(
            LoyaltyQuoteEvidenceStep.rehydrate(
                cartFingerprint = fp,
                revision = rev0,
                expectedHash = quoted.hash,
                lines = listOf(frozen),
                selectedPoints = LoyaltyPoints.of(100)!!,
                discountMinor = LoyaltyMinorUnits.of(9_900)!!,
            ),
        )
    }
}
