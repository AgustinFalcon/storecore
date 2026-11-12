package com.storecore.identity.infrastructure.security

import com.storecore.identity.application.*
import com.storecore.identity.domain.RecoveryRealm
import java.time.Clock
import java.util.ArrayDeque
import java.util.concurrent.atomic.AtomicBoolean

/** One monitor reserves composed budgets before a lookup, including in-flight failures. */
class RecoveryAttemptBudget(
    private val clock: Clock = Clock.systemUTC(),
    private val maxKeys: Int = 10_000,
    private val requestIpLimit: Int = 60,
    private val requestInstanceLimit: Int = 3_000,
    private val tokenIpLimit: Int = 120,
    private val tokenInstanceLimit: Int = 10_000,
) : RecoveryBudgetPort {
    private data class TargetKey(val ip: String, val realm: RecoveryRealm, val digest: String)
    private data class TokenKey(val ip: String, val hash: String)
    private class Bucket { val attempts = ArrayDeque<Long>(); var pending = 0 }
    private val requestIps = mutableMapOf<String, Bucket>()
    private val targets = mutableMapOf<TargetKey, Bucket>()
    private val tokenIps = mutableMapOf<String, Bucket>()
    private val hashes = mutableMapOf<TokenKey, Bucket>()
    private val requests = Bucket()
    private val tokens = Bucket()
    private val window = 900_000L
    private var nextSweep = Long.MIN_VALUE
    init { require(maxKeys > 0 && listOf(requestIpLimit, requestInstanceLimit, tokenIpLimit, tokenInstanceLimit).all { it > 0 }) }

    @Synchronized override fun request(sourceIp: String, realm: RecoveryRealm, emailDigest: String): Boolean {
        val now = clock.millis()
        sweep(now)
        val ip = bucket(requestIps, sourceIp, now)
        val target = bucket(targets, TargetKey(sourceIp, realm, emailDigest), now)
        check(ip, requestIpLimit, now); check(requests, requestInstanceLimit, now)
        ip.attempts.addLast(now); requests.attempts.addLast(now)
        prune(target, now)
        if (target.attempts.size >= 20) return false
        target.attempts.addLast(now)
        return true
    }

    @Synchronized override fun token(sourceIp: String, tokenHash: String): RecoveryAttempt {
        val now = clock.millis()
        sweep(now)
        val ip = bucket(tokenIps, sourceIp, now)
        val hash = bucket(hashes, TokenKey(sourceIp, tokenHash), now)
        check(ip, tokenIpLimit, now); check(tokens, tokenInstanceLimit, now); check(hash, 10, now)
        ip.attempts.addLast(now); tokens.attempts.addLast(now); hash.pending++
        return object : RecoveryAttempt {
            private val finished = AtomicBoolean()
            override fun finish(success: Boolean) {
                if (finished.compareAndSet(false, true)) finish(hash, success)
            }
        }
    }

    @Synchronized private fun finish(bucket: Bucket, success: Boolean) {
        bucket.pending--
        if (!success) bucket.attempts.addLast(clock.millis())
    }

    private fun check(bucket: Bucket, limit: Int, now: Long) {
        prune(bucket, now)
        if (bucket.attempts.size + bucket.pending >= limit) {
            val seconds = bucket.attempts.peekFirst()?.let { ((it + window - now + 999) / 1000).coerceAtLeast(1) } ?: 1
            throw RecoveryRateLimited(seconds)
        }
    }
    private fun <K> bucket(map: MutableMap<K, Bucket>, key: K, now: Long): Bucket {
        map[key]?.let { prune(it, now); return it }
        if (map.size >= maxKeys) sweep(now, true)
        if (map.size >= maxKeys) throw RecoveryRateLimited(900)
        return Bucket().also { map[key] = it }
    }
    private fun prune(bucket: Bucket, now: Long) {
        while (bucket.attempts.isNotEmpty() && now - bucket.attempts.first >= window) bucket.attempts.removeFirst()
    }
    private fun sweep(now: Long, force: Boolean = false) {
        if (!force && now < nextSweep) return
        listOf(requestIps, targets, tokenIps, hashes).forEach { map ->
            val iterator = map.values.iterator()
            while (iterator.hasNext()) {
                val bucket = iterator.next(); prune(bucket, now)
                if (bucket.attempts.isEmpty() && bucket.pending == 0) iterator.remove()
            }
        }
        nextSweep = now + 60_000
    }
}
