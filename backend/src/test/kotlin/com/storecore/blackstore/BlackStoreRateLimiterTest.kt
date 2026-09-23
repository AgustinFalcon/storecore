package com.storecore.blackstore

import com.storecore.blackstore.infrastructure.web.BlackStoreIntegrationExceptionAdvice
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class BlackStoreRateLimiterTest {
    @Test
    fun `reserve burst of ten then 429 with retry after`() {
        val limiter = BlackStoreRateLimiter()
        repeat(10) { limiter.check("client-a", BlackStoreRateLimiter.Scope.RESERVE) }
        val limited = assertThrows(BlackStoreSagaException::class.java) {
            limiter.check("client-a", BlackStoreRateLimiter.Scope.RESERVE)
        }
        assertEquals("RATE_LIMITED", limited.message)
        assertEquals(429, limited.httpStatus)
        assertEquals(true, limited.retryable)
        assertTrue((limited.retryAfterSeconds ?: 0) >= 1)
        limiter.check("client-b", BlackStoreRateLimiter.Scope.RESERVE)
    }

    @Test
    fun `reconcile allows five then rate limits`() {
        val limiter = BlackStoreRateLimiter()
        repeat(5) { limiter.check("rec", BlackStoreRateLimiter.Scope.RECONCILE) }
        assertEquals(429, assertThrows(BlackStoreSagaException::class.java) {
            limiter.check("rec", BlackStoreRateLimiter.Scope.RECONCILE)
        }.httpStatus)
    }

    @Test
    fun `advice adds retry after only on 429 and never echoes secrets`() {
        val advice = BlackStoreIntegrationExceptionAdvice()
        val limited = advice.rejected(BlackStoreSagaException.rateLimited(2))
        assertEquals(429, limited.statusCode.value())
        assertEquals("2", limited.headers.getFirst("Retry-After"))
        assertEquals("RATE_LIMITED", limited.body!!.errorCode)
        assertEquals(true, limited.body!!.retryable)
        val secrets = listOf("4111111111111111", "sk_live_", "cvv", "password=secret")
        assertTrue(secrets.none { limited.body.toString().contains(it) })
        val denied = advice.rejected(com.storecore.blackstore.application.BlackStoreCapabilityDisabled())
        assertEquals(403, denied.statusCode.value())
        assertFalse(denied.headers.containsKey("Retry-After"))
        assertTrue(secrets.none { denied.body.toString().contains(it) })
        val insufficient = advice.rejected(
            BlackStoreSagaException.insufficient(
                listOf(BlackStoreLineFailure(0, 9, "SKU-9", 4, 1, "INSUFFICIENT_STOCK")),
            ),
        )
        assertEquals(409, insufficient.statusCode.value())
        assertEquals("INSUFFICIENT_STOCK", insufficient.body!!.errorCode)
        assertEquals(9, insufficient.body!!.lineFailures!!.single().variantId)
        assertEquals(4, insufficient.body!!.lineFailures!!.single().requested)
        assertEquals(1, insufficient.body!!.lineFailures!!.single().availableQuantity)
        assertTrue(secrets.none { insufficient.body.toString().contains(it) })
    }
}
