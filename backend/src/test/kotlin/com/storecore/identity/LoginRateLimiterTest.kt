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
import java.time.ZoneOffset

class LoginRateLimiterTest {
    @Test
    fun `limits after five failures and provides retry window`() {
        val limiter = LoginRateLimiter(Clock.fixed(Instant.parse("2026-01-01T00:00:00Z"), ZoneOffset.UTC))
        repeat(5) { limiter.recordFailure(IdentityRealm.CUSTOMER, "10.0.0.1", "buyer@example.com") }

        val error = assertFailsWith<LoginRateLimited> {
            limiter.checkAllowed(IdentityRealm.CUSTOMER, "10.0.0.1", "buyer@example.com")
        }

        assertEquals(900L, error.retryAfterSeconds)
    }

    @Test
    fun `separates realm source ip and canonical email hash`() {
        val limiter = LoginRateLimiter(Clock.systemUTC())
        repeat(5) { limiter.recordFailure(IdentityRealm.CUSTOMER, "10.0.0.1", "buyer@example.com") }

        limiter.checkAllowed(IdentityRealm.USER, "10.0.0.1", "buyer@example.com")
        limiter.checkAllowed(IdentityRealm.CUSTOMER, "10.0.0.2", "buyer@example.com")
        limiter.checkAllowed(IdentityRealm.CUSTOMER, "10.0.0.1", "other@example.com")
    }

    @Test
    fun `successful login path never clears a bucket`() {
        val limiter = LoginRateLimiter(Clock.systemUTC())
        repeat(5) { limiter.recordFailure(IdentityRealm.CUSTOMER, "10.0.0.1", "buyer@example.com") }
        limiter.clear(IdentityRealm.CUSTOMER, "10.0.0.1", "buyer@example.com")
        assertFailsWith<LoginRateLimited> {
            limiter.checkAllowed(IdentityRealm.CUSTOMER, "10.0.0.1", "buyer@example.com")
        }
    }
}
