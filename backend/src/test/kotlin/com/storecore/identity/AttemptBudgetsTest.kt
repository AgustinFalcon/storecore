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

    @Test fun `challenge admission consumes one source slot and retains the individual limit`() {
        val clock = BudgetClock()
        val budget = ChallengeAttemptBudget(clock)
        val hash = "a".repeat(64)
        repeat(10) { budget.checkAllowed("ip", hash).reject() }
        assertEquals(900L, assertFailsWith<LoginRateLimited> { budget.checkAllowed("ip", hash) }.retryAfterSeconds)
        budget.checkAllowed("other-ip", hash)
        assertFailsWith<LoginRateLimited> { budget.checkAllowed("ip", "b".repeat(64)) }
        clock.advance(900_000)
        budget.checkAllowed("ip", hash)
    }

    @Test fun `challenge capacity evicts safely without blocking other source or reopening attacker admission`() {
        val clock = BudgetClock()
        val budget = ChallengeAttemptBudget(clock, maxKeys = 1)
        repeat(10) { index -> budget.checkAllowed("ip", index.toString(16).padStart(64, '0')).reject() }
        budget.checkAllowed("legitimate-ip", "b".repeat(64)).reject()
        assertFailsWith<LoginRateLimited> { budget.checkAllowed("ip", "a".repeat(64)) }
        assertFailsWith<IllegalArgumentException> { budget.checkAllowed("ip", "raw-secret-challenge") }
        clock.advance(900_000)
        budget.checkAllowed("ip", "b".repeat(64)).reject()
    }

    @Test fun `late in-flight rejections remain counted after older failures expire`() {
        val clock = BudgetClock()
        val budget = ChallengeAttemptBudget(clock)
        val hash = "a".repeat(64)
        val admitted = List(10) { budget.checkAllowed("ip", hash) }
        clock.advance(1_000)
        admitted.forEach { it.reject() }
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

    @Test fun `ten thousand random unknown selections cannot exhaust challenge keys or deny another source`() {
        val budget = ChallengeAttemptBudget(BudgetClock(), maxKeys = 2)
        var admitted = 0
        repeat(10_000) {
            val unknownContext = com.storecore.identity.domain.AccessContext.fromWire("unknown-$it")
            assertEquals(com.storecore.identity.domain.AccessContext.Unknown, unknownContext)
            try {
                budget.checkAllowed("attacker-ip", canonicalEmailDigest("random-challenge-$it")).reject()
                admitted++
            } catch (_: LoginRateLimited) { }
        }
        assertEquals(10, admitted)
        assertEquals(2, challengeKeyCount(budget))
        budget.checkAllowed("legitimate-ip", canonicalEmailDigest("real-challenge"))
        assertFailsWith<LoginRateLimited> { budget.checkAllowed("attacker-ip", canonicalEmailDigest("real-challenge")) }
        assertEquals(2, challengeKeyCount(budget))
    }

    @Test fun `concurrent unknown selections cannot all acquire the last aggregate slot`() {
        val budget = ChallengeAttemptBudget(BudgetClock(), maxKeys = 1)
        repeat(9) { budget.checkAllowed("attacker-ip", canonicalEmailDigest("random-$it")).reject() }
        val sequence = AtomicInteger()
        assertEquals(1, race(24) {
            try {
                budget.checkAllowed("attacker-ip", canonicalEmailDigest("random-${sequence.incrementAndGet()}")).reject()
                true
            } catch (_: LoginRateLimited) { false }
        })
        assertEquals(1, challengeKeyCount(budget))
        budget.checkAllowed("legitimate-ip", canonicalEmailDigest("real-challenge"))
    }

    @Test fun `eviction by other sources cannot reset ten submissions for a real challenge`() {
        val budget = ChallengeAttemptBudget(BudgetClock(), maxKeys = 1)
        val hash = canonicalEmailDigest("real-challenge")
        repeat(10) { budget.checkAllowed("real-ip", hash).reject() }
        repeat(20) { budget.checkAllowed("other-ip-$it", canonicalEmailDigest("other-$it")).reject() }
        assertFailsWith<LoginRateLimited> { budget.checkAllowed("real-ip", hash) }
        assertEquals(1, challengeKeyCount(budget))
    }

    @Test fun `one admission records rejection only once even under concurrent callbacks`() {
        val clock = BudgetClock()
        val budget = ChallengeAttemptBudget(clock)
        val hash = canonicalEmailDigest("real-challenge")
        val admitted = budget.checkAllowed("ip", hash)
        race(24) { admitted.reject(); true }
        // Nine further requests are still admitted; duplicate callbacks did not
        // manufacture ten rejection timestamps for the individual challenge.
        repeat(9) { budget.checkAllowed("ip", hash) }
        assertFailsWith<LoginRateLimited> { budget.checkAllowed("ip", hash) }
    }

    private fun challengeKeyCount(budget: ChallengeAttemptBudget): Int {
        val challenges = budget.javaClass.getDeclaredField("challenges").apply { isAccessible = true }.get(budget)
        val buckets = challenges.javaClass.getDeclaredField("buckets").apply { isAccessible = true }.get(challenges) as Map<*, *>
        return buckets.size
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
