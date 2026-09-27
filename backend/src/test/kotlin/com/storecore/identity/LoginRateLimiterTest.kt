package com.storecore.identity

import com.storecore.identity.application.LoginRateLimited
import com.storecore.identity.domain.IdentityRealm
import com.storecore.identity.infrastructure.security.LoginRateLimiter
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.ArrayDeque
import java.util.EnumMap
import java.util.LinkedHashMap

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
        val reference = FullHistoryReference(clock)
        repeat(4) {
            assertEquivalentRecord(limiter, reference, IdentityRealm.USER, IP, EMAIL)
            clock.advanceMillis(1_000L)
        }
        // Two requests passed checkAllowed before either recorded its failure.
        assertEquals(null, assertEquivalentCheck(limiter, reference, IdentityRealm.USER, IP, EMAIL))
        assertEquals(null, assertEquivalentCheck(limiter, reference, IdentityRealm.USER, IP, EMAIL))
        assertEquivalentRecord(limiter, reference, IdentityRealm.USER, IP, EMAIL)
        clock.advanceMillis(1_000L)
        assertEquivalentRecord(limiter, reference, IdentityRealm.USER, IP, EMAIL)

        clock.set(START.plus(Duration.ofMinutes(15)).minusMillis(1))
        assertEquals(2L, assertEquivalentCheck(limiter, reference, IdentityRealm.USER, IP, EMAIL))
        clock.set(START.plus(Duration.ofMinutes(15))) // The oldest failure expires; five remain.
        assertEquals(1L, assertEquivalentCheck(limiter, reference, IdentityRealm.USER, IP, EMAIL))
        clock.set(START.plus(Duration.ofMinutes(15)).plusSeconds(1))
        assertEquals(null, assertEquivalentCheck(limiter, reference, IdentityRealm.USER, IP, EMAIL))
    }

    @Test
    fun `bounded suffix matches full history for six thirty two and two hundred fifty six failures`() {
        listOf(6, 32, 256).forEach { failureCount ->
            val clock = MutableClock(START)
            val limiter = LoginRateLimiter(clock, maxBucketsPerRealm = 2)
            val reference = FullHistoryReference(clock, maxBucketsPerRealm = 2)
            val realm = if (failureCount == 32) IdentityRealm.CUSTOMER else IdentityRealm.USER

            repeat(failureCount) { index ->
                // Model requests that passed admission together, then recorded failures independently.
                if (index == 2) {
                    assertEquivalentCheck(limiter, reference, realm, IP, EMAIL)
                    assertEquivalentCheck(limiter, reference, realm, IP, EMAIL)
                }
                assertEquivalentRecord(limiter, reference, realm, IP, EMAIL)

                if (index % 17 == 0) clock.advanceMillis(2_003L) else clock.advanceMillis(7L)
                assertEquivalentCheck(limiter, reference, realm, IP, EMAIL)
                assertSuffixAndBound(limiter, reference)
            }

            // Capacity decisions use the last failure in each bucket, even when its older
            // history has been discarded from the implementation deque.
            assertEquivalentRecord(limiter, reference, realm, "10.0.0.2", "second@example.com")
            assertEquivalentCheck(limiter, reference, realm, "10.0.0.3", "capacity@example.com")
            assertSuffixAndBound(limiter, reference)
        }
    }

    @Test
    fun `watermark preserves decisions through rewinds pruning truncation and clear`() {
        val clock = MutableClock(START)
        val limiter = LoginRateLimiter(clock)
        val reference = FullHistoryReference(clock)

        repeat(5) {
            assertEquivalentRecord(limiter, reference, IdentityRealm.USER, IP, EMAIL)
            clock.advanceMillis(Duration.ofMinutes(1).toMillis())
        }

        // Rewind before pruning and the sixth direct failure; effective time stays at the last observation (t=4).
        clock.set(START.plus(Duration.ofMinutes(2)))
        assertEquivalentCheck(limiter, reference, IdentityRealm.USER, IP, EMAIL)
        assertEquivalentRecord(limiter, reference, IdentityRealm.USER, IP, EMAIL)

        // The first timestamp was discarded by the size cap. Expire the next one, then
        // rewind behind the watermark; neither discarded nor pruned failures may return.
        clock.set(START.plus(Duration.ofMinutes(16)).minusMillis(1))
        assertEquals(1L, assertEquivalentCheck(limiter, reference, IdentityRealm.USER, IP, EMAIL))
        clock.set(START.plus(Duration.ofMinutes(16)))
        assertEquivalentCheck(limiter, reference, IdentityRealm.USER, IP, EMAIL)
        clock.set(START.plus(Duration.ofMinutes(3)))
        assertEquivalentCheck(limiter, reference, IdentityRealm.USER, IP, EMAIL)
        assertSuffixAndBound(limiter, reference)

        limiter.clear(IdentityRealm.USER, IP, EMAIL)
        reference.clear(IdentityRealm.USER, IP, EMAIL)
        assertSuffixAndBound(limiter, reference)
        // clear removes only a bucket and must not reset the monotonic clock watermark.
        clock.set(START.minus(Duration.ofDays(1)))
        assertEquivalentRecord(limiter, reference, IdentityRealm.USER, IP, EMAIL)
        assertEquivalentCheck(limiter, reference, IdentityRealm.USER, IP, EMAIL)
        assertEquivalentRecord(limiter, reference, IdentityRealm.CUSTOMER, IP, EMAIL)
        assertEquivalentCheck(limiter, reference, IdentityRealm.CUSTOMER, IP, EMAIL)
        assertSuffixAndBound(limiter, reference)

        clock.set(START.plus(Duration.ofMinutes(20)))
        assertEquivalentCheck(limiter, reference, IdentityRealm.USER, IP, EMAIL)
        assertEquivalentCheck(limiter, reference, IdentityRealm.CUSTOMER, IP, EMAIL)
        assertSuffixAndBound(limiter, reference)
    }

    @Test
    fun `capacity retry matches full history when bucket last failures are crossed`() {
        val clock = MutableClock(START)
        val limiter = LoginRateLimiter(clock, maxBucketsPerRealm = 2)
        val reference = FullHistoryReference(clock, maxBucketsPerRealm = 2)

        assertEquivalentRecord(limiter, reference, IdentityRealm.CUSTOMER, IP, "first@example.com") // t=0
        clock.advanceMillis(Duration.ofMinutes(1).toMillis())
        assertEquivalentRecord(limiter, reference, IdentityRealm.CUSTOMER, IP, "second@example.com") // t=1
        clock.advanceMillis(Duration.ofMinutes(1).toMillis())
        assertEquivalentRecord(limiter, reference, IdentityRealm.CUSTOMER, IP, "second@example.com") // t=2, earliest bucket expiry t=17
        clock.advanceMillis(Duration.ofMinutes(3).toMillis())
        assertEquivalentRecord(limiter, reference, IdentityRealm.CUSTOMER, IP, "first@example.com") // t=5

        clock.set(START.plus(Duration.ofMinutes(5)))
        assertEquals(12L * 60, assertEquivalentCheck(limiter, reference, IdentityRealm.CUSTOMER, IP, "new@example.com"))
        clock.set(START.plus(Duration.ofMinutes(17)).minusMillis(1))
        assertEquals(1L, assertEquivalentCheck(limiter, reference, IdentityRealm.CUSTOMER, IP, "new@example.com"))
        clock.set(START.plus(Duration.ofMinutes(17)))
        assertEquals(null, assertEquivalentCheck(limiter, reference, IdentityRealm.CUSTOMER, IP, "new@example.com"))
        clock.advanceMillis(1L)
        assertEquivalentCheck(limiter, reference, IdentityRealm.CUSTOMER, IP, "new@example.com")
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

    private fun assertEquivalentCheck(
        limiter: LoginRateLimiter,
        reference: FullHistoryReference,
        realm: IdentityRealm,
        ip: String,
        email: String,
    ): Long? {
        val actual = runCatching { limiter.checkAllowed(realm, ip, email) }
            .exceptionOrNull()?.let { (it as LoginRateLimited).retryAfterSeconds }
        val expected = reference.checkAllowed(realm, ip, email)
        assertEquals(expected, actual, "admission and Retry-After must match for $realm/$email")
        assertSuffixAndBound(limiter, reference)
        return actual
    }

    private fun assertEquivalentRecord(
        limiter: LoginRateLimiter,
        reference: FullHistoryReference,
        realm: IdentityRealm,
        ip: String,
        email: String,
    ) {
        limiter.recordFailure(realm, ip, email)
        reference.recordFailure(realm, ip, email)
        assertSuffixAndBound(limiter, reference)
    }

    private fun assertSuffixAndBound(limiter: LoginRateLimiter, reference: FullHistoryReference) {
        val bounded = limiterSnapshot(limiter)
        val complete = reference.snapshot()
        assertEquals(complete.keys, bounded.keys, "active realm buckets must be equal")
        complete.forEach { (realm, expectedBuckets) ->
            val actualBuckets = bounded.getValue(realm)
            assertEquals(expectedBuckets.keys, actualBuckets.keys, "active keys must match for $realm")
            expectedBuckets.forEach { (key, fullHistory) ->
                val expectedSuffix = fullHistory.takeLast(MAX_FAILURES)
                val actual = actualBuckets.getValue(key)
                assertEquals(expectedSuffix, actual, "bounded deque must be the last five full-history timestamps")
                assertEquals(minOf(MAX_FAILURES, fullHistory.size), actual.size)
                assertTrue(actual.size <= MAX_FAILURES, "each production deque must stay at most five")
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun limiterSnapshot(limiter: LoginRateLimiter): Map<IdentityRealm, Map<String, List<Long>>> {
        val realmsField = limiter.javaClass.getDeclaredField("bucketsByRealm").apply { isAccessible = true }
        val realms = realmsField.get(limiter) as Map<IdentityRealm, Map<String, Any>>
        return IdentityRealm.entries.associateWith { realm ->
            realms.getValue(realm).mapValues { (_, bucket) ->
                val failures = bucket.javaClass.getDeclaredField("failures").apply { isAccessible = true }
                (failures.get(bucket) as Iterable<Long>).toList()
            }
        }
    }

    /** Independent, deliberately unbounded behavioral oracle for the limiter contract. */
    private class FullHistoryReference(
        private val clock: Clock,
        private val maxBucketsPerRealm: Int = LoginRateLimiter.DEFAULT_MAX_BUCKETS_PER_REALM,
    ) {
        private val bucketsByRealm = EnumMap<IdentityRealm, LinkedHashMap<String, ArrayDeque<Long>>>(IdentityRealm::class.java).apply {
            IdentityRealm.entries.forEach { put(it, LinkedHashMap()) }
        }
        private var lastObservedMillis: Long? = null

        fun checkAllowed(realm: IdentityRealm, sourceIp: String, canonicalEmail: String): Long? {
            val now = effectiveNow()
            val realmBuckets = bucketsByRealm.getValue(realm)
            val key = key(realm, sourceIp, canonicalEmail)
            val bucket = realmBuckets[key]
            if (bucket != null) {
                prune(bucket, now)
                if (bucket.size >= MAX_FAILURES) return retryAfter(bucket.elementAt(bucket.size - MAX_FAILURES) + WINDOW_MILLIS, now)
                if (bucket.isEmpty()) realmBuckets.remove(key)
                return null
            }

            pruneExpiredBuckets(realmBuckets, now)
            if (realmBuckets.size >= maxBucketsPerRealm) {
                val earliestCapacityRelease = realmBuckets.values.minOf { it.last + WINDOW_MILLIS }
                return retryAfter(earliestCapacityRelease, now)
            }
            return null
        }

        fun recordFailure(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) {
            val now = effectiveNow()
            val realmBuckets = bucketsByRealm.getValue(realm)
            val key = key(realm, sourceIp, canonicalEmail)
            val bucket = realmBuckets[key]
            if (bucket != null) {
                prune(bucket, now)
                bucket.addLast(now)
                return
            }

            pruneExpiredBuckets(realmBuckets, now)
            if (realmBuckets.size < maxBucketsPerRealm) realmBuckets[key] = ArrayDeque<Long>().apply { addLast(now) }
        }

        fun clear(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) {
            bucketsByRealm.getValue(realm).remove(key(realm, sourceIp, canonicalEmail))
        }

        fun snapshot(): Map<IdentityRealm, Map<String, List<Long>>> = IdentityRealm.entries.associateWith { realm ->
            bucketsByRealm.getValue(realm).mapValues { (_, failures) -> failures.toList() }
        }

        private fun effectiveNow(): Long {
            val wallNow = clock.millis()
            val now = lastObservedMillis?.let { maxOf(wallNow, it) } ?: wallNow
            lastObservedMillis = now
            return now
        }

        private fun pruneExpiredBuckets(realmBuckets: LinkedHashMap<String, ArrayDeque<Long>>, now: Long) {
            val iterator = realmBuckets.entries.iterator()
            while (iterator.hasNext()) {
                val entry = iterator.next()
                prune(entry.value, now)
                if (entry.value.isEmpty()) iterator.remove()
            }
        }

        private fun prune(failures: ArrayDeque<Long>, now: Long) {
            while (failures.isNotEmpty() && now - failures.first >= WINDOW_MILLIS) failures.removeFirst()
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
    }

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
        private const val MAX_FAILURES = 5
        private const val MILLIS_PER_SECOND = 1_000L
        private val WINDOW_MILLIS = Duration.ofMinutes(15).toMillis()
    }
}
