package com.storecore.identity.infrastructure.security

import com.storecore.identity.application.LoginRateLimited
import com.storecore.identity.domain.IdentityRealm
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.util.ArrayDeque
import java.util.concurrent.ConcurrentHashMap

/** Process-local login failure limiter. The key never contains the raw email. */
@Component
class LoginRateLimiter(private val clock: Clock = Clock.systemUTC()) {
    private data class Bucket(val failures: ArrayDeque<Long> = ArrayDeque())

    private val buckets = ConcurrentHashMap<String, Bucket>()
    private val window = Duration.ofMinutes(15).toMillis()

    fun checkAllowed(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) {
        val key = key(realm, sourceIp, canonicalEmail)
        val now = clock.millis()
        val bucket = buckets[key] ?: return
        synchronized(bucket) {
            prune(bucket, now)
            if (bucket.failures.size >= MAX_FAILURES) {
                throw LoginRateLimited(retryAfter(bucket, now))
            }
            if (bucket.failures.isEmpty()) buckets.remove(key, bucket)
        }
    }

    fun recordFailure(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) {
        val key = key(realm, sourceIp, canonicalEmail)
        val bucket = buckets.computeIfAbsent(key) { Bucket() }
        val now = clock.millis()
        synchronized(bucket) {
            prune(bucket, now)
            bucket.failures.addLast(now)
        }
    }

    fun clear(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) {
        val key = key(realm, sourceIp, canonicalEmail)
        buckets.remove(key)
    }

    private fun prune(bucket: Bucket, now: Long) {
        while (bucket.failures.isNotEmpty() && now - bucket.failures.first >= window) bucket.failures.removeFirst()
    }

    private fun retryAfter(bucket: Bucket, now: Long): Long =
        ((bucket.failures.first + window - now + 999) / 1000).coerceAtLeast(1)

    private fun key(realm: IdentityRealm, sourceIp: String, canonicalEmail: String): String =
        realm.name + "|" + sourceIp.trim() + "|" + sha256(canonicalEmail)

    private fun sha256(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    companion object { private const val MAX_FAILURES = 5 }
}