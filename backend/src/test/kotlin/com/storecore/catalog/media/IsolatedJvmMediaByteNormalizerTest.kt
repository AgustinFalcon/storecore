package com.storecore.catalog.media

import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.media.*
import com.storecore.catalog.infrastructure.media.worker.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.util.UUID

class IsolatedJvmMediaByteNormalizerTest {
    @TempDir lateinit var temp: Path
    private val limits = MediaNormalizationLimits.standard()

    @Test
    fun `accepted response is bound to request nonce digest profile and limits`() {
        val input = "bounded-input".toByteArray(); val output = "normalized-output".toByteArray()
        val workspace = FakeWorkspace(temp, output)
        val launcher = MediaWorkerLauncher { _, lease, _ ->
            val request = requireNotNull(MediaWorkerProtocolCodec.decodeRequest(Files.readAllBytes(lease.request)))
            val response = requireNotNull(MediaWorkerResponse.Accepted.create(
                request.requestId, request.nonce(), MediaFormat.PNG, requireNotNull(PixelDimensions.fromWire(640, 480)),
                byteSize(output), digest(output),
            ))
            Files.write(lease.result, MediaWorkerProtocolCodec.encodeResponse(response))
            MediaWorkerExecution.Completed(0, byteArrayOf(), byteArrayOf())
        }
        val result = normalizer(workspace, launcher).normalize(source(input), limits) as MediaNormalizationResult.Accepted
        assertEquals(digest(input), result.originalDigest)
        assertEquals(digest(output), result.normalizedDigest)
        assertArrayEquals(output, result.artifact.openStream().readAllBytes())
        result.artifact.close()
        assertTrue(workspace.closed)
    }

    @Test
    fun `mismatched identity and unknown launcher outcome fail closed`() {
        val input = "bounded-input".toByteArray(); val output = "normalized-output".toByteArray()
        val mismatch = MediaWorkerLauncher { _, lease, _ ->
            val request = requireNotNull(MediaWorkerProtocolCodec.decodeRequest(Files.readAllBytes(lease.request)))
            val response = requireNotNull(MediaWorkerResponse.Accepted.create(
                UUID.randomUUID(), request.nonce(), MediaFormat.PNG, requireNotNull(PixelDimensions.fromWire(640, 480)), byteSize(output), digest(output),
            ))
            Files.write(lease.result, MediaWorkerProtocolCodec.encodeResponse(response)); MediaWorkerExecution.Completed(0, byteArrayOf(), byteArrayOf())
        }
        assertSame(MediaNormalizationResult.Unknown, normalizer(FakeWorkspace(temp.resolve("a"), output), mismatch).normalize(source(input), limits))
        assertSame(MediaNormalizationResult.Unknown, normalizer(FakeWorkspace(temp.resolve("b"), output), MediaWorkerLauncher { _, _, _ -> MediaWorkerExecution.Unknown }).normalize(source(input), limits))
    }

    @Test
    fun `timeout isolation and worker failure map to closed results`() {
        val input = byteArrayOf(1, 2, 3)
        assertEquals(MediaNormalizationRejectReason.DECODE_TIMEOUT, rejectedReason(input, MediaWorkerExecution.TimedOut, "timeout"))
        assertEquals(MediaNormalizationRejectReason.NORMALIZATION_FAILED, rejectedReason(input, MediaWorkerExecution.Failed, "failed"))
        assertEquals(MediaNormalizationRejectReason.NORMALIZATION_FAILED, rejectedReason(input, MediaWorkerExecution.Completed(7, byteArrayOf(), byteArrayOf()), "exit"))
        assertSame(MediaNormalizationResult.Unavailable, normalizer(FakeWorkspace(temp.resolve("isolated"), byteArrayOf(1)), MediaWorkerLauncher { _, _, _ -> MediaWorkerExecution.IsolationUnavailable }).normalize(source(input), limits))
    }

