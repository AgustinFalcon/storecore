package com.storecore.identity.infrastructure.security

import com.storecore.identity.application.LoginRateLimited
import com.storecore.identity.domain.IdentityRealm
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.util.ArrayDeque
import java.util.EnumMap
import java.util.LinkedHashMap

/** Process-local login failure limiter. The key never contains the raw email. */
@Component
class LoginRateLimiter(
    private val clock: Clock = Clock.systemUTC(),
    private val maxBucketsPerRealm: Int = DEFAULT_MAX_BUCKETS_PER_REALM,
) {
    private data class Bucket(val failures: ArrayDeque<Long> = ArrayDeque())

    private val bucketsByRealm = EnumMap<IdentityRealm, LinkedHashMap<String, Bucket>>(IdentityRealm::class.java).apply {
        IdentityRealm.entries.forEach { put(it, LinkedHashMap()) }
    }
    private val window = Duration.ofMinutes(15).toMillis()
    private var lastObservedMillis: Long? = null

    init {
        require(maxBucketsPerRealm > 0) { "maxBucketsPerRealm must be positive" }
    }

    @Synchronized
    fun checkAllowed(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) {
        val now = effectiveNow()
        val realmBuckets = bucketsByRealm.getValue(realm)
        val key = key(realm, sourceIp, canonicalEmail)
        val bucket = realmBuckets[key]
        if (bucket != null) {
            prune(bucket, now)
            if (bucket.failures.size >= MAX_FAILURES) {
                val unblockAt = bucket.failures.elementAt(bucket.failures.size - MAX_FAILURES) + window
                throw LoginRateLimited(retryAfter(unblockAt, now))
            }
            if (bucket.failures.isEmpty()) realmBuckets.remove(key)
            return
        }

        pruneExpiredBuckets(realmBuckets, now)
        if (realmBuckets.size >= maxBucketsPerRealm) {
            val earliestCapacityRelease = realmBuckets.values.minOf { bucket -> bucket.failures.last + window }
            throw LoginRateLimited(retryAfter(earliestCapacityRelease, now))
        }
    }

    @Synchronized
    fun recordFailure(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) {
        val now = effectiveNow()
        val realmBuckets = bucketsByRealm.getValue(realm)
        val key = key(realm, sourceIp, canonicalEmail)
        val bucket = realmBuckets[key]
        if (bucket != null) {
            prune(bucket, now)
            while (bucket.failures.size >= MAX_FAILURES) bucket.failures.removeFirst()
            bucket.failures.addLast(now)
            return
        }

        pruneExpiredBuckets(realmBuckets, now)
        // A concurrent request can fill the final slot after checkAllowed. Keep the
        // memory bound; the next attempt for this new key will fail closed at admission.
        if (realmBuckets.size < maxBucketsPerRealm) {
            realmBuckets[key] = Bucket(ArrayDeque<Long>().apply { addLast(now) })
        }
    }

    @Synchronized
    fun clear(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) {
        // Successful authentication never erases failure evidence; expiry owns eviction.
        Unit
    }

    private fun pruneExpiredBuckets(realmBuckets: LinkedHashMap<String, Bucket>, now: Long) {
        val iterator = realmBuckets.entries.iterator()
        while (iterator.hasNext()) {
            val entry = iterator.next()
            prune(entry.value, now)
            if (entry.value.failures.isEmpty()) iterator.remove()
        }
    }

    private fun prune(bucket: Bucket, now: Long) {
        while (bucket.failures.isNotEmpty() && now - bucket.failures.first >= window) bucket.failures.removeFirst()
    }

    private fun effectiveNow(): Long {
        val wallNow = clock.millis()
        val effectiveNow = lastObservedMillis?.let { maxOf(wallNow, it) } ?: wallNow
        lastObservedMillis = effectiveNow
        return effectiveNow
    }

    private fun retryAfter(expiryMillis: Long, now: Long): Long {
        val remainingMillis = (expiryMillis - now).coerceAtLeast(0)
        val seconds = remainingMillis / MILLIS_PER_SECOND + if (remainingMillis % MILLIS_PER_SECOND == 0L) 0 else 1
        return seconds.coerceAtLeast(1)
    }

    private fun key(realm: IdentityRealm, sourceIp: String, canonicalEmail: String): String =
        realm.name + "|" + sourceIp.trim() + "|" + sha256(canonicalEmail)

    private fun sha256(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val MAX_FAILURES = 5
        private const val MILLIS_PER_SECOND = 1_000L
        const val DEFAULT_MAX_BUCKETS_PER_REALM = 10_000
    }
}
