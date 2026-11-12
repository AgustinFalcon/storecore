package com.storecore.identity

import com.storecore.identity.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class EmailDeliveryDomainTest {
    @Test fun `all wire vocabularies reject malformed future and absent values`() {
        assertWire(EmailOwnershipState.entries, EmailOwnershipState.Unknown, EmailOwnershipState::fromWire)
        assertWire(VerificationRequestState.entries, VerificationRequestState.Unknown, VerificationRequestState::fromWire)
        assertWire(EmailVerificationTokenState.entries, EmailVerificationTokenState.Unknown, EmailVerificationTokenState::fromWire)
        assertWire(IdentityMessageKind.entries, IdentityMessageKind.Unknown, IdentityMessageKind::fromWire)
        assertWire(IdentityOutboxState.entries, IdentityOutboxState.Unknown, IdentityOutboxState::fromWire)
        assertWire(SmtpDeliveryResult.entries, SmtpDeliveryResult.Unknown, SmtpDeliveryResult::fromWire)
        assertWire(EmailDeliveryMode.entries, EmailDeliveryMode.Unknown, EmailDeliveryMode::fromWire)
        assertWire(EmailDeliveryCapability.entries, EmailDeliveryCapability.Unknown, EmailDeliveryCapability::fromWire)
        assertWire(EmailDeliveryReadiness.entries, EmailDeliveryReadiness.Unknown, EmailDeliveryReadiness::fromWire)
        assertFalse(EmailOwnershipState.Unknown.permitsRecovery)
    }

    @Test fun `readiness is independent per capability and unknown never enables delivery`() {
        EmailDeliveryMode.entries.forEach { mode ->
            EmailDeliveryCapability.entries.forEach { capability ->
                val expected = (mode == EmailDeliveryMode.RECOVERY_ENABLED && capability != EmailDeliveryCapability.Unknown) ||
                    (mode == EmailDeliveryMode.VERIFICATION_ONLY && capability == EmailDeliveryCapability.EMAIL_VERIFICATION)
                assertEquals(expected, mode.readiness(capability).permitsEnqueue, "$mode $capability")
            }
        }
        assertFalse(EmailDeliveryReadiness.Unknown.permitsEnqueue)
    }

    @Test fun `outbox graph rejects reopening terminal and unknown states`() {
        val graph = mapOf(
            IdentityOutboxState.PENDING to setOf(IdentityOutboxState.LEASED, IdentityOutboxState.CANCELLED),
            IdentityOutboxState.RETRY to setOf(IdentityOutboxState.LEASED, IdentityOutboxState.CANCELLED),
            IdentityOutboxState.LEASED to setOf(IdentityOutboxState.SENT, IdentityOutboxState.RETRY, IdentityOutboxState.UNCERTAIN, IdentityOutboxState.DEAD, IdentityOutboxState.CANCELLED),
        )
        IdentityOutboxState.entries.forEach { from -> IdentityOutboxState.entries.forEach { to ->
            assertEquals(to in graph[from].orEmpty(), from.permitsTransitionTo(to), "$from -> $to")
        } }
        listOf(IdentityOutboxState.SENT, IdentityOutboxState.UNCERTAIN, IdentityOutboxState.DEAD, IdentityOutboxState.CANCELLED, IdentityOutboxState.Unknown).forEach { assertTrue(it.isTerminal) }
        assertEquals(IdentityOutboxState.UNCERTAIN, SmtpDeliveryResult.Unknown.resultingState)
        assertEquals(listOf(SmtpDeliveryResult.RETRYABLE_BEFORE_HANDOFF), SmtpDeliveryResult.entries.filter { it.resultingState == IdentityOutboxState.RETRY })
    }

    @Test fun `verification graph consumes or supersedes pending exactly once`() {
        EmailVerificationTokenState.entries.forEach { from -> EmailVerificationTokenState.entries.forEach { to ->
            assertEquals(from == EmailVerificationTokenState.PENDING && to in setOf(EmailVerificationTokenState.CONSUMED, EmailVerificationTokenState.SUPERSEDED), from.permitsTransitionTo(to))
        } }
    }

    private fun <T : Enum<T>> assertWire(values: List<T>, unknown: T, translate: (String?) -> T) {
        values.filter { it != unknown }.forEach { assertEquals(it, translate(it.name)) }
        listOf(null, "", "future", " ${values.first().name}", values.first().name.lowercase()).forEach { assertEquals(unknown, translate(it)) }
    }
}
