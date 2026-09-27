package com.storecore.identity

import com.storecore.identity.application.LoginRateLimited
import com.storecore.identity.domain.IdentityRealm
import com.storecore.identity.infrastructure.security.LoginRateLimiter
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset

class LoginRateLimiterTest {
    @Test
    fun `limits after five failures and rounds retry after up`() {
        val clock = MutableClock(START)
        val limiter = LoginRateLimiter(clock)
        repeat(5) { limiter.recordFailure(IdentityRealm.CUSTOMER, IP, "buyer@example.com") }

        assertEquals(900L, rejectedAfter { limiter.checkAllowed(IdentityRealm.CUSTOMER, IP, "buyer@example.com") })
    }

    @Test
    fun `six interleaved failures use fifth newest expiry and do not announce early release`() {
        val clock = MutableClock(START)
        val limiter = LoginRateLimiter(clock)
        repeat(4) { index ->
            limiter.recordFailure(IdentityRealm.USER, IP, EMAIL)
            clock.advanceMillis(1_000L)
        }
        // Two requests passed checkAllowed before either recorded its failure.
        limiter.checkAllowed(IdentityRealm.USER, IP, EMAIL)
        limiter.checkAllowed(IdentityRealm.USER, IP, EMAIL)
        limiter.recordFailure(IdentityRealm.USER, IP, EMAIL)
        clock.advanceMillis(1_000L)
        limiter.recordFailure(IdentityRealm.USER, IP, EMAIL)

        clock.set(START.plus(Duration.ofMinutes(15)).minusMillis(1))
        assertEquals(2L, rejectedAfter { limiter.checkAllowed(IdentityRealm.USER, IP, EMAIL) })
        clock.set(START.plus(Duration.ofMinutes(15))) // The oldest failure expires; five remain.
        assertEquals(1L, rejectedAfter { limiter.checkAllowed(IdentityRealm.USER, IP, EMAIL) })
        clock.set(START.plus(Duration.ofMinutes(15)).plusSeconds(1))
        limiter.checkAllowed(IdentityRealm.USER, IP, EMAIL)
    }

    @Test
    fun `realm capacity uses earliest complete bucket expiry by last failure`() {
        val clock = MutableClock(START)
        val limiter = LoginRateLimiter(clock, maxBucketsPerRealm = 2)

        limiter.recordFailure(IdentityRealm.CUSTOMER, IP, "first@example.com") // t=0
        clock.set(START.plus(Duration.ofMinutes(1)))
        limiter.recordFailure(IdentityRealm.CUSTOMER, IP, "second@example.com") // t=1
        clock.set(START.plus(Duration.ofMinutes(2)))
        limiter.recordFailure(IdentityRealm.CUSTOMER, IP, "second@example.com") // last=2
        clock.set(START.plus(Duration.ofMinutes(5)))
        limiter.recordFailure(IdentityRealm.CUSTOMER, IP, "first@example.com") // last=5

        // First bucket began first but the second bucket becomes wholly empty first at t=17.
        assertEquals(12L * 60, rejectedAfter { limiter.checkAllowed(IdentityRealm.CUSTOMER, IP, "new@example.com") })
        clock.set(START.plus(Duration.ofMinutes(17)).minusMillis(1))
        assertEquals(1L, rejectedAfter { limiter.checkAllowed(IdentityRealm.CUSTOMER, IP, "new@example.com") })
        clock.set(START.plus(Duration.ofMinutes(17)))
        limiter.checkAllowed(IdentityRealm.CUSTOMER, IP, "new@example.com")
    }

    @Test
    fun `one millisecond remaining rounds to one and expiry boundary is exclusive`() {
        val clock = MutableClock(START)
        val limiter = LoginRateLimiter(clock)
        repeat(5) { limiter.recordFailure(IdentityRealm.USER, IP, EMAIL) }

        clock.set(START.plus(Duration.ofMinutes(15)).minusMillis(1))
        assertEquals(1L, rejectedAfter { limiter.checkAllowed(IdentityRealm.USER, IP, EMAIL) })
        clock.set(START.plus(Duration.ofMinutes(15)))
        limiter.checkAllowed(IdentityRealm.USER, IP, EMAIL)
    }

    @Test
    fun `retry after rounds a remainder above one second up`() {
        val clock = MutableClock(START)
        val limiter = LoginRateLimiter(clock)
        repeat(5) { limiter.recordFailure(IdentityRealm.USER, IP, EMAIL) }

        clock.set(START.plus(Duration.ofMinutes(14)).plusMillis(58_999))
        assertEquals(2L, rejectedAfter { limiter.checkAllowed(IdentityRealm.USER, IP, EMAIL) })
    }

    @Test
    fun `realms have separate capacity and clear only frees matching realm`() {
        val clock = MutableClock(START)
        val limiter = LoginRateLimiter(clock, maxBucketsPerRealm = 1)
        limiter.recordFailure(IdentityRealm.USER, IP, "user@example.com")
        limiter.recordFailure(IdentityRealm.CUSTOMER, IP, "customer@example.com")

        assertEquals(900L, rejectedAfter { limiter.checkAllowed(IdentityRealm.USER, IP, "new-user@example.com") })
        assertEquals(900L, rejectedAfter { limiter.checkAllowed(IdentityRealm.CUSTOMER, IP, "new-customer@example.com") })
        limiter.clear(IdentityRealm.USER, IP, "user@example.com")

        limiter.checkAllowed(IdentityRealm.USER, IP, "new-user@example.com")
        assertEquals(900L, rejectedAfter { limiter.checkAllowed(IdentityRealm.CUSTOMER, IP, "new-customer@example.com") })
    }

    @Test
    fun `separates source ip and canonical email hash`() {
        val limiter = LoginRateLimiter(Clock.systemUTC())
        repeat(5) { limiter.recordFailure(IdentityRealm.CUSTOMER, IP, "buyer@example.com") }

        limiter.checkAllowed(IdentityRealm.USER, IP, "buyer@example.com")
        limiter.checkAllowed(IdentityRealm.CUSTOMER, "10.0.0.2", "buyer@example.com")
        limiter.checkAllowed(IdentityRealm.CUSTOMER, IP, "other@example.com")
    }

    private fun rejectedAfter(action: () -> Unit): Long =
        assertFailsWith<LoginRateLimited>(block = action).retryAfterSeconds

    private class MutableClock(initial: Instant) : Clock() {
        private var current = initial

        override fun getZone(): ZoneId = ZoneOffset.UTC
        override fun withZone(zone: ZoneId): Clock = this
        override fun instant(): Instant = current

        fun set(value: Instant) { current = value }
        fun advanceMillis(value: Long) { current = current.plusMillis(value) }
    }

    companion object {
        private val START = Instant.parse("2026-01-01T00:00:00Z")
        private const val IP = "10.0.0.1"
        private const val EMAIL = "buyer@example.com"
    }
}
