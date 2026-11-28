package com.storecore.commerce

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.storecore.commerce.infrastructure.CheckoutCommandFingerprintCompatibility
import com.storecore.commerce.infrastructure.CheckoutCommandFingerprintVersion
import com.storecore.loyalty.domain.CheckoutLoyaltySelection
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.UUID

class CheckoutCommandFingerprintCompatibilityTest {
    private val mapper = jacksonObjectMapper()
    private val current = "a".repeat(64)
    private val legacy = "b".repeat(64)

    @Test fun `unversioned historical claim replays only an exact null selection`() {
        val snapshot = mapper.createObjectNode().put("commandFingerprint", legacy)
        assertTrue(CheckoutCommandFingerprintCompatibility.matches(snapshot, current, legacy, CheckoutLoyaltySelection.None))
        snapshot.put("commandFingerprintVersion", CheckoutCommandFingerprintVersion.LEGACY.wire)
        assertTrue(CheckoutCommandFingerprintCompatibility.matches(snapshot, current, legacy, CheckoutLoyaltySelection.None))
        assertFalse(CheckoutCommandFingerprintCompatibility.matches(snapshot, current, legacy,
            CheckoutLoyaltySelection.fromWire(true, UUID.randomUUID().toString(), "0")))
        assertFalse(CheckoutCommandFingerprintCompatibility.matches(snapshot.put("commandFingerprint", current), current, legacy, CheckoutLoyaltySelection.None))
    }

    @Test fun `version two requires the new exact identity and rejects unknown versions`() {
        val snapshot = mapper.createObjectNode()
            .put("commandFingerprintVersion", CheckoutCommandFingerprintVersion.LOYALTY_V2.wire)
            .put("commandFingerprint", current)
        assertTrue(CheckoutCommandFingerprintCompatibility.matches(snapshot, current, legacy, CheckoutLoyaltySelection.None))
        assertFalse(CheckoutCommandFingerprintCompatibility.matches(snapshot, "c".repeat(64), legacy, CheckoutLoyaltySelection.None))
        snapshot.put("commandFingerprintVersion", 99)
        assertFalse(CheckoutCommandFingerprintCompatibility.matches(snapshot, current, legacy, CheckoutLoyaltySelection.None))
    }
}
