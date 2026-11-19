package com.storecore.catalog.media

import com.storecore.catalog.domain.media.*
import com.storecore.catalog.infrastructure.media.worker.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.util.UUID

class MediaWorkerProtocolTest {
    private val digest = requireNotNull(ContentDigest.fromWire("ab".repeat(32)))
    private val size = requireNotNull(MediaByteSize.fromWire(1234))
    private val dimensions = requireNotNull(PixelDimensions.fromWire(640, 480))

    @Test
    fun `request round trip preserves identity limits and immutable nonce`() {
        val nonce = ByteArray(32) { it.toByte() }
        val id = UUID.randomUUID()
        val request = requireNotNull(MediaWorkerRequest.create(id, nonce, MediaNormalizationProfile.IMAGE_IO_V1, size, digest, MediaNormalizationLimits.standard()))
        nonce.fill(99)

        val decoded = requireNotNull(MediaWorkerProtocolCodec.decodeRequest(MediaWorkerProtocolCodec.encodeRequest(request)))
        assertEquals(id, decoded.requestId)
        assertArrayEquals(ByteArray(32) { it.toByte() }, decoded.nonce())
        assertEquals(size, decoded.inputSize)
        assertEquals(digest, decoded.inputDigest)
        assertEquals(1_024, decoded.limits.maxContainerSegments.value)
    }

    @Test
    fun `codec rejects unknown reserved truncated trailing and inconsistent length`() {
        val request = requireNotNull(MediaWorkerRequest.create(UUID.randomUUID(), ByteArray(32), MediaNormalizationProfile.IMAGE_IO_V1, size, digest, MediaNormalizationLimits.standard()))
        val valid = MediaWorkerProtocolCodec.encodeRequest(request)
        assertNull(MediaWorkerProtocolCodec.decodeRequest(valid.copyOf(valid.size - 1)))
        assertNull(MediaWorkerProtocolCodec.decodeRequest(valid + 0))
        assertNull(MediaWorkerProtocolCodec.decodeRequest(valid.copyOf().also { it[5] = 1 }))
        assertNull(MediaWorkerProtocolCodec.decodeRequest(valid.copyOf().also { it[12] = 99 }))
        assertSame(MediaWorkerResponse.Unknown, MediaWorkerProtocolCodec.decodeResponse(valid))
    }

    @Test
    fun `accepted and rejected responses round trip and unknown never crosses boundary`() {
        val id = UUID.randomUUID(); val nonce = ByteArray(32) { 7 }
        val accepted = requireNotNull(MediaWorkerResponse.Accepted.create(id, nonce, MediaFormat.PNG, dimensions, size, digest))
        val decoded = MediaWorkerProtocolCodec.decodeResponse(MediaWorkerProtocolCodec.encodeResponse(accepted)) as MediaWorkerResponse.Accepted
        assertEquals(MediaFormat.PNG, decoded.format)
        assertEquals(dimensions, decoded.dimensions)

        val rejected = requireNotNull(MediaWorkerResponse.Rejected.create(id, nonce, MediaNormalizationRejectReason.TRAILING_DATA))
        assertEquals(MediaNormalizationRejectReason.TRAILING_DATA, (MediaWorkerProtocolCodec.decodeResponse(MediaWorkerProtocolCodec.encodeResponse(rejected)) as MediaWorkerResponse.Rejected).reason)
        assertNull(MediaWorkerResponse.Rejected.create(id, nonce, MediaNormalizationRejectReason.UNKNOWN))
        assertThrows(IllegalArgumentException::class.java) { MediaWorkerProtocolCodec.encodeResponse(MediaWorkerResponse.Unknown) }
    }

    @Test
    fun `closed protocol translators fail unknown and response classes expose no copy`() {
        assertEquals(MediaWorkerProtocolVersion.UNKNOWN, MediaWorkerProtocolVersion.fromWire(99))
        assertEquals(MediaWorkerOperation.UNKNOWN, MediaWorkerOperation.fromWire(99))
        assertEquals(MediaWorkerFrameKind.UNKNOWN, MediaWorkerFrameKind.fromWire(99))
        assertEquals(MediaWorkerStatus.UNKNOWN, MediaWorkerStatus.fromWire(99))
        assertEquals(MediaWorkerRejectCode.UNKNOWN, MediaWorkerRejectCode.fromWire(99))
        assertFalse(listOf(MediaWorkerResponse.Accepted::class.java, MediaWorkerResponse.Rejected::class.java).flatMap { it.declaredMethods.toList() }.any { it.name == "copy" })
    }
}
