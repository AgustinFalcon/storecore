package com.storecore.catalog.application.media

import com.storecore.catalog.domain.media.ContentDigest
import com.storecore.catalog.domain.media.MediaFormat
import com.storecore.catalog.domain.media.MediaProviderKind
import com.storecore.catalog.domain.media.PixelDimensions
import com.storecore.catalog.domain.media.PrivateReadTtl
import com.storecore.catalog.domain.media.ProviderObjectKey
import java.net.URI

class NormalizedMediaBytes private constructor(private val value: ByteArray) {
    val size: Int get() = value.size
    fun copyBytes(): ByteArray = value.copyOf()
    companion object { fun from(bytes: ByteArray?): NormalizedMediaBytes? = bytes?.takeIf { it.isNotEmpty() }?.copyOf()?.let(::NormalizedMediaBytes) }
}

class MediaObjectMetadata private constructor(val format: MediaFormat, val dimensions: PixelDimensions) {
    companion object {
        fun create(format: MediaFormat, dimensions: PixelDimensions): MediaObjectMetadata? =
            format.takeIf { it != MediaFormat.UNKNOWN }?.let { MediaObjectMetadata(it, dimensions) }
    }
}

sealed interface PutOutcome {
    data class Stored(val providerKey: ProviderObjectKey) : PutOutcome
    data class AlreadyPresent(val providerKey: ProviderObjectKey) : PutOutcome
    data object DigestConflict : PutOutcome
    data object Unavailable : PutOutcome
    data object Unknown : PutOutcome
}

sealed interface ObjectLookupOutcome {
    data class Present(val providerKey: ProviderObjectKey, val digest: ContentDigest, val size: Long, val metadata: MediaObjectMetadata) : ObjectLookupOutcome
    data object Absent : ObjectLookupOutcome
    data object DigestMismatch : ObjectLookupOutcome
    data object Unavailable : ObjectLookupOutcome
    data object Unknown : ObjectLookupOutcome
}

sealed interface PrivateReadOutcome {
    data class Granted(val uri: URI, val expiresAtEpochSecond: Long) : PrivateReadOutcome
    data object Absent : PrivateReadOutcome
    data object DigestMismatch : PrivateReadOutcome
    data object Unavailable : PrivateReadOutcome
    data object Unknown : PrivateReadOutcome
}

sealed interface ObjectDeleteOutcome {
    data object Deleted : ObjectDeleteOutcome
    data object AlreadyAbsent : ObjectDeleteOutcome
    data object RetryableFailure : ObjectDeleteOutcome
    data object TerminalFailure : ObjectDeleteOutcome
    data object Unknown : ObjectDeleteOutcome
}

interface MediaObjectStore {
    val kind: MediaProviderKind
    fun putIfAbsent(bytes: NormalizedMediaBytes, deterministicKey: ProviderObjectKey, digest: ContentDigest, metadata: MediaObjectMetadata): PutOutcome
    fun head(deterministicKey: ProviderObjectKey): ObjectLookupOutcome
    fun signedPrivateRead(providerKey: ProviderObjectKey, digest: ContentDigest, ttl: PrivateReadTtl): PrivateReadOutcome
    fun deleteIfDigest(providerKey: ProviderObjectKey, digest: ContentDigest): ObjectDeleteOutcome
}

class UnconfiguredMediaObjectStore : MediaObjectStore {
    override val kind = MediaProviderKind.UNCONFIGURED
    override fun putIfAbsent(bytes: NormalizedMediaBytes, deterministicKey: ProviderObjectKey, digest: ContentDigest, metadata: MediaObjectMetadata) = PutOutcome.Unavailable
    override fun head(deterministicKey: ProviderObjectKey) = ObjectLookupOutcome.Unavailable
    override fun signedPrivateRead(providerKey: ProviderObjectKey, digest: ContentDigest, ttl: PrivateReadTtl) = PrivateReadOutcome.Unavailable
    override fun deleteIfDigest(providerKey: ProviderObjectKey, digest: ContentDigest) = ObjectDeleteOutcome.RetryableFailure
}
