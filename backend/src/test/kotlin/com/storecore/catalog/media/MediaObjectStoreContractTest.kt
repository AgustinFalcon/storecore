package com.storecore.catalog.media

import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.media.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.security.MessageDigest
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

class MediaObjectStoreContractTest {
    private val clock = Clock.fixed(Instant.parse("2026-11-18T12:00:00Z"), ZoneOffset.UTC)
    private val store = TestMediaObjectStore(clock)
    private val key = ProviderObjectKey.fromWire("catalog/aa/object")!!
    private val bytes = "normalized-image".toByteArray()
    private val digest = ContentDigest.fromWire(MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) })!!
    private val metadata = MediaObjectMetadata.create(MediaFormat.WEBP, PixelDimensions.fromWire(800, 600)!!)!!

    @Test fun `put is idempotent and a different digest never overwrites`() {
        val payload = NormalizedMediaBytes.from(bytes)!!
        assertInstanceOf(PutOutcome.Stored::class.java, store.putIfAbsent(payload, key, digest, metadata))
        assertInstanceOf(PutOutcome.AlreadyPresent::class.java, store.putIfAbsent(payload, key, digest, metadata))
        val other = "other".toByteArray()
        val otherDigest = ContentDigest.fromWire(MessageDigest.getInstance("SHA-256").digest(other).joinToString("") { "%02x".format(it) })!!
        assertSame(PutOutcome.DigestConflict, store.putIfAbsent(NormalizedMediaBytes.from(other)!!, key, otherDigest, metadata))
        assertEquals(digest, (store.head(key) as ObjectLookupOutcome.Present).digest)
    }

    @Test fun `bytes are available only through an exact unexpired private grant`() {
        store.putIfAbsent(NormalizedMediaBytes.from(bytes)!!, key, digest, metadata)
        val ttl = PrivateReadTtl.from(Duration.ofMinutes(5))!!
        val grant = store.signedPrivateRead(key, digest, ttl) as PrivateReadOutcome.Granted
        assertArrayEquals(bytes, store.readAuthorised(grant.uri))
        assertNull(store.readAuthorised(grant.uri.resolve("?digest=${digest.value}&expires=${grant.expiresAtEpochSecond}&token=forged")))
        val wrongDigest = ContentDigest.fromWire("b".repeat(64))!!
        assertSame(PrivateReadOutcome.DigestMismatch, store.signedPrivateRead(key, wrongDigest, ttl))
    }

    @Test fun `delete is digest guarded and idempotent`() {
        store.putIfAbsent(NormalizedMediaBytes.from(bytes)!!, key, digest, metadata)
        assertSame(ObjectDeleteOutcome.TerminalFailure, store.deleteIfDigest(key, ContentDigest.fromWire("b".repeat(64))!!))
        assertSame(ObjectDeleteOutcome.Deleted, store.deleteIfDigest(key, digest))
        assertSame(ObjectDeleteOutcome.AlreadyAbsent, store.deleteIfDigest(key, digest))
    }

    @Test fun `unconfigured production adapter fails closed`() {
        val unconfigured = UnconfiguredMediaObjectStore()
        assertSame(PutOutcome.Unavailable, unconfigured.putIfAbsent(NormalizedMediaBytes.from(bytes)!!, key, digest, metadata))
        assertSame(ObjectLookupOutcome.Unavailable, unconfigured.head(key))
        assertSame(PrivateReadOutcome.Unavailable, unconfigured.signedPrivateRead(key, digest, PrivateReadTtl.from(Duration.ofMinutes(1))!!))
        assertSame(ObjectDeleteOutcome.RetryableFailure, unconfigured.deleteIfDigest(key, digest))
    }
}
