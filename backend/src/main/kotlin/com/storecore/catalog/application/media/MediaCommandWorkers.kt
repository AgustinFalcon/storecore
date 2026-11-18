package com.storecore.catalog.application.media

import com.storecore.catalog.domain.media.MediaDeleteOutcome
import com.storecore.catalog.domain.media.MediaFailureCode
import java.time.Clock
import java.time.Duration
import java.util.UUID

sealed interface MediaUploadRun {
    data class Stored(val snapshot: MediaUploadSnapshot) : MediaUploadRun
    data class Replay(val snapshot: MediaUploadSnapshot) : MediaUploadRun
    data object Busy : MediaUploadRun
    data object Conflict : MediaUploadRun
    data object Denied : MediaUploadRun
    data object Retryable : MediaUploadRun
    data object Failed : MediaUploadRun
}

fun interface ExternalMediaIoGuard {
    fun requireNoActiveTransaction()
}

/** Registration belongs to the human mutation transaction; execution starts only after it commits. */
class MediaUploadWorker(
    private val commands: MediaCommandRepository,
    private val objects: MediaObjectStore,
    private val ioGuard: ExternalMediaIoGuard,
    private val clock: Clock,
    private val leaseDuration: Duration = Duration.ofMinutes(2),
) {
    fun executeRegistered(command: MediaUploadRegistration, bytes: NormalizedMediaBytes, workerId: UUID): MediaUploadRun {
        ioGuard.requireNoActiveTransaction()
        val snapshot = commands.findUpload(command.ownerId, command.draftId, command.uploadId)
            ?: return MediaUploadRun.Denied
        if (snapshot.requestHash != command.requestHash) return MediaUploadRun.Conflict
        if (snapshot.state == com.storecore.catalog.domain.media.MediaCommandState.COMPLETED)
            return MediaUploadRun.Replay(snapshot)
        val claim = commands.claimUpload(command.ownerId, command.draftId, command.uploadId, workerId, clock.instant(), leaseDuration)
        val lease = when (claim) {
            is MediaUploadClaimResult.Claimed -> claim.lease
            is MediaUploadClaimResult.AlreadyStored -> return MediaUploadRun.Replay(claim.snapshot)
            MediaUploadClaimResult.Busy -> return MediaUploadRun.Busy
            MediaUploadClaimResult.ScopeDenied, MediaUploadClaimResult.Missing -> return MediaUploadRun.Denied
        }
        return when (objects.putIfAbsent(bytes, lease.deterministicKey, lease.snapshot.normalizedDigest, MediaObjectMetadata.create(lease.format, lease.dimensions)!!)) {
            is PutOutcome.Stored, is PutOutcome.AlreadyPresent -> finalize(lease)
            PutOutcome.DigestConflict -> fail(lease, MediaFailureCode.SCOPE_CONFLICT)
            PutOutcome.Unavailable, PutOutcome.Unknown -> retry(lease)
        }
    }

    /** Recovery never invents bytes; it only proves an object that may already exist. */
    fun recover(lease: MediaUploadLease): MediaUploadRun {
        ioGuard.requireNoActiveTransaction()
        return finalize(lease)
    }

    private fun finalize(lease: MediaUploadLease): MediaUploadRun = when (val lookup = objects.head(lease.deterministicKey)) {
        is ObjectLookupOutcome.Present -> if (commands.confirmStored(lease, lookup, objects.kind, clock.instant()))
            MediaUploadRun.Stored(commands.findUpload(lease.snapshot.ownerId, lease.snapshot.draftId, lease.snapshot.uploadId)!!)
        else MediaUploadRun.Busy
        ObjectLookupOutcome.Absent, ObjectLookupOutcome.Unavailable, ObjectLookupOutcome.Unknown -> retry(lease)
        ObjectLookupOutcome.DigestMismatch -> fail(lease, MediaFailureCode.SCOPE_CONFLICT)
    }

    private fun retry(lease: MediaUploadLease): MediaUploadRun =
        if (commands.retryUpload(lease, clock.instant())) MediaUploadRun.Retryable else MediaUploadRun.Busy

    private fun fail(lease: MediaUploadLease, code: MediaFailureCode): MediaUploadRun =
        if (commands.failUpload(lease, code, clock.instant())) MediaUploadRun.Failed else MediaUploadRun.Busy
}

sealed interface MediaDeleteRun {
    data object Idle : MediaDeleteRun
    data object Tombstoned : MediaDeleteRun
    data object Retryable : MediaDeleteRun
    data object Blocked : MediaDeleteRun
    data object LeaseLost : MediaDeleteRun
}

class MediaDeleteWorker(
    private val commands: MediaCommandRepository,
    private val objects: MediaObjectStore,
    private val ioGuard: ExternalMediaIoGuard,
    private val clock: Clock,
    private val leaseDuration: Duration = Duration.ofMinutes(2),
    private val retryAfter: Duration = Duration.ofMinutes(1),
) {
    fun runOne(workerId: UUID): MediaDeleteRun {
        ioGuard.requireNoActiveTransaction()
        val lease = commands.claimDelete(workerId, clock.instant(), leaseDuration) ?: return MediaDeleteRun.Idle
        val outcome = when (objects.head(lease.providerKey)) {
            ObjectLookupOutcome.Absent -> MediaDeleteOutcome.ALREADY_ABSENT
            is ObjectLookupOutcome.Present -> when (objects.deleteIfDigest(lease.providerKey, lease.digest)) {
                ObjectDeleteOutcome.Deleted -> MediaDeleteOutcome.DELETED
                ObjectDeleteOutcome.AlreadyAbsent -> MediaDeleteOutcome.ALREADY_ABSENT
                ObjectDeleteOutcome.RetryableFailure -> MediaDeleteOutcome.RETRYABLE_FAILURE
                ObjectDeleteOutcome.TerminalFailure -> MediaDeleteOutcome.DIGEST_MISMATCH
                ObjectDeleteOutcome.Unknown -> MediaDeleteOutcome.UNKNOWN
            }
            ObjectLookupOutcome.DigestMismatch -> MediaDeleteOutcome.DIGEST_MISMATCH
            ObjectLookupOutcome.Unavailable, ObjectLookupOutcome.Unknown -> MediaDeleteOutcome.UNKNOWN
        }
        if (!commands.settleDelete(lease, outcome, clock.instant(), retryAfter)) return MediaDeleteRun.LeaseLost
        return when (outcome) {
            MediaDeleteOutcome.DELETED, MediaDeleteOutcome.ALREADY_ABSENT -> MediaDeleteRun.Tombstoned
            MediaDeleteOutcome.RETRYABLE_FAILURE, MediaDeleteOutcome.UNKNOWN -> MediaDeleteRun.Retryable
            MediaDeleteOutcome.DIGEST_MISMATCH -> MediaDeleteRun.Blocked
        }
    }
}
