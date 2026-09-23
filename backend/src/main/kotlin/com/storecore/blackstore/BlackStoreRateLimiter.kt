package com.storecore.blackstore

import com.storecore.blackstore.application.port.BlackStoreRateLimitPort
import org.springframework.stereotype.Component
import java.util.concurrent.ConcurrentHashMap

@Component
class BlackStoreRateLimiter : BlackStoreRateLimitPort {
    enum class Scope(val rps: Double, val burst: Double) {
        RESERVE(30.0, 10.0),
        CATALOG(60.0, 60.0),
        STOCK_READ(60.0, 60.0),
        RECONCILE(5.0, 5.0),
    }

    private val buckets = ConcurrentHashMap<String, Bucket>()

    override fun check(identity: String, scope: Scope) {
        val now = System.currentTimeMillis()
        val bucket = buckets.computeIfAbsent("${scope.name}:$identity") { Bucket(scope.burst, now) }
        synchronized(bucket) {
            val elapsedSeconds = (now - bucket.updatedAtMs).coerceAtLeast(0L) / 1000.0
            bucket.tokens = (bucket.tokens + elapsedSeconds * scope.rps).coerceAtMost(scope.burst)
            bucket.updatedAtMs = now
            if (bucket.tokens < 1.0) {
                val retryAfter = ((1.0 - bucket.tokens) / scope.rps).coerceAtLeast(1.0).toInt()
                throw BlackStoreSagaException.rateLimited(retryAfter)
            }
            bucket.tokens -= 1.0
        }
    }

    private class Bucket(var tokens: Double, var updatedAtMs: Long)
}
