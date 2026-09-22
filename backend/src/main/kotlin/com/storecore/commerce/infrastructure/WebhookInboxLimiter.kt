package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.WebhookPayloadTooLarge
import com.storecore.commerce.application.WebhookRateLimited
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Duration
import java.util.ArrayDeque
import java.util.concurrent.ConcurrentHashMap

/** Process-local bound on unauthenticated MP/ML inbox writes. The key never stores the payload. */
@Component
class WebhookInboxLimiter(private val clock: Clock = Clock.systemUTC()) {
    private data class Bucket(val hits: ArrayDeque<Long> = ArrayDeque())

    private val buckets = ConcurrentHashMap<String, Bucket>()
    private val window = Duration.ofMinutes(1).toMillis()

    fun admit(channel: String, sourceIp: String, envelope: String) {
        if (envelope.length > MAX_ENVELOPE_CHARS) throw WebhookPayloadTooLarge()
        val key = channel + "|" + sourceIp.trim().ifBlank { "unknown" }
        val now = clock.millis()
        val bucket = buckets.computeIfAbsent(key) { Bucket() }
        synchronized(bucket) {
            prune(bucket, now)
            if (bucket.hits.size >= MAX_HITS) throw WebhookRateLimited(retryAfter(bucket, now))
            bucket.hits.addLast(now)
        }
    }

    private fun prune(bucket: Bucket, now: Long) {
        while (bucket.hits.isNotEmpty() && now - bucket.hits.first >= window) bucket.hits.removeFirst()
    }

    private fun retryAfter(bucket: Bucket, now: Long): Long =
        ((bucket.hits.first + window - now + 999) / 1000).coerceAtLeast(1)

    companion object {
        const val MAX_HITS = 60
        const val MAX_ENVELOPE_CHARS = 16 * 1024
    }
}
