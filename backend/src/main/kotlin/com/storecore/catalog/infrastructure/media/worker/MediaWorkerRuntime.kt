package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.application.media.MediaNormalizationArtifact
import com.storecore.catalog.domain.media.ContentDigest
import com.storecore.catalog.domain.media.MediaByteSize
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import java.io.InputStream
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.util.UUID

interface MediaWorkerWorkspaceManager {
    fun create(requestId: UUID): MediaWorkerWorkspaceResult
    fun sweep(now: Instant, staleAfter: Duration): MediaWorkerSweepResult
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
    fun readResult(maxBytes: Long): ByteArray?
    fun claimArtifact(expectedSize: MediaByteSize, digest: ContentDigest): MediaNormalizationArtifact?
    override fun close()
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
    data object IsolationUnavailable : MediaWorkerExecution
    data object Failed : MediaWorkerExecution
    data object Unknown : MediaWorkerExecution
}
