package com.storecore.identity

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.security.RecoveryAttemptBudget
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.mockito.Mockito.*
import java.time.*
import java.util.concurrent.*

class RecoveryDomainAndBudgetTest {
    @Test fun `closed recovery vocabularies reject future and malformed values`() {
        assertEquals(RecoveryRealm.CUSTOMER, RecoveryRealm.fromWire("CUSTOMER"))
        assertEquals(RecoveryRealm.USER, RecoveryRealm.fromWire("USER"))
        listOf(null, "", "customer", " USER ", "future").forEach { assertEquals(RecoveryRealm.Unknown, RecoveryRealm.fromWire(it)) }
        RecoveryTokenState.entries.filter { it != RecoveryTokenState.Unknown }.forEach { assertEquals(it, RecoveryTokenState.fromWire(it.name)) }
        assertEquals(RecoveryTokenState.Unknown, RecoveryTokenState.fromWire("future"))
        RecoveryTokenStatus.entries.filter { it != RecoveryTokenStatus.READY }.forEach { assertNull(RecoveryInspection.terminal(it).expiresAt) }
        assertThrows(IllegalArgumentException::class.java) { RecoveryInspection.terminal(RecoveryTokenStatus.READY) }
        assertNull(RecoverySecret.fromWire("x".repeat(42)))
        assertNull(RecoverySecret.fromWire("!".repeat(43)))
        assertNotNull(RecoverySecret.fromWire("x".repeat(43)))
        assertFalse(RecoverySecret.fromWire("x".repeat(43)).toString().contains("x".repeat(43)))
    }

    @Test fun `password bounds count Unicode without normalizing or trimming`() {
        assertFalse(PasswordPolicy.accepts("a".repeat(11)))
        assertTrue(PasswordPolicy.accepts("😀".repeat(12)))
        assertTrue(PasswordPolicy.accepts("😀".repeat(128)))
        assertFalse(PasswordPolicy.accepts("😀".repeat(129)))
        val raw = "  untouched password  "
        val password = RecoveryPassword.fromWire(raw)!!
        assertArrayEquals(raw.toCharArray(), password.copyChars())
        assertFalse(password.toString().contains(raw))
    }

    @Test fun `authorization owns expiry version eligibility and terminal rules`() {
        val expiry = Instant.parse("2026-11-12T00:15:00Z")
        val account = RecoveryAccountSnapshot(RecoveryAccountEligibility.ELIGIBLE, 7, "digest")
        val pending = RecoveryAuthorization(RecoveryTokenState.PENDING, 7, "digest", expiry)
        assertEquals(RecoveryTokenStatus.READY, pending.inspect(account, expiry.minusSeconds(1)))
        assertEquals(RecoveryTokenStatus.EXPIRED_LINK, pending.inspect(account, expiry))
        assertEquals(RecoveryTokenStatus.SUPERSEDED_LINK, pending.inspect(account.copy(credentialVersion = 8), expiry.minusSeconds(1)))
        assertEquals(RecoveryTokenStatus.SUPERSEDED_LINK, pending.inspect(account.copy(emailDigest = "changed"), expiry.minusSeconds(1)))
        RecoveryAccountEligibility.entries.filter { !it.permitsRecovery }.forEach {
            assertEquals(RecoveryTokenStatus.SUPERSEDED_LINK, pending.inspect(account.copy(eligibility = it), expiry.minusSeconds(1)))
        }
        assertEquals(RecoveryTokenStatus.USED_LINK, pending.copy(state = RecoveryTokenState.CONSUMED).inspect(account, expiry))
        assertEquals(RecoveryTokenStatus.SUPERSEDED_LINK, pending.copy(state = RecoveryTokenState.SUPERSEDED).inspect(account, expiry))
        assertEquals(RecoveryTokenStatus.Unknown, pending.copy(state = RecoveryTokenState.Unknown).inspect(account, expiry))
        assertEquals(RecoveryAccountEligibility.NO_KNOWN_ROLE, RecoveryAccountEligibility.evaluate(IdentityRealm.USER, true, setOf(InternalRole.Unknown)))
        assertEquals(RecoveryAccountEligibility.ELIGIBLE, RecoveryAccountEligibility.evaluate(IdentityRealm.CUSTOMER, true, emptySet()))
        assertEquals(RecoveryAccountEligibility.DISABLED, RecoveryAccountEligibility.evaluate(IdentityRealm.USER, false, setOf(InternalRole.ADMIN)))
        assertEquals(RecoveryAccountEligibility.Unknown, RecoveryAccountEligibility.evaluate(IdentityRealm.USER, null, emptySet()))
    }

