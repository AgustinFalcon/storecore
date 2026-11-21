package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.application.media.MediaByteNormalizer
import com.storecore.catalog.application.media.MediaNormalizationArtifact
import com.storecore.catalog.application.media.MediaNormalizationResult
import com.storecore.catalog.application.media.MediaNormalizationSource
import com.storecore.catalog.domain.media.ContentDigest
import com.storecore.catalog.domain.media.MediaByteSize
import com.storecore.catalog.domain.media.MediaDimensionDecision
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.domain.media.MediaNormalizationProfile
import com.storecore.catalog.domain.media.MediaNormalizationRejectReason
import java.io.ByteArrayInputStream
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

class BrokeredMediaByteNormalizer(
    private val client: MediaBrokerClient,
    private val jobIds: () -> ByteArray = ::randomJobId,
) : MediaByteNormalizer {
    override val profile = MediaNormalizationProfile.IMAGE_IO_V1
    private val admission = Semaphore(1, true)
    private val ackFailed = AtomicBoolean(false)

    override fun normalize(source: MediaNormalizationSource, limits: MediaNormalizationLimits): MediaNormalizationResult {
        if (ackFailed.get()) return MediaNormalizationResult.Unavailable
        if (!limits.acceptsInput(source.size)) return rejected(MediaNormalizationRejectReason.INPUT_LIMIT_EXCEEDED)
        val waitMillis = limits.timeout.value.toMillis()
        val acquired = runCatching { admission.tryAcquire(waitMillis, TimeUnit.MILLISECONDS) }.getOrDefault(false)
        if (!acquired) return rejected(MediaNormalizationRejectReason.RESOURCE_LIMIT_EXCEEDED)
        try {
            if (ackFailed.get()) return MediaNormalizationResult.Unavailable
            val payload = runCatching {
                source.openStream().use { it.readNBytes((limits.maxInputBytes.value + 1).toInt()) }
            }.getOrNull() ?: return MediaNormalizationResult.Unknown
            if (payload.size.toLong() != source.size.value) return rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER)
            val digest = sha256(payload) ?: return MediaNormalizationResult.Unknown
            val jobId = jobIds().copyOf()
            val seal = MediaBrokerRequest.create(
                MediaBrokerOperation.SEAL_INPUT,
                jobId,
                1,
                digest,
                payload.size.toLong(),
            ) ?: return MediaNormalizationResult.Unknown
            return when (val exchange = client.exchange(seal, payload, limits.timeout.value)) {
                is MediaBrokerExchange.Completed -> when (exchange.response.result) {
                    MediaBrokerResult.SNAPSHOT_ACCEPTED ->
                        if (!identityMatches(exchange.response, seal) || exchange.payload().isNotEmpty()) {
                            MediaNormalizationResult.Unknown
                        } else {
                            claim(seal, digest, limits)
                        }
                    MediaBrokerResult.REJECTED -> rejected(MediaNormalizationRejectReason.NORMALIZATION_FAILED)
                    MediaBrokerResult.PEER_DENIED -> MediaNormalizationResult.Unavailable
                    MediaBrokerResult.STALE_REVISION,
                    MediaBrokerResult.ACK_ACCEPTED,
                    MediaBrokerResult.ARTIFACT_READY,
                    MediaBrokerResult.UNKNOWN,
                    -> MediaNormalizationResult.Unknown
                }
                MediaBrokerExchange.Unavailable -> MediaNormalizationResult.Unavailable
                MediaBrokerExchange.Unknown -> MediaNormalizationResult.Unknown
            }
        } finally {
            admission.release()
        }
    }

    private fun claim(
        seal: MediaBrokerRequest,
        inputDigest: ByteArray,
        limits: MediaNormalizationLimits,
    ): MediaNormalizationResult {
        val claim = MediaBrokerRequest.create(
            MediaBrokerOperation.CLAIM_OUTPUT,
            seal.jobId(),
            seal.revision,
            inputDigest,
            seal.size,
        ) ?: return MediaNormalizationResult.Unknown
        return when (val exchange = client.exchange(claim, ByteArray(0), limits.timeout.value)) {
            is MediaBrokerExchange.Completed -> when (exchange.response.result) {
                MediaBrokerResult.ARTIFACT_READY -> {
                    if (!identityMatches(exchange.response, claim)) return MediaNormalizationResult.Unknown
                    val proof = MediaBrokerArtifactProof.decode(exchange.payload()) ?: return MediaNormalizationResult.Unknown
                    if (!profile.permitsOutput(proof.format) || !limits.acceptsOutput(proof.size)) {
                        return MediaNormalizationResult.Unknown
                    }
                    if (limits.inspectDimensions(proof.dimensions.width, proof.dimensions.height) !is MediaDimensionDecision.Accepted) {
                        return MediaNormalizationResult.Unknown
                    }
                    val original = ContentDigest.fromWire(inputDigest.joinToString("") { "%02x".format(it) })
                        ?: return MediaNormalizationResult.Unknown
                    val ack = ackRequest(claim, proof) ?: return MediaNormalizationResult.Unknown
                    val artifact = BrokeredArtifact(proof, ack, limits)
                    MediaNormalizationResult.Accepted.create(
                        artifact,
                        original,
                        proof.digest,
                        proof.format,
                        proof.dimensions,
                        profile,
                        limits,
                    ) ?: MediaNormalizationResult.Unknown
                }
                MediaBrokerResult.REJECTED -> rejected(MediaNormalizationRejectReason.NORMALIZATION_FAILED)
                MediaBrokerResult.PEER_DENIED -> MediaNormalizationResult.Unavailable
                MediaBrokerResult.SNAPSHOT_ACCEPTED,
                MediaBrokerResult.STALE_REVISION,
                MediaBrokerResult.ACK_ACCEPTED,
                MediaBrokerResult.UNKNOWN,
                -> MediaNormalizationResult.Unknown
            }
            MediaBrokerExchange.Unavailable -> MediaNormalizationResult.Unavailable
            MediaBrokerExchange.Unknown -> MediaNormalizationResult.Unknown
        }
    }

    private inner class BrokeredArtifact(
        private val proof: MediaBrokerArtifactProof,
        private val ack: MediaBrokerRequest,
        private val limits: MediaNormalizationLimits,
    ) : MediaNormalizationArtifact {
        override val size: MediaByteSize = proof.size
        private val closed = AtomicBoolean(false)

        override fun openStream() = ByteArrayInputStream(proof.bytes())

        override fun close() {
            if (!closed.compareAndSet(false, true)) return
            val acknowledged = when (val exchange = client.exchange(ack, ByteArray(0), limits.timeout.value)) {
                is MediaBrokerExchange.Completed ->
                    exchange.response.result == MediaBrokerResult.ACK_ACCEPTED &&
                        identityMatches(exchange.response, ack) &&
                        exchange.payload().isEmpty()
                MediaBrokerExchange.Unavailable, MediaBrokerExchange.Unknown -> false
            }
            if (!acknowledged) ackFailed.set(true)
        }
    }

    private fun ackRequest(claim: MediaBrokerRequest, proof: MediaBrokerArtifactProof): MediaBrokerRequest? =
        MediaBrokerRequest.create(
            MediaBrokerOperation.ACK_OUTPUT,
            claim.jobId(),
            claim.revision,
            digestBytes(proof.digest),
            proof.size.value,
        )

    private fun identityMatches(response: MediaBrokerResponse, request: MediaBrokerRequest): Boolean =
        response.jobId().contentEquals(request.jobId()) && response.revision == request.revision

    private fun rejected(reason: MediaNormalizationRejectReason): MediaNormalizationResult =
        MediaNormalizationResult.Rejected.create(reason) ?: MediaNormalizationResult.Unknown

    private companion object {
        fun randomJobId(): ByteArray {
            val id = UUID.randomUUID()
            return ByteBuffer.allocate(16).putLong(id.mostSignificantBits).putLong(id.leastSignificantBits).array()
        }

        fun sha256(bytes: ByteArray): ByteArray? = runCatching {
            MessageDigest.getInstance("SHA-256").digest(bytes)
        }.getOrNull()

        fun digestBytes(digest: ContentDigest): ByteArray =
            ByteArray(digest.value.length / 2) { digest.value.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
    }
}
