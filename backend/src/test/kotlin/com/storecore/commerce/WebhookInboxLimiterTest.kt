package com.storecore.commerce

import com.storecore.commerce.application.WebhookPayloadTooLarge
import com.storecore.commerce.application.WebhookRateLimited
import com.storecore.commerce.infrastructure.WebhookInboxLimiter
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class WebhookInboxLimiterTest {
    @Test
    fun oversizedEnvelopeIsRejectedBeforeCounting() {
        val limiter = WebhookInboxLimiter()
        assertThrows(WebhookPayloadTooLarge::class.java) {
            limiter.admit("MERCADO_PAGO", "127.0.0.1", "x".repeat(WebhookInboxLimiter.MAX_ENVELOPE_CHARS + 1))
        }
    }

    @Test
    fun sixtyFirstHitInTheSameMinuteIsRateLimited() {
        val limiter = WebhookInboxLimiter(Clock.fixed(Instant.parse("2026-09-22T12:00:00Z"), ZoneOffset.UTC))
        repeat(WebhookInboxLimiter.MAX_HITS) { limiter.admit("MERCADO_PAGO", "10.0.0.8", "{}") }
        assertThrows(WebhookRateLimited::class.java) { limiter.admit("MERCADO_PAGO", "10.0.0.8", "{}") }
        limiter.admit("MERCADO_PAGO", "10.0.0.9", "{}")
    }
}
