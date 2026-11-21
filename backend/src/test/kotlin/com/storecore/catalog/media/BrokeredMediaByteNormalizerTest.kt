package com.storecore.catalog.media

import com.storecore.catalog.application.media.MediaNormalizationResult
import com.storecore.catalog.application.media.MediaNormalizationSource
import com.storecore.catalog.domain.media.MediaByteSize
import com.storecore.catalog.domain.media.MediaFormat
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.domain.media.MediaNormalizationRejectReason
import com.storecore.catalog.domain.media.PixelDimensions
import com.storecore.catalog.infrastructure.media.worker.BrokeredMediaByteNormalizer
import com.storecore.catalog.infrastructure.media.worker.BrokeredMediaCapabilityFactory
import com.storecore.catalog.infrastructure.media.worker.MediaBrokerArtifactProof
import com.storecore.catalog.infrastructure.media.worker.MediaBrokerClient
import com.storecore.catalog.infrastructure.media.worker.MediaBrokerExchange
import com.storecore.catalog.infrastructure.media.worker.MediaBrokerHelperCommand
import com.storecore.catalog.infrastructure.media.worker.MediaBrokerOperation
import com.storecore.catalog.infrastructure.media.worker.MediaBrokerProtocolV1
import com.storecore.catalog.infrastructure.media.worker.MediaBrokerRequest
import com.storecore.catalog.infrastructure.media.worker.MediaBrokerResponse
import com.storecore.catalog.infrastructure.media.worker.MediaBrokerResult
import com.storecore.catalog.infrastructure.media.worker.MediaWorkerCapability
import com.storecore.catalog.infrastructure.media.worker.ProcessMediaBrokerClient
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.ByteArrayInputStream
import java.io.IOException
import java.io.InputStream
import java.nio.file.Path
import java.security.MessageDigest
import java.time.Duration

class BrokeredMediaByteNormalizerTest {
    private val limits = MediaNormalizationLimits.standard()
    private val jobId = ByteArray(16) { (it + 1).toByte() }

    @Test
    fun `seal claim and ack translate wire once and never enable Ready`(@TempDir temp: Path) {
        val input = "bounded-input".toByteArray()
        val output = "normalized-output".toByteArray()
        val proof = requireNotNull(
            MediaBrokerArtifactProof.create(
                MediaBrokerArtifactProof.ROOT_UID,
                MediaBrokerArtifactProof.REGULAR_FILE_MODE,
                MediaFormat.PNG,
                requireNotNull(PixelDimensions.fromWire(640, 480)),
                output,
            ),
        )
        val client = ScriptedClient(
            seal = completed(MediaBrokerResult.SNAPSHOT_ACCEPTED),
            claim = MediaBrokerExchange.Completed(
                requireNotNull(MediaBrokerResponse.create(MediaBrokerResult.ARTIFACT_READY, jobId, 1)),
                proof.encode(),
            ),
            ack = completed(MediaBrokerResult.ACK_ACCEPTED),
        )
        val result = normalizer(client).normalize(source(input), limits) as MediaNormalizationResult.Accepted
        assertEquals(digest(input), result.originalDigest)
        assertEquals(proof.digest, result.normalizedDigest)
        assertArrayEquals(output, result.artifact.openStream().readAllBytes())
        result.artifact.close()
        assertEquals(
            listOf(MediaBrokerOperation.SEAL_INPUT, MediaBrokerOperation.CLAIM_OUTPUT, MediaBrokerOperation.ACK_OUTPUT),
            client.operations,
        )
        assertSame(MediaWorkerCapability.Unknown, BrokeredMediaCapabilityFactory().observe(null))
        assertSame(
            MediaWorkerCapability.Unavailable,
            BrokeredMediaCapabilityFactory().observe(
                MediaBrokerHelperCommand.create(temp.resolve("storecore-media-broker-client").toAbsolutePath()),
            ),
        )
    }

    @Test
    fun `unknown and mismatched broker results stay Unknown`() {
        val input = byteArrayOf(1, 2, 3)
        assertSame(
            MediaNormalizationResult.Unknown,
            normalizer(ScriptedClient(seal = MediaBrokerExchange.Unknown)).normalize(source(input), limits),
        )
        assertSame(
            MediaNormalizationResult.Unknown,
            normalizer(ScriptedClient(seal = completed(MediaBrokerResult.ARTIFACT_READY))).normalize(source(input), limits),
        )
        assertSame(
            MediaNormalizationResult.Unknown,
            normalizer(
                ScriptedClient(
                    seal = MediaBrokerExchange.Completed(
                        requireNotNull(MediaBrokerResponse.create(MediaBrokerResult.SNAPSHOT_ACCEPTED, jobId, 1)),
                        byteArrayOf(9),
                    ),
                ),
            ).normalize(source(input), limits),
        )
    }

