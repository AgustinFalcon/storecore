package com.storecore.catalog.application.media

import com.storecore.catalog.domain.media.*
import java.time.Duration
import java.time.Instant
import java.util.UUID

data class MediaDraftRegistration(
    val draftId: CatalogMediaDraftId,
    val ownerId: MediaOwnerId,
    val targetProductId: MediaProductId?,
    val expiresAt: Instant,
)

sealed interface MediaDraftRegistrationResult {
    data object Created : MediaDraftRegistrationResult
    data object Replay : MediaDraftRegistrationResult
    data object Conflict : MediaDraftRegistrationResult
    data object OwnerMissing : MediaDraftRegistrationResult
}

class MediaUploadRegistration private constructor(
    val draftId: CatalogMediaDraftId,
    val ownerId: MediaOwnerId,
    val targetProductId: MediaProductId?,
    val uploadId: UploadId,
    val assetId: MediaAssetId,
    val requestHash: MediaRequestHash,
    val originalDigest: ContentDigest,
    val normalizedDigest: ContentDigest,
    val format: MediaFormat,
    val dimensions: PixelDimensions,
    val normalizedSize: MediaByteSize,
    val deterministicKey: ProviderObjectKey,
) {
    companion object {
        fun create(
            draftId: CatalogMediaDraftId,
            ownerId: MediaOwnerId,
            targetProductId: MediaProductId?,
            uploadId: UploadId,
            assetId: MediaAssetId,
            originalDigest: ContentDigest,
            normalizedDigest: ContentDigest,
            format: MediaFormat,
            dimensions: PixelDimensions,
            normalizedSize: MediaByteSize,
            deterministicKey: ProviderObjectKey,
        ): MediaUploadRegistration? = format.takeUnless { it == MediaFormat.UNKNOWN }?.let {
            MediaUploadRegistration(
                draftId, ownerId, targetProductId, uploadId, assetId,
                MediaRequestHash.forUpload(
                    draftId, ownerId, targetProductId, uploadId, originalDigest, normalizedDigest,
                    format, dimensions, normalizedSize,
                ),
                originalDigest, normalizedDigest, format, dimensions, normalizedSize, deterministicKey,
            )
        }
    }
}

data class MediaUploadSnapshot(
    val draftId: CatalogMediaDraftId,
    val ownerId: MediaOwnerId,
    val uploadId: UploadId,
    val assetId: MediaAssetId,
    val state: MediaCommandState,
    val assetState: MediaAssetState,
    val requestHash: MediaRequestHash,
    val normalizedDigest: ContentDigest,
    val providerKind: MediaProviderKind,
    val providerKey: ProviderObjectKey?,
)

sealed interface MediaUploadRegistrationResult {
    data class Created(val snapshot: MediaUploadSnapshot) : MediaUploadRegistrationResult
    data class Replay(val snapshot: MediaUploadSnapshot) : MediaUploadRegistrationResult
    data object Conflict : MediaUploadRegistrationResult
    data object ScopeDenied : MediaUploadRegistrationResult
    data object DraftClosed : MediaUploadRegistrationResult
}

data class MediaUploadLease(
    val snapshot: MediaUploadSnapshot,
    val deterministicKey: ProviderObjectKey,
    val format: MediaFormat,
    val dimensions: PixelDimensions,
    val normalizedSize: MediaByteSize,
    val leaseOwner: UUID,
    val leaseUntil: Instant,
    val fenceVersion: Long,
)

sealed interface MediaUploadClaimResult {
    data class Claimed(val lease: MediaUploadLease) : MediaUploadClaimResult
    data class AlreadyStored(val snapshot: MediaUploadSnapshot) : MediaUploadClaimResult
    data object Busy : MediaUploadClaimResult
    data object ScopeDenied : MediaUploadClaimResult
    data object Missing : MediaUploadClaimResult
}

data class MediaDeleteLease(
    val assetId: MediaAssetId,
    val providerKey: ProviderObjectKey,
    val digest: ContentDigest,
    val purpose: MediaDeletePurpose,
    val leaseOwner: UUID,
    val leaseUntil: Instant,
    val fenceVersion: Long,
)

sealed interface MediaDeleteRequestResult {
    data object Requested : MediaDeleteRequestResult
    data object Replay : MediaDeleteRequestResult
    data object ScopeDenied : MediaDeleteRequestResult
    data object Referenced : MediaDeleteRequestResult
    data object Missing : MediaDeleteRequestResult
}

interface MediaCommandRepository {
    fun registerDraft(command: MediaDraftRegistration): MediaDraftRegistrationResult
    fun registerUpload(command: MediaUploadRegistration): MediaUploadRegistrationResult
    fun findUpload(ownerId: MediaOwnerId, draftId: CatalogMediaDraftId, uploadId: UploadId): MediaUploadSnapshot?
    fun claimUpload(
        ownerId: MediaOwnerId,
        draftId: CatalogMediaDraftId,
        uploadId: UploadId,
        leaseOwner: UUID,
        now: Instant,
        duration: Duration,
    ): MediaUploadClaimResult
    fun confirmStored(lease: MediaUploadLease, lookup: ObjectLookupOutcome.Present, providerKind: MediaProviderKind, now: Instant): Boolean
    fun retryUpload(lease: MediaUploadLease, now: Instant): Boolean
    fun failUpload(lease: MediaUploadLease, failure: MediaFailureCode, now: Instant): Boolean
    fun requestDelete(ownerId: MediaOwnerId, assetId: MediaAssetId, purpose: MediaDeletePurpose, now: Instant): MediaDeleteRequestResult
    fun claimDelete(leaseOwner: UUID, now: Instant, duration: Duration): MediaDeleteLease?
    fun settleDelete(lease: MediaDeleteLease, outcome: MediaDeleteOutcome, now: Instant, retryAfter: Duration): Boolean
}
