package com.storecore.identity.infrastructure.security

import com.storecore.identity.application.LoginRateLimited
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.util.ArrayDeque

/** One monitor protects access and eviction; callers never retain detached buckets. */
internal class BoundedAttemptWindow<K : Any>(private val clock: Clock, private val limit: Int, private val maxKeys: Int) {
    private val buckets = mutableMapOf<K, ArrayDeque<Long>>()
    private val windowMillis = Duration.ofMinutes(15).toMillis()
    private var nextSweepAt = Long.MIN_VALUE
    init { require(limit > 0 && maxKeys > 0) }

    @Synchronized fun acquire(key: K) {
        val now = clock.millis()
        sweep(now)
        val bucket = bucket(key, now)
        if (bucket.size >= limit) throw LoginRateLimited(retryAfter(bucket, now))
        bucket.addLast(now)
    }

    @Synchronized fun checkAllowed(key: K) {
        val now = clock.millis()
        sweep(now)
        val bucket = buckets[key] ?: run {
            if (buckets.size >= maxKeys) sweep(now, force = true)
            if (buckets.size >= maxKeys) throw LoginRateLimited(900)
            return
        }
        prune(bucket, now)
        if (bucket.isEmpty()) buckets.remove(key)
        else if (bucket.size >= limit) throw LoginRateLimited(retryAfter(bucket, now))
    }

    @Synchronized fun recordFailure(key: K) {
        val now = clock.millis()
        sweep(now)
        val bucket = bucket(key, now)
        // Preserve the latest limit failures: these are sufficient to decide whether
        // at least limit rejections remain in the rolling window, including in-flight ones.
        if (bucket.size >= limit) bucket.removeFirst()
        bucket.addLast(now)
    }

    private fun bucket(key: K, now: Long): ArrayDeque<Long> {
        buckets[key]?.let { prune(it, now); return it }
        if (buckets.size >= maxKeys) sweep(now, force = true)
        if (buckets.size >= maxKeys) throw LoginRateLimited(900)
        return ArrayDeque<Long>().also { buckets[key] = it }
    }

    private fun sweep(now: Long, force: Boolean = false) {
        if (!force && now < nextSweepAt) return
        val iterator = buckets.values.iterator()
        while (iterator.hasNext()) {
            val bucket = iterator.next()
            prune(bucket, now)
            if (bucket.isEmpty()) iterator.remove()
        }
        nextSweepAt = now + 60_000
    }

    private fun prune(bucket: ArrayDeque<Long>, now: Long) {
        while (bucket.isNotEmpty() && now - bucket.first >= windowMillis) bucket.removeFirst()
    }
    private fun retryAfter(bucket: ArrayDeque<Long>, now: Long): Long =
        ((bucket.first + windowMillis - now + 999) / 1000).coerceAtLeast(1)
}

internal data class AuthenticationBudgetKey(val sourceIp: String, val digest: String)
internal fun canonicalEmailDigest(value: String): String =
    MessageDigest.getInstance("SHA-256").digest(value.toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
