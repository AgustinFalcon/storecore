package com.storecore.identity

import com.storecore.identity.application.LoginRateLimited
import com.storecore.identity.infrastructure.security.ChallengeAttemptBudget
import com.storecore.identity.infrastructure.security.LoginAttemptBudget
import com.storecore.identity.infrastructure.security.LoginRateLimiter
import com.storecore.identity.infrastructure.security.AuthenticationBudgetKey
import com.storecore.identity.infrastructure.security.canonicalEmailDigest
import com.storecore.identity.domain.IdentityRealm
import java.time.Clock
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertFailsWith

class AttemptBudgetsTest {
    @Test fun `credential submissions share five slots regardless of caller and successes`() {
        val budget = LoginAttemptBudget()
        // The three endpoint callers deliberately have no realm argument.
        repeat(5) { budget.acquire(" ip ", "buyer@example.com") }
        assertFailsWith<LoginRateLimited> { budget.acquire("ip", "buyer@example.com") }
        budget.acquire("different-ip", "buyer@example.com")
        budget.acquire("ip", "other@example.com")
    }

    @Test fun `only one concurrent request acquires the final slot`() {
        val budget = LoginAttemptBudget()
        repeat(4) { budget.acquire("ip", "buyer@example.com") }
        assertEquals(1, race(24) {
            try { budget.acquire("ip", "buyer@example.com"); true }
            catch (_: LoginRateLimited) { false }
        })
    }

    @Test fun `concurrent new keys cannot bypass capacity`() {
        val budget = LoginAttemptBudget(maxKeys = 1)
        val sequence = AtomicInteger()
        assertEquals(1, race(24) {
            try { budget.acquire("ip", "buyer${sequence.incrementAndGet()}@example.com"); true }
            catch (_: LoginRateLimited) { false }
        })
    }

    @Test fun `concurrent expiry reclamation does not detach the live bucket`() {
        val clock = BudgetClock()
        val budget = LoginAttemptBudget(clock, maxKeys = 1)
        repeat(5) { budget.acquire("ip", "buyer@example.com") }
        clock.advance(900_000)
        assertEquals(5, race(24) {
            try { budget.acquire("ip", "buyer@example.com"); true }
            catch (_: LoginRateLimited) { false }
        })
        assertFailsWith<LoginRateLimited> { budget.acquire("ip", "buyer@example.com") }
    }

    @Test fun `rolling expiry preserves newer submissions and exact boundary`() {
        val clock = BudgetClock()
        val budget = LoginAttemptBudget(clock)
        budget.acquire("ip", "buyer@example.com")
        clock.advance(1_000)
        repeat(4) { budget.acquire("ip", "buyer@example.com") }
        assertEquals(899, assertFailsWith<LoginRateLimited> { budget.acquire("ip", "buyer@example.com") }.retryAfterSeconds.toInt())
        clock.advance(899_000)
        budget.acquire("ip", "buyer@example.com")
        assertFailsWith<LoginRateLimited> { budget.acquire("ip", "buyer@example.com") }
        clock.advance(1_000)
        repeat(4) { budget.acquire("ip", "buyer@example.com") }
        assertFailsWith<LoginRateLimited> { budget.acquire("ip", "buyer@example.com") }
    }

    @Test fun `capacity rejects new keys and expiry reclaims them`() {
        val clock = BudgetClock()
        val budget = LoginAttemptBudget(clock, maxKeys = 1)
        budget.acquire("ip", "buyer@example.com")
        assertFailsWith<LoginRateLimited> { budget.acquire("ip", "other@example.com") }
        budget.acquire("ip", "buyer@example.com")
        clock.advance(900_000)
        budget.acquire("ip", "other@example.com")
    }

    @Test fun `challenge checks do not consume failures and the eleventh selection is denied`() {
        val clock = BudgetClock()
        val budget = ChallengeAttemptBudget(clock)
        val hash = "a".repeat(64)
        repeat(20) { budget.checkAllowed("ip", hash) }
        repeat(10) { budget.checkAllowed("ip", hash); budget.recordFailure("ip", hash) }
        assertEquals(900L, assertFailsWith<LoginRateLimited> { budget.checkAllowed("ip", hash) }.retryAfterSeconds)
        budget.checkAllowed("other-ip", hash)
        assertFailsWith<LoginRateLimited> { budget.checkAllowed("ip", "b".repeat(64)) }
        clock.advance(900_000)
        budget.checkAllowed("ip", hash)
    }

