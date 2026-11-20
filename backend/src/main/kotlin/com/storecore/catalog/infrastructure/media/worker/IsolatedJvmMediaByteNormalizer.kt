package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.application.media.MediaByteNormalizer
import com.storecore.catalog.application.media.MediaNormalizationResult
import com.storecore.catalog.application.media.MediaNormalizationSource
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.domain.media.MediaNormalizationProfile
import com.storecore.catalog.domain.media.MediaNormalizationRejectReason
import java.nio.file.Files
import java.nio.file.StandardOpenOption
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.UUID
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit

class IsolatedJvmMediaByteNormalizer(
    private val workspaceManager: MediaWorkerWorkspaceManager,
    private val launcher: MediaWorkerLauncher,
    private val command: MediaWorkerCommand,
    private val secureRandom: SecureRandom = SecureRandom(),
) : MediaByteNormalizer {
    override val profile = MediaNormalizationProfile.IMAGE_IO_V1
    private val admission = Semaphore(1, true)

    override fun normalize(source: MediaNormalizationSource, limits: MediaNormalizationLimits): MediaNormalizationResult {
        if (!limits.acceptsInput(source.size)) return rejected(MediaNormalizationRejectReason.INPUT_LIMIT_EXCEEDED)
        val waitMillis = limits.timeout.value.toMillis()
        val acquired = runCatching { admission.tryAcquire(waitMillis, TimeUnit.MILLISECONDS) }.getOrDefault(false)
        if (!acquired) return rejected(MediaNormalizationRejectReason.RESOURCE_LIMIT_EXCEEDED)
        var releaseAdmission = true
        try {
            val requestId = UUID.randomUUID()
            val workspace = when (val result = workspaceManager.create(requestId)) {
                is MediaWorkerWorkspaceResult.Created -> result.lease
                MediaWorkerWorkspaceResult.Unavailable -> return MediaNormalizationResult.Unavailable
                MediaWorkerWorkspaceResult.Unknown -> return MediaNormalizationResult.Unknown
            }
            val lease = workspace
            var closeLease = true
            try {
                val published = runCatching { source.openStream().use { lease.publishInput(it, limits.maxInputBytes.value) } }.getOrNull()
                    ?: return rejected(MediaNormalizationRejectReason.INPUT_LIMIT_EXCEEDED)
                if (published.size != source.size) return rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER)

                val nonce = ByteArray(32).also(secureRandom::nextBytes)
                val request = MediaWorkerRequest.create(requestId, nonce, profile, published.size, published.digest, limits)
                    ?: return MediaNormalizationResult.Unknown
                val encoded = MediaWorkerProtocolCodec.encodeRequest(request)
                val requestWritten = runCatching {
                    Files.write(lease.request, encoded, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)
                    true
                }.getOrDefault(false)
                if (!requestWritten) return MediaNormalizationResult.Unknown
                when (workspaceManager.grantWorker(lease)) {
                    MediaWorkerWorkspaceAccess.Compatible -> Unit
                    MediaWorkerWorkspaceAccess.Unavailable -> return MediaNormalizationResult.Unavailable
                    MediaWorkerWorkspaceAccess.Unknown -> return MediaNormalizationResult.Unknown
                }

                return when (val execution = launcher.execute(command, lease, limits)) {
                    is MediaWorkerExecution.Completed -> if (execution.exitCode == 0) {
                        consumeResponse(lease, request, limits)
                    } else {
                        rejected(MediaNormalizationRejectReason.NORMALIZATION_FAILED)
                    }
                    MediaWorkerExecution.TimedOut -> rejected(MediaNormalizationRejectReason.DECODE_TIMEOUT)
                    MediaWorkerExecution.TerminationUnknown -> {
                        closeLease = false
                        releaseAdmission = false
                        runCatching { lease.retainUnsafe() }
                        MediaNormalizationResult.Unavailable
                    }
                    MediaWorkerExecution.IsolationUnavailable -> MediaNormalizationResult.Unavailable
                    MediaWorkerExecution.Failed -> rejected(MediaNormalizationRejectReason.NORMALIZATION_FAILED)
                    MediaWorkerExecution.Unknown -> MediaNormalizationResult.Unknown
                }
            } finally {
                if (closeLease) lease.close()
            }
        } finally {
            if (releaseAdmission) admission.release()
        }
    }

    private fun consumeResponse(
        lease: MediaWorkerWorkspaceLease,
        request: MediaWorkerRequest,
        limits: MediaNormalizationLimits,
    ): MediaNormalizationResult {
        val bytes = lease.readResult(4_096) ?: return MediaNormalizationResult.Unknown
        val response = MediaWorkerProtocolCodec.decodeResponse(bytes)
        if (response.requestId != request.requestId || !MessageDigest.isEqual(response.nonce(), request.nonce())) {
            return MediaNormalizationResult.Unknown
        }
        return when (response) {
            is MediaWorkerResponse.Rejected -> rejected(response.reason)
            is MediaWorkerResponse.Accepted -> {
                if (!profile.permitsOutput(response.format) || !limits.acceptsOutput(response.outputSize)) return MediaNormalizationResult.Unknown
                val artifact = lease.claimArtifact(response.outputSize, response.outputDigest) ?: return MediaNormalizationResult.Unknown
                MediaNormalizationResult.Accepted.create(
                    artifact, request.inputDigest, response.outputDigest, response.format,
                    response.dimensions, profile, limits,
                ) ?: run { artifact.close(); MediaNormalizationResult.Unknown }
            }
            MediaWorkerResponse.Unknown -> MediaNormalizationResult.Unknown
        }
    }

    private fun rejected(reason: MediaNormalizationRejectReason): MediaNormalizationResult =
        MediaNormalizationResult.Rejected.create(reason) ?: MediaNormalizationResult.Unknown
}
