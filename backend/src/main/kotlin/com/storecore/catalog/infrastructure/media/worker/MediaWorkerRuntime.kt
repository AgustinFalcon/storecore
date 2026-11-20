package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.application.media.MediaNormalizationArtifact
import com.storecore.catalog.domain.media.ContentDigest
import com.storecore.catalog.domain.media.MediaByteSize
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardOpenOption
import java.time.Duration
import java.time.Instant
import java.util.UUID

interface MediaWorkerWorkspaceManager {
    fun create(requestId: UUID): MediaWorkerWorkspaceResult
    fun sweep(now: Instant, staleAfter: Duration): MediaWorkerSweepResult
    fun accessFor(principal: MediaWorkerPrincipal): MediaWorkerWorkspaceAccess = MediaWorkerWorkspaceAccess.Unknown
    fun grantWorker(lease: MediaWorkerWorkspaceLease): MediaWorkerWorkspaceAccess = MediaWorkerWorkspaceAccess.Unknown
}

enum class MediaWorkerPrincipal {
    DEDICATED_WORKER,
    UNKNOWN;

    companion object {
        fun fromWire(raw: String?): MediaWorkerPrincipal =
            entries.firstOrNull { it.name == raw && it != UNKNOWN } ?: UNKNOWN
    }
}

sealed interface MediaWorkerWorkspaceAccess {
    data object Compatible : MediaWorkerWorkspaceAccess
    data object Unavailable : MediaWorkerWorkspaceAccess
    data object Unknown : MediaWorkerWorkspaceAccess
}

sealed interface MediaWorkerWorkspaceRetention {
    data object Retained : MediaWorkerWorkspaceRetention
    data object Unavailable : MediaWorkerWorkspaceRetention
    data object Unknown : MediaWorkerWorkspaceRetention
}

sealed interface MediaWorkerWorkspaceResult {
    data class Created(val lease: MediaWorkerWorkspaceLease) : MediaWorkerWorkspaceResult
    data object Unavailable : MediaWorkerWorkspaceResult
    data object Unknown : MediaWorkerWorkspaceResult
}

sealed interface MediaWorkerSweepResult {
    data class Completed(val removed: Int) : MediaWorkerSweepResult
    class Unsafe private constructor(val reason: MediaWorkerWorkspaceUnsafeReason) : MediaWorkerSweepResult {
        companion object {
            fun create(reason: MediaWorkerWorkspaceUnsafeReason): Unsafe? =
                reason.takeIf { it != MediaWorkerWorkspaceUnsafeReason.UNKNOWN }?.let(::Unsafe)
        }
    }
    data object Unknown : MediaWorkerSweepResult
}

enum class MediaWorkerWorkspaceUnsafeReason {
    SYMLINK, OWNER_MISMATCH, UNEXPECTED_ENTRY, OUTSIDE_ROOT, UNKNOWN;
    companion object { fun fromWire(raw: String?): MediaWorkerWorkspaceUnsafeReason = entries.firstOrNull { it.name == raw && it != UNKNOWN } ?: UNKNOWN }
}

interface MediaWorkerWorkspaceLease : AutoCloseable {
    val directory: Path
    val input: Path
    val request: Path
    val result: Path
    val output: Path
    val diagnostic: Path
    fun publishInput(source: InputStream, maxBytes: Long): MediaPublishedInput?
    fun writeRequest(bytes: ByteArray): Boolean = runCatching {
        Files.write(request, bytes, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)
        true
    }.getOrDefault(false)
    fun readResult(maxBytes: Long): ByteArray?
    fun claimArtifact(expectedSize: MediaByteSize, digest: ContentDigest): MediaNormalizationArtifact?
    fun retainUnsafe(): MediaWorkerWorkspaceRetention = MediaWorkerWorkspaceRetention.Unknown
    override fun close()
}

class ApprovedMediaWorkerRuntime private constructor(
    val javaVendor: String,
    val javaRuntimeVersion: String,
    val operatingSystem: MediaWorkerOperatingSystem,
    val architecture: MediaWorkerArchitecture,
) {
    companion object {
        fun create(
            javaVendor: String?,
            javaRuntimeVersion: String?,
            operatingSystem: MediaWorkerOperatingSystem,
            architecture: MediaWorkerArchitecture,
        ): ApprovedMediaWorkerRuntime? {
            if (javaVendor.isNullOrBlank() || javaRuntimeVersion.isNullOrBlank()) return null
            if (operatingSystem != MediaWorkerOperatingSystem.LINUX) return null
            if (architecture !in setOf(MediaWorkerArchitecture.AMD64, MediaWorkerArchitecture.ARM64)) return null
            return ApprovedMediaWorkerRuntime(javaVendor, javaRuntimeVersion, operatingSystem, architecture)
        }
    }
}

data class MediaPublishedInput(val size: MediaByteSize, val digest: ContentDigest)

class MediaWorkerCommand private constructor(val javaExecutable: Path, val applicationJar: Path) {
    companion object {
        const val WORKER_MAIN = "com.storecore.catalog.infrastructure.media.worker.MediaNormalizerWorkerMainKt"
        fun create(javaExecutable: Path?, applicationJar: Path?): MediaWorkerCommand? =
            if (javaExecutable?.isAbsolute == true && applicationJar?.isAbsolute == true)
                MediaWorkerCommand(javaExecutable.normalize(), applicationJar.normalize()) else null
    }
}

fun interface MediaWorkerLauncher {
    fun execute(
        command: MediaWorkerCommand,
        workspace: MediaWorkerWorkspaceLease,
        limits: MediaNormalizationLimits,
    ): MediaWorkerExecution
}

sealed interface MediaWorkerExecution {
    data class Completed(val exitCode: Int, val stdout: ByteArray, val stderr: ByteArray) : MediaWorkerExecution {
        init { require(exitCode in 0..255); require(stdout.size <= 65_536); require(stderr.size <= 65_536) }
    }
    data object TimedOut : MediaWorkerExecution
    /** The manager could not prove the entire service stopped; callers must retain the workspace. */
    data object TerminationUnknown : MediaWorkerExecution
    data object IsolationUnavailable : MediaWorkerExecution
    data object Failed : MediaWorkerExecution
    data object Unknown : MediaWorkerExecution
}
