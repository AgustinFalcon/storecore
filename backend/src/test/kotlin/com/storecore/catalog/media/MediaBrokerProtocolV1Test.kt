package com.storecore.catalog.media

import com.storecore.catalog.infrastructure.media.worker.MediaBrokerOperation
import com.storecore.catalog.infrastructure.media.worker.MediaBrokerProtocolV1
import com.storecore.catalog.infrastructure.media.worker.MediaBrokerRequest
import com.storecore.catalog.infrastructure.media.worker.MediaBrokerResponse
import com.storecore.catalog.infrastructure.media.worker.MediaBrokerResult
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import java.util.Properties

class MediaBrokerProtocolV1Test {
    private val vectors = Properties().apply {
        Files.newInputStream(Path.of("media-broker/vectors/v1.properties")).use(::load)
    }

    @Test
    fun `request codec matches Rust golden vector and protects mutable input`() {
        val jobId = hex("00112233445566778899aabbccddeeff")
        val digest = ByteArray(32) { it.toByte() }
        val request = requireNotNull(MediaBrokerRequest.create(MediaBrokerOperation.SEAL_INPUT, jobId, 7, digest, 5))
        jobId.fill(99)
        digest.fill(99)

        val encoded = MediaBrokerProtocolV1.encodeRequest(request)
        assertArrayEquals(hex(vectors.getProperty("request")), encoded)
        val decoded = requireNotNull(MediaBrokerProtocolV1.decodeRequest(encoded))
        assertArrayEquals(hex("00112233445566778899aabbccddeeff"), decoded.jobId())
        assertArrayEquals(ByteArray(32) { it.toByte() }, decoded.digest())
        assertEquals(5, decoded.size)
    }

    @Test
    fun `response codec matches Rust golden vector`() {
        val response = requireNotNull(
            MediaBrokerResponse.create(
                MediaBrokerResult.SNAPSHOT_ACCEPTED,
                hex("00112233445566778899aabbccddeeff"),
                7,
            ),
        )
        val encoded = MediaBrokerProtocolV1.encodeResponse(response)

        assertArrayEquals(hex(vectors.getProperty("response")), encoded)
        assertEquals(MediaBrokerResult.SNAPSHOT_ACCEPTED, requireNotNull(MediaBrokerProtocolV1.decodeResponse(encoded)).result)
    }

    @Test
    fun `wire translators expose Unknown and decoders reject it at the boundary`() {
        assertSame(MediaBrokerOperation.UNKNOWN, MediaBrokerOperation.fromWire(99))
        assertSame(MediaBrokerResult.UNKNOWN, MediaBrokerResult.fromWire(99))
        assertNull(MediaBrokerRequest.create(MediaBrokerOperation.UNKNOWN, ByteArray(16), 1, ByteArray(32), 1))

        val unknownOperation = hex(vectors.getProperty("request")).also { it[6] = 99 }
        val unknownResult = hex(vectors.getProperty("response")).also { it[6] = 99 }
        assertNull(MediaBrokerProtocolV1.decodeRequest(unknownOperation))
        assertNull(MediaBrokerProtocolV1.decodeResponse(unknownResult))
        assertNull(MediaBrokerProtocolV1.decodeRequest(unknownOperation.copyOf(unknownOperation.size - 1)))
    }

    private fun hex(raw: String): ByteArray {
        require(raw.length % 2 == 0)
        return raw.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }
}

