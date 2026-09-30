package com.storecore.blackstore

import com.storecore.blackstore.application.CompanionTokenGenerator
import com.storecore.blackstore.application.DefaultCompanionCredentialVerifier
import com.storecore.blackstore.application.port.CompanionCredentialLookup
import com.storecore.blackstore.application.port.CompanionCredentialRecord
import com.storecore.blackstore.application.port.CompanionVerifyResult
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.blackstore.domain.CompanionServiceRole
import com.storecore.blackstore.infrastructure.InMemoryCompanionSecretProvider
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.UUID

class CompanionCredentialVerifierTest {
    private val client = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    @Test
    fun fingerprintSelectsButProviderBytesAuthenticate() {
        val token = CompanionTokenGenerator.next256Bits()
        val other = CompanionTokenGenerator.next256Bits()
        val fingerprint = CompanionTokenGenerator.fingerprint(token)
        val secrets = InMemoryCompanionSecretProvider()
        secrets.put("ref:ok", token)
        val verifier = DefaultCompanionCredentialVerifier(lookup(fingerprint, record(true)), secrets)
        val verified = verifier.verify(token.copyOf())
        assertTrue(verified is CompanionVerifyResult.Verified)
        assertEquals(client, (verified as CompanionVerifyResult.Verified).principal.clientInstanceId)
        assertTrue(verifier.verify(other) is CompanionVerifyResult.Invalid)
        secrets.unavailable = true
        assertTrue(verifier.verify(token.copyOf()) is CompanionVerifyResult.ProviderUnavailable)
    }

    @Test
    fun legacyActiveWithoutAuthReadyStaysInvalid() {
        val token = CompanionTokenGenerator.next256Bits()
        val fingerprint = CompanionTokenGenerator.fingerprint(token)
        val secrets = InMemoryCompanionSecretProvider()
        secrets.put("ref:legacy", token)
        val verifier = DefaultCompanionCredentialVerifier(lookup(fingerprint, record(false)), secrets)
        assertTrue(verifier.verify(token.copyOf()) is CompanionVerifyResult.Invalid)
    }

    private fun record(authReady: Boolean) = CompanionCredentialRecord(
        companionId = 1,
        clientInstanceId = client,
        companionStatus = CompanionLifecycleStatus.ACTIVE,
        credentialId = 9,
        credentialVersion = 1,
        credentialStatus = "ACTIVE",
        authReady = authReady,
        secretRef = if (authReady) "ref:ok" else "ref:legacy",
        scopes = setOf(CompanionScope.CATALOG_READ),
        serviceRole = CompanionServiceRole.SERVICE,
    )

    private fun lookup(fingerprint: String, record: CompanionCredentialRecord) =
        CompanionCredentialLookup { incoming -> if (incoming == fingerprint) record else null }
}