    @Test fun `invented challenges from one source share a budget and cannot exhaust global keys`() {
        val budget = ChallengeAttemptBudget(BudgetClock(), maxKeys = 2)
        repeat(10) { attempt ->
            val hash = attempt.toString(16).padStart(64, '0')
            budget.checkAllowed("attacker-ip", hash)
            budget.recordFailure("attacker-ip", hash)
        }
        assertFailsWith<LoginRateLimited> {
            budget.checkAllowed("attacker-ip", "f".repeat(64))
        }
        budget.checkAllowed("legitimate-ip", "e".repeat(64))
    }

    @Test fun `challenge source capacity fails closed and never accepts a raw challenge`() {
        val clock = BudgetClock()
        val budget = ChallengeAttemptBudget(clock, maxKeys = 1)
        budget.recordFailure("ip", "a".repeat(64))
        budget.checkAllowed("ip", "b".repeat(64))
        assertFailsWith<LoginRateLimited> { budget.checkAllowed("other-ip", "b".repeat(64)) }
        assertFailsWith<LoginRateLimited> { budget.recordFailure("other-ip", "b".repeat(64)) }
        assertFailsWith<IllegalArgumentException> { budget.recordFailure("ip", "raw-secret-challenge") }
        clock.advance(900_000)
        budget.recordFailure("other-ip", "b".repeat(64))
    }

    @Test fun `late in-flight rejections remain counted after older failures expire`() {
        val clock = BudgetClock()
        val budget = ChallengeAttemptBudget(clock)
        val hash = "a".repeat(64)
        repeat(10) { budget.recordFailure("ip", hash) }
        clock.advance(1_000)
        repeat(10) { budget.recordFailure("ip", hash) }
        clock.advance(899_000)
        assertEquals(1L, assertFailsWith<LoginRateLimited> { budget.checkAllowed("ip", hash) }.retryAfterSeconds)
        clock.advance(1_000)
        budget.checkAllowed("ip", hash)
    }

    @Test fun `realm failure evidence survives successes until expiry and is bounded`() {
        val clock = BudgetClock()
        val limiter = LoginRateLimiter(clock, maxBucketsPerRealm = 1)
        repeat(50) { limiter.recordFailure(IdentityRealm.USER, "ip", "buyer@example.com") }
        limiter.clear(IdentityRealm.USER, "ip", "buyer@example.com")
        assertFailsWith<LoginRateLimited> { limiter.checkAllowed(IdentityRealm.USER, "ip", "buyer@example.com") }
        // Realm capacity remains independent, as in the integration baseline.
        limiter.recordFailure(IdentityRealm.CUSTOMER, "ip", "buyer@example.com")
        assertFailsWith<LoginRateLimited> { limiter.checkAllowed(IdentityRealm.USER, "ip", "new@example.com") }
        clock.advance(900_000)
        limiter.checkAllowed(IdentityRealm.USER, "ip", "buyer@example.com")
        limiter.recordFailure(IdentityRealm.CUSTOMER, "ip", "buyer@example.com")
    }

    @Test fun `email keys contain only a digest`() {
        val email = "private@example.com"
        val digest = canonicalEmailDigest(email)
        assertEquals(64, digest.length)
        assertEquals("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", canonicalEmailDigest(""))
        assertFalse(AuthenticationBudgetKey("ip", digest).toString().contains(email))
    }

    @Test fun `credential budget keeps its watermark across wall clock rewind`() {
        val clock = BudgetClock()
        val budget = LoginAttemptBudget(clock)
        repeat(5) { budget.acquire("ip", "buyer@example.com") }
        clock.advance(899_000)
        assertEquals(1L, assertFailsWith<LoginRateLimited> { budget.acquire("ip", "buyer@example.com") }.retryAfterSeconds)
        clock.advance(-899_000)
        assertEquals(1L, assertFailsWith<LoginRateLimited> { budget.acquire("ip", "buyer@example.com") }.retryAfterSeconds)
        clock.advance(900_000)
        budget.acquire("ip", "buyer@example.com")
    }

    private fun race(count: Int, operation: () -> Boolean): Int {
        val executor = Executors.newFixedThreadPool(count)
        val ready = CountDownLatch(count)
        val start = CountDownLatch(1)
        try {
            val futures = (1..count).map {
                executor.submit<Boolean> {
                    ready.countDown()
                    check(start.await(5, TimeUnit.SECONDS))
                    operation()
                }
            }
            check(ready.await(5, TimeUnit.SECONDS))
            start.countDown()
            return futures.count { it.get(5, TimeUnit.SECONDS) }
        } finally { start.countDown(); executor.shutdownNow() }
    }
}

private class BudgetClock : Clock() {
    private var value = Instant.parse("2026-01-01T00:00:00Z")
    override fun getZone(): ZoneId = ZoneOffset.UTC
    override fun withZone(zone: ZoneId): Clock = this
    override fun instant(): Instant = value
    fun advance(milliseconds: Long) { value = value.plusMillis(milliseconds) }
}
