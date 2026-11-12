package com.storecore.identity

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.security.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.*
import java.util.UUID
import org.mockito.Mockito.*

class EmailVerificationTest {
    private val subject = IdentitySubject(IdentityRealm.CUSTOMER, 1)
    private val now = Instant.parse("2026-11-12T12:00:00Z")
    private val account = EmailVerificationAccount(subject, true, 1, "digest")

    @Test fun `authorization binds realm subject version digest active and database time`() {
        val token = EmailVerificationAuthorization(subject, EmailVerificationTokenState.PENDING, 1, "digest", now.plusSeconds(1))
        assertEquals(EmailVerificationStatus.READY, token.inspect(account, now))
        for (changed in listOf(account.copy(subject = IdentitySubject(IdentityRealm.USER, 1)), account.copy(emailVersion = 2), account.copy(emailDigest = "changed"), account.copy(active = false))) {
            assertEquals(EmailVerificationStatus.SUPERSEDED_LINK, token.inspect(changed, now))
        }
        assertEquals(EmailVerificationStatus.EXPIRED_LINK, token.inspect(account, now.plusSeconds(1)))
        assertEquals(EmailVerificationStatus.USED_LINK, token.copy(state = EmailVerificationTokenState.CONSUMED).inspect(account, now.plusSeconds(10)))
        assertEquals(EmailVerificationStatus.INVALID_LINK, token.copy(state = EmailVerificationTokenState.Unknown).inspect(account, now))
        assertEquals(EmailVerificationStatus.Unknown, EmailVerificationStatus.fromWire("future"))
    }

    @Test fun `request and public budgets are separate and failures reserve atomically`() {
        val budgets = EmailVerificationAttemptBudget(Clock.fixed(now, ZoneOffset.UTC))
        repeat(5) { budgets.request(subject) }
        assertThrows(EmailVerificationRateLimited::class.java) { budgets.request(subject) }
        budgets.request(IdentitySubject(IdentityRealm.USER, 1))
        val pending = List(10) { budgets.token("ip", "hash") }
        assertThrows(EmailVerificationRateLimited::class.java) { budgets.token("ip", "hash") }
        pending.forEach { it.finish(true); it.finish(false) }
        repeat(10) { budgets.token("ip", "hash").finish(false) }
        assertThrows(EmailVerificationRateLimited::class.java) { budgets.token("ip", "hash") }
        budgets.token("other", "hash").finish(true)
    }

    @Test fun `hourly subject budget and public window expire independently`() {
        val clock = MutableClock(now)
        val budgets = EmailVerificationAttemptBudget(clock)
        repeat(5) { budgets.request(subject) }
        repeat(10) { budgets.token("ip", "hash").finish(false) }
        clock.value = now.plusSeconds(900)
        budgets.token("ip", "hash").finish(true)
        assertThrows(EmailVerificationRateLimited::class.java) { budgets.request(subject) }
        clock.value = now.plusSeconds(3600)
        budgets.request(subject)
    }

    @Test fun `opaque random secrets are redacted and hashed`() {
        val tokens = VerificationTokens()
        val first = tokens.nextRawToken()
        val secret = VerificationSecret.fromWire(first)!!
        assertNotEquals(first, tokens.nextRawToken())
        assertEquals(64, tokens.sha256(first).length)
        assertFalse(secret.toString().contains(first))
        assertNull(VerificationSecret.fromWire("invalid"))
    }

    @Test fun `unavailable verification fails before any lookup or budget`() {
        val repository = mock(EmailVerificationRepository::class.java)
        val budgets = mock(EmailVerificationBudgetPort::class.java)
        val delivery = object : EmailVerificationDeliveryPort {
            override val readiness = EmailDeliveryReadiness.UNAVAILABLE
            override fun enqueue(dispatch: EmailVerificationDispatch) = error("must not enqueue")
        }
        val boundary = object : EmailVerificationTransactions {
            override fun <T : Any> execute(effect: () -> T): T = error("must not transact")
        }
        assertThrows(EmailVerificationUnavailable::class.java) {
            RequestEmailVerificationStep(repository, delivery, budgets, boundary).execute(CustomerPrincipal(UUID.randomUUID(), 1))
        }
        verifyNoInteractions(repository, budgets)
    }

    @Test fun `unknown realm never probes either identity namespace`() {
        val repository = mock(EmailVerificationRepository::class.java)
        val budgets = EmailVerificationAttemptBudget()
        val tokens = VerificationTokens()
        val boundary = object : EmailVerificationTransactions {
            override fun <T : Any> execute(effect: () -> T): T = effect()
        }
        val secret = tokens.nextRawToken()
        assertEquals(EmailVerificationStatus.INVALID_LINK, InspectEmailVerificationStep(repository, budgets, tokens).execute(RecoveryRealm.Unknown, secret, "ip").status)
        assertEquals(EmailVerificationCompletion.INVALID_LINK, CompleteEmailVerificationStep(repository, budgets, tokens, boundary).execute(RecoveryRealm.Unknown, secret, "ip"))
        verifyNoInteractions(repository)
    }

    private class MutableClock(var value: Instant) : Clock() {
        override fun getZone() = ZoneOffset.UTC
        override fun withZone(zone: ZoneId) = this
        override fun instant() = value
    }
}