    @Test
    fun `declared size mismatch and oversized source are rejected before acceptance`() {
        val workspace = FakeWorkspace(temp.resolve("size"), byteArrayOf(1))
        val never = MediaWorkerLauncher { _, _, _ -> fail("launcher must not run") }
        val dishonest = object : MediaNormalizationSource {
            override val size = requireNotNull(MediaByteSize.fromWire(1))
            override fun openStream(): InputStream = ByteArrayInputStream(byteArrayOf(1, 2))
        }
        assertEquals(MediaNormalizationRejectReason.CORRUPT_CONTAINER, (normalizer(workspace, never).normalize(dishonest, limits) as MediaNormalizationResult.Rejected).reason)
        val oversized = object : MediaNormalizationSource {
            override val size = requireNotNull(MediaByteSize.fromWire(limits.maxInputBytes.value + 1))
            override fun openStream(): InputStream = error("must not open")
        }
        assertEquals(MediaNormalizationRejectReason.INPUT_LIMIT_EXCEEDED, (normalizer(FakeWorkspace(temp.resolve("large"), byteArrayOf()), never).normalize(oversized, limits) as MediaNormalizationResult.Rejected).reason)
    }

    private fun rejectedReason(input: ByteArray, execution: MediaWorkerExecution, suffix: String): MediaNormalizationRejectReason {
        val result = normalizer(FakeWorkspace(temp.resolve(suffix), byteArrayOf(1)), MediaWorkerLauncher { _, _, _ -> execution }).normalize(source(input), limits)
        return (result as MediaNormalizationResult.Rejected).reason
    }
    private fun normalizer(workspace: FakeWorkspace, launcher: MediaWorkerLauncher) = IsolatedJvmMediaByteNormalizer(
        MediaWorkerWorkspaceManager { workspace }, launcher,
        requireNotNull(
            MediaWorkerCommand.create(
                temp.resolve("runtime/bin/java").toAbsolutePath(),
                temp.resolve("runtime/storecore.jar").toAbsolutePath(),
            ),
        ),
    )
    private fun source(bytes: ByteArray) = object : MediaNormalizationSource {
        override val size = byteSize(bytes); override fun openStream() = ByteArrayInputStream(bytes)
    }

    private class FakeWorkspace(private val root: Path, private val outputBytes: ByteArray) : MediaWorkerWorkspaceLease {
        override val directory: Path = root
        override val input: Path = root.resolve("input.bin")
        override val request: Path = root.resolve("request.bin")
        override val result: Path = root.resolve("result.bin")
        override val output: Path = root.resolve("output.bin")
        override val diagnostic: Path = root.resolve("diagnostic.bin")
        var closed = false
        init { Files.createDirectories(root) }
        override fun publishInput(source: InputStream, maxBytes: Long): MediaPublishedInput? {
            val bytes = source.readNBytes((maxBytes + 1).toInt()); if (bytes.size.toLong() > maxBytes) return null
            Files.write(input, bytes); Files.write(output, outputBytes)
            return MediaPublishedInput(byteSize(bytes), digest(bytes))
        }
        override fun readResult(maxBytes: Long): ByteArray? =
            Files.readAllBytes(result).takeIf { it.size.toLong() <= maxBytes }
        override fun claimArtifact(expectedSize: MediaByteSize, digest: ContentDigest): MediaNormalizationArtifact? {
            if (expectedSize != byteSize(outputBytes) || digest != digest(outputBytes)) return null
            val copy = outputBytes.copyOf()
            return object : MediaNormalizationArtifact {
                override val size = byteSize(copy); override fun openStream() = ByteArrayInputStream(copy); override fun close() = Unit
            }
        }
        override fun close() { closed = true }
    }

    private companion object {
        fun digest(bytes: ByteArray) = requireNotNull(ContentDigest.fromWire(MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }))
        fun byteSize(bytes: ByteArray) = requireNotNull(MediaByteSize.fromWire(bytes.size.toLong()))
    }
}

private fun interface TestWorkspaceFactory { fun create(): MediaWorkerWorkspaceLease }
private fun MediaWorkerWorkspaceManager(factory: TestWorkspaceFactory): MediaWorkerWorkspaceManager = object : MediaWorkerWorkspaceManager {
    override fun create(requestId: UUID) = MediaWorkerWorkspaceResult.Created(factory.create())
    override fun sweep(now: java.time.Instant, staleAfter: java.time.Duration) = MediaWorkerSweepResult.Completed(0)
}