    @Test fun `unconfigured delivery never consults accounts or creates tokens`() {
        val repository = mock(RecoveryRepository::class.java)
        val delivery = mock(RecoveryDeliveryPort::class.java)
        val transactions = mock(RecoveryTransactions::class.java)
        val tokens = mock(RecoveryTokenPort::class.java)
        `when`(delivery.state).thenReturn(RecoveryDeliveryState.UNCONFIGURED)
        `when`(tokens.sha256(anyString())).thenReturn("a".repeat(64))
        val step = RequestRecoveryStep(repository, delivery, RecoveryAttemptBudget(), tokens, transactions)
        listOf("exists@example.test", "absent@example.test").forEach {
            assertThrows(RecoveryUnavailable::class.java) { step.execute(RecoveryRealm.CUSTOMER, it, "ip") }
        }
        verifyNoInteractions(repository, transactions)
        verify(tokens, never()).nextRawToken()
        verify(delivery, times(2)).state
        verifyNoMoreInteractions(delivery)
    }

    @Test fun `rotating destinations cannot evade composed IP and instance budgets`() {
        val ipBudget = RecoveryAttemptBudget(requestIpLimit = 2)
        repeat(2) { assertTrue(ipBudget.request("ip", RecoveryRealm.CUSTOMER, "digest$it")) }
        assertThrows(RecoveryRateLimited::class.java) { ipBudget.request("ip", RecoveryRealm.USER, "new") }
        val globalBudget = RecoveryAttemptBudget(requestInstanceLimit = 2)
        repeat(2) { globalBudget.request("ip$it", RecoveryRealm.CUSTOMER, "digest$it") }
        assertThrows(RecoveryRateLimited::class.java) { globalBudget.request("another", RecoveryRealm.USER, "another") }
        val tokenBudget = RecoveryAttemptBudget(tokenIpLimit = 2)
        repeat(2) { tokenBudget.token("ip", "hash$it").finish(true) }
        assertThrows(RecoveryRateLimited::class.java) { tokenBudget.token("ip", "new") }
        val tokenGlobal = RecoveryAttemptBudget(tokenInstanceLimit = 2)
        repeat(2) { tokenGlobal.token("ip$it", "hash$it").finish(true) }
        assertThrows(RecoveryRateLimited::class.java) { tokenGlobal.token("new-ip", "new-hash") }
    }

    @Test fun `target suppression is neutral and expired cardinality can be reclaimed`() {
        val clock = MutableClock()
        val budget = RecoveryAttemptBudget(clock, maxKeys = 1)
        repeat(20) { assertTrue(budget.request("ip", RecoveryRealm.CUSTOMER, "same")) }
        assertFalse(budget.request("ip", RecoveryRealm.CUSTOMER, "same"))
        assertThrows(RecoveryRateLimited::class.java) { budget.request("ip", RecoveryRealm.CUSTOMER, "new") }
        clock.now = clock.now.plusSeconds(900)
        assertTrue(budget.request("new-ip", RecoveryRealm.USER, "new"))
    }

    @Test fun `in-flight token attempts reserve the failure budget atomically`() {
        val budget = RecoveryAttemptBudget()
        val executor = Executors.newFixedThreadPool(16)
        val gate = CyclicBarrier(16)
        try {
            val attempts = (1..16).map {
                executor.submit<RecoveryAttempt?> {
                    gate.await(5, TimeUnit.SECONDS)
                    try { budget.token("ip", "same") } catch (_: RecoveryRateLimited) { null }
                }
            }.mapNotNull { it.get(10, TimeUnit.SECONDS) }
            assertEquals(10, attempts.size)
            attempts.forEach { it.finish(false); it.finish(false) }
            assertThrows(RecoveryRateLimited::class.java) { budget.token("ip", "same") }
            assertNotNull(budget.token("another-ip", "same"))
        } finally { executor.shutdownNow() }
    }

    @Test fun `successful permits release reservations but do not reset aggregate budgets`() {
        val budget = RecoveryAttemptBudget(tokenIpLimit = 11)
        repeat(11) { budget.token("ip", "same").finish(true) }
        assertThrows(RecoveryRateLimited::class.java) { budget.token("ip", "different") }
    }

    private class MutableClock(var now: Instant = Instant.parse("2026-11-12T00:00:00Z")) : Clock() {
        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId): Clock = this
        override fun instant(): Instant = now
    }
}