    @Test
    fun `peer denial rejected seal and failed ack stay fail-closed`() {
        val input = byteArrayOf(1, 2, 3)
        assertSame(
            MediaNormalizationResult.Unavailable,
            normalizer(ScriptedClient(seal = MediaBrokerExchange.Unavailable)).normalize(source(input), limits),
        )
        assertSame(
            MediaNormalizationResult.Unavailable,
            normalizer(ScriptedClient(seal = completed(MediaBrokerResult.PEER_DENIED))).normalize(source(input), limits),
        )
        val rejected = normalizer(ScriptedClient(seal = completed(MediaBrokerResult.REJECTED))).normalize(source(input), limits)
        assertEquals(MediaNormalizationRejectReason.NORMALIZATION_FAILED, (rejected as MediaNormalizationResult.Rejected).reason)

        val output = byteArrayOf(9, 8, 7, 6)
        val proof = requireNotNull(
            MediaBrokerArtifactProof.create(
                MediaBrokerArtifactProof.ROOT_UID,
                MediaBrokerArtifactProof.REGULAR_FILE_MODE,
                MediaFormat.JPEG,
                requireNotNull(PixelDimensions.fromWire(640, 480)),
                output,
            ),
        )
        val client = ScriptedClient(
            seal = completed(MediaBrokerResult.SNAPSHOT_ACCEPTED),
            claim = MediaBrokerExchange.Completed(
                requireNotNull(MediaBrokerResponse.create(MediaBrokerResult.ARTIFACT_READY, jobId, 1)),
                proof.encode(),
            ),
            ack = MediaBrokerExchange.Unknown,
        )
        val adapter = normalizer(client)
        val accepted = adapter.normalize(source(input), limits) as MediaNormalizationResult.Accepted
        accepted.artifact.close()
        assertSame(MediaNormalizationResult.Unavailable, adapter.normalize(source(input), limits))
    }

    @Test
    fun `helper command rejects relative paths extra names and process start uses fixed argv`(@TempDir temp: Path) {
        assertNull(MediaBrokerHelperCommand.create(Path.of("storecore-media-broker-client")))
        assertNull(MediaBrokerHelperCommand.create(temp.resolve("other-bin").toAbsolutePath()))
        val command = requireNotNull(
            MediaBrokerHelperCommand.create(temp.resolve("storecore-media-broker-client").toAbsolutePath()),
        )
        assertEquals(listOf(command.executable.toString()), command.argv())
        var captured: List<String>? = null
        val client = ProcessMediaBrokerClient(command) { argv ->
            captured = argv
            throw IOException("helper missing")
        }
        val request = requireNotNull(
            MediaBrokerRequest.create(MediaBrokerOperation.SEAL_INPUT, jobId, 1, ByteArray(32) { 1 }, 3),
        )
        assertSame(
            MediaBrokerExchange.Unavailable,
            client.exchange(request, byteArrayOf(1, 2, 3), Duration.ofMillis(50)),
        )
        assertEquals(command.argv(), captured)
        assertEquals(MediaBrokerProtocolV1.REQUEST_LENGTH, MediaBrokerProtocolV1.encodeRequest(request).size)
    }

    @Test
    fun `oversized declared source is rejected before the helper runs`() {
        val never = MediaBrokerClient { _, _, _ -> error("helper must not run") }
        val oversized = object : MediaNormalizationSource {
            override val size = requireNotNull(MediaByteSize.fromWire(limits.maxInputBytes.value + 1))
            override fun openStream(): InputStream = error("must not open")
        }
        val result = BrokeredMediaByteNormalizer(never) { jobId }.normalize(oversized, limits) as MediaNormalizationResult.Rejected
        assertEquals(MediaNormalizationRejectReason.INPUT_LIMIT_EXCEEDED, result.reason)
    }

    private fun normalizer(client: MediaBrokerClient) = BrokeredMediaByteNormalizer(client) { jobId }

    private fun completed(result: MediaBrokerResult) = MediaBrokerExchange.Completed(
        requireNotNull(MediaBrokerResponse.create(result, jobId, 1)),
        byteArrayOf(),
    )

    private fun source(bytes: ByteArray) = object : MediaNormalizationSource {
        override val size = requireNotNull(MediaByteSize.fromWire(bytes.size.toLong()))
        override fun openStream() = ByteArrayInputStream(bytes)
    }

    private fun digest(bytes: ByteArray) = requireNotNull(
        com.storecore.catalog.domain.media.ContentDigest.fromWire(
            MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) },
        ),
    )

    private class ScriptedClient(
        private val seal: MediaBrokerExchange,
        private val claim: MediaBrokerExchange = MediaBrokerExchange.Unknown,
        private val ack: MediaBrokerExchange = MediaBrokerExchange.Unknown,
    ) : MediaBrokerClient {
        val operations = mutableListOf<MediaBrokerOperation>()

        override fun exchange(
            request: MediaBrokerRequest,
            payload: ByteArray,
            timeout: Duration,
        ): MediaBrokerExchange {
            operations += request.operation
            return when (request.operation) {
                MediaBrokerOperation.SEAL_INPUT -> seal
                MediaBrokerOperation.CLAIM_OUTPUT -> claim
                MediaBrokerOperation.ACK_OUTPUT -> ack
                MediaBrokerOperation.UNKNOWN -> MediaBrokerExchange.Unknown
            }
        }
    }
}
