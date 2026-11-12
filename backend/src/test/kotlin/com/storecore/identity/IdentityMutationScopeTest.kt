package com.storecore.identity

import com.storecore.identity.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.util.UUID

class IdentityMutationScopeTest {
    @Test fun `challenge evidence accepts only exact known wire codes`() {
        assertEquals(ChallengeCredentialEvidence.VERIFIED, ChallengeCredentialEvidence.fromWire("VERIFIED"))
        assertEquals(ChallengeCredentialEvidence.LEGACY_UNVERIFIABLE, ChallengeCredentialEvidence.fromWire("LEGACY_UNVERIFIABLE"))
        listOf(null, "", "verified", " VERIFIED ", "future").forEach {
            assertEquals(ChallengeCredentialEvidence.Unknown, ChallengeCredentialEvidence.fromWire(it))
        }
    }

    @Test fun `scopes preserve realm ownership even when numeric ids match`() {
        val customer = CustomerPrincipal(UUID.randomUUID(), 42)
        val user = InternalUserPrincipal(UUID.randomUUID(), 42, setOf(InternalRole.ADMIN))
        val scope = IdentityMutationScope.CustomerTarget(IdentitySubject.of(user), IdentitySubject.of(customer))
        assertEquals(2, scope.subjects.size)
        assertEquals(setOf(IdentitySubject.of(customer)), IdentityMutationScope.Own(IdentitySubject.of(customer)).subjects)
        assertTrue(IdentityMutationScope.Unknown.subjects.isEmpty())
        assertThrows(IllegalArgumentException::class.java) { IdentitySubject(IdentityRealm.USER, 0) }
        assertThrows(IllegalArgumentException::class.java) {
            IdentityMutationScope.CustomerTarget(IdentitySubject.of(user), IdentitySubject.of(user))
        }
    }
}
