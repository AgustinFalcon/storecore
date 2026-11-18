package com.storecore.catalog.media

import com.storecore.catalog.application.media.MediaObjectMetadata
import com.storecore.catalog.application.media.MediaObjectStore
import com.storecore.catalog.application.media.NormalizedMediaBytes
import com.storecore.catalog.application.media.ObjectDeleteOutcome
import com.storecore.catalog.application.media.ObjectLookupOutcome
import com.storecore.catalog.application.media.PrivateReadOutcome
import com.storecore.catalog.application.media.PutOutcome
import com.storecore.catalog.domain.media.ContentDigest
import com.storecore.catalog.domain.media.PrivateReadTtl
import com.storecore.catalog.domain.media.ProviderObjectKey
import com.storecore.catalog.domain.media.MediaProviderKind
import java.net.URI
import java.security.MessageDigest
import java.time.Clock
import java.util.concurrent.ConcurrentHashMap

/** Deterministic in-memory adapter available only to tests. Bytes require a valid, unexpired grant. */
class TestMediaObjectStore(private val clock: Clock) : MediaObjectStore {
    override val kind = MediaProviderKind.TEST_STUB
    private data class StoredObject(val bytes: ByteArray, val digest: ContentDigest, val metadata: MediaObjectMetadata)
    private data class IssuedGrant(val key: String, val digest: String, val expiry: Long)
    private val objects = ConcurrentHashMap<String, StoredObject>()
    private val issuedGrants = ConcurrentHashMap<String, IssuedGrant>()

    override fun putIfAbsent(bytes: NormalizedMediaBytes, deterministicKey: ProviderObjectKey, digest: ContentDigest, metadata: MediaObjectMetadata): PutOutcome {
        val raw = bytes.copyBytes()
        if (sha256(raw) != digest.value) return PutOutcome.DigestConflict
        val incoming = StoredObject(raw, digest, metadata)
        val existing = objects.putIfAbsent(deterministicKey.value, incoming)
        return when {
            existing == null -> PutOutcome.Stored(deterministicKey)
            existing.digest == digest -> PutOutcome.AlreadyPresent(deterministicKey)
            else -> PutOutcome.DigestConflict
        }
    }

    override fun head(deterministicKey: ProviderObjectKey): ObjectLookupOutcome {
        val found = objects[deterministicKey.value] ?: return ObjectLookupOutcome.Absent
        return if (sha256(found.bytes) == found.digest.value) {
            ObjectLookupOutcome.Present(deterministicKey, found.digest, found.bytes.size.toLong(), found.metadata)
        } else ObjectLookupOutcome.DigestMismatch
    }

    override fun signedPrivateRead(providerKey: ProviderObjectKey, digest: ContentDigest, ttl: PrivateReadTtl): PrivateReadOutcome {
        val found = objects[providerKey.value] ?: return PrivateReadOutcome.Absent
        if (found.digest != digest || sha256(found.bytes) != digest.value) return PrivateReadOutcome.DigestMismatch
        val expiry = clock.instant().plus(ttl.value).epochSecond
        val token = sha256("${providerKey.value}|${digest.value}|$expiry|test-only".toByteArray())
        val uri = URI("test-private://media/${providerKey.value}?digest=${digest.value}&expires=$expiry&token=$token")
        issuedGrants[uri.toASCIIString()] = IssuedGrant(providerKey.value, digest.value, expiry)
        return PrivateReadOutcome.Granted(uri, expiry)
    }

    override fun deleteIfDigest(providerKey: ProviderObjectKey, digest: ContentDigest): ObjectDeleteOutcome {
        val current = objects[providerKey.value] ?: return ObjectDeleteOutcome.AlreadyAbsent
        if (current.digest != digest || sha256(current.bytes) != digest.value) return ObjectDeleteOutcome.TerminalFailure
        return if (objects.remove(providerKey.value, current)) ObjectDeleteOutcome.Deleted else ObjectDeleteOutcome.RetryableFailure
    }

    fun size(): Int = objects.size

    fun readAuthorised(grant: URI): ByteArray? {
        if (grant.scheme != "test-private" || grant.host != "media") return null
        val issued = issuedGrants[grant.toASCIIString()] ?: return null
        val key = grant.path.removePrefix("/")
        val query = grant.rawQuery?.split('&')?.mapNotNull { part -> part.split('=', limit = 2).takeIf { it.size == 2 }?.let { it[0] to it[1] } }?.toMap() ?: return null
        val digest = query["digest"] ?: return null
        val expiry = query["expires"]?.toLongOrNull() ?: return null
        val expected = sha256("$key|$digest|$expiry|test-only".toByteArray())
        if (query["token"] != expected || clock.instant().epochSecond >= expiry || issued != IssuedGrant(key, digest, expiry)) return null
        val found = objects[key] ?: return null
        return found.bytes.copyOf().takeIf { found.digest.value == digest && sha256(it) == digest }
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
