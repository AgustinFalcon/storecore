package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.MediaFormat
import com.storecore.catalog.domain.media.MediaByteLimit
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.domain.media.MediaNormalizationRejectReason
import com.storecore.catalog.infrastructure.media.MediaContainerPreflight
import com.storecore.catalog.infrastructure.media.MediaContainerPreflightOutcome
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import javax.imageio.ImageIO

class MediaNormalizationEngineTest {
    private val engine = MediaNormalizationEngine()

    @Test
    fun `JPEG normalization is serially and concurrently deterministic`() {
        val accepted = assertDeterministic(
            MediaWorkerTestFixtures.golden("input-jpeg.jpg"),
            MediaFormat.JPEG,
        )
        assertJpegBaseline444(accepted.bytes)
        val text = String(accepted.bytes, Charsets.ISO_8859_1)
        assertFalse(text.contains("Exif"))
        assertFalse(text.contains("ICC_PROFILE"))
        assertFalse(text.contains("http://ns.adobe.com/xap"))
    }

    @Test
    fun `PNG alpha normalization is serially and concurrently deterministic`() {
        val accepted = assertDeterministic(
            MediaWorkerTestFixtures.golden("input-alpha.png"),
            MediaFormat.PNG,
        )
        val decoded = requireNotNull(ImageIO.read(ByteArrayInputStream(accepted.bytes)))
        assertEquals(0, decoded.getRGB(0, 0), "RGB beneath fully transparent alpha must be black")
    }

    @Test
    fun `corrupt and trailing containers reject before decode`() {
        val corrupt = byteArrayOf(1, 2, 3, 4)
        assertRejected(corrupt, MediaNormalizationRejectReason.UNSUPPORTED_FORMAT)
        val trailing = MediaWorkerTestFixtures.image("png") + byteArrayOf(0)
        assertRejected(trailing, MediaNormalizationRejectReason.TRAILING_DATA)
        val animated = MediaWorkerTestFixtures.golden("input-webp.webp").copyOf().also {
            "ANIM".toByteArray().copyInto(it, 12)
        }
        assertRejected(animated, MediaNormalizationRejectReason.ANIMATED_MEDIA)
    }

    @Test
    fun `CMYK-shaped JPEG is rejected as unsupported color profile`() {
        val jpeg = MediaWorkerTestFixtures.image("jpeg").copyOf()
        val sof = (0 until jpeg.size - 10).first { jpeg[it] == 0xff.toByte() && jpeg[it + 1] in byteArrayOf(0xc0.toByte(), 0xc1.toByte(), 0xc2.toByte()) }
        jpeg[sof + 9] = 4
        val result = engine.normalize(MediaWorkerTestFixtures.request(jpeg), jpeg) as MediaEngineResult.Rejected
        assertTrue(
            result.reason in setOf(
                MediaNormalizationRejectReason.UNSUPPORTED_COLOR_PROFILE,
                MediaNormalizationRejectReason.CORRUPT_CONTAINER,
            ),
        )

    }

    @Test
    fun `legal WebP normalization is serially and concurrently deterministic`() {
        val webp = MediaWorkerTestFixtures.golden("input-webp.webp")
        assertTrue(MediaContainerPreflight.inspect(webp, MediaNormalizationLimits.standard()) is MediaContainerPreflightOutcome.Accepted)
        assertDeterministic(webp, MediaFormat.JPEG)
    }

    @Test
    fun `dimensions and output limits reject`() {
        assertRejected(MediaWorkerTestFixtures.image("png", width = 319), MediaNormalizationRejectReason.INVALID_DIMENSIONS)
        val input = MediaWorkerTestFixtures.image("jpeg")
        val standard = MediaNormalizationLimits.standard()
        val limits = requireNotNull(MediaNormalizationLimits.create(
            standard.maxInputBytes, MediaByteLimit.fromWire(1L), standard.minSide, standard.maxSide,
            standard.maxPixels, standard.workerHeapBytes, standard.workspaceBytes, standard.timeout,
            standard.maxConcurrency, standard.maxDiagnosticBytes, standard.maxContainerSegments,
            standard.maxMetadataBytes,
        ))
        val result = engine.normalize(MediaWorkerTestFixtures.request(input, limits), input) as MediaEngineResult.Rejected
        assertEquals(MediaNormalizationRejectReason.OUTPUT_LIMIT_EXCEEDED, result.reason)
    }

    private fun assertDeterministic(
        input: ByteArray,
        expectedFormat: MediaFormat,
    ): MediaEngineResult.Accepted {
        val request = MediaWorkerTestFixtures.request(input)
        val first = engine.normalize(request, input) as? MediaEngineResult.Accepted
            ?: fail("first normalization was not accepted")
        val second = engine.normalize(request, input) as? MediaEngineResult.Accepted
            ?: fail("second normalization was not accepted")
        assertEquals(expectedFormat, first.format)
        assertEquals(sha256(first.bytes), sha256(second.bytes))
        assertArrayEquals(first.bytes, second.bytes)

        val pool = Executors.newFixedThreadPool(2)
        try {
            val futures = pool.invokeAll(List(2) { Callable { engine.normalize(request, input) } })
            futures.forEach { future ->
                val concurrent = future.get() as? MediaEngineResult.Accepted ?: fail("concurrent normalization rejected")
                assertEquals(sha256(first.bytes), sha256(concurrent.bytes))
            }
        } finally {
            pool.shutdownNow()
        }
        return first
    }

    private fun assertRejected(input: ByteArray, expected: MediaNormalizationRejectReason) {
        val result = engine.normalize(MediaWorkerTestFixtures.request(input), input)
        assertTrue(result is MediaEngineResult.Rejected)
        assertEquals(expected, (result as MediaEngineResult.Rejected).reason)
    }

    private fun assertJpegBaseline444(bytes: ByteArray) {
        var offset = 2
        while (offset + 4 < bytes.size) {
            while (offset < bytes.size && bytes[offset].toInt() and 0xff == 0xff) offset++
            val marker = bytes[offset++].toInt() and 0xff
            if (marker == 0xc0) {
                val components = bytes[offset + 7].toInt() and 0xff
                assertEquals(3, components)
                repeat(components) { component ->
                    val sampling = bytes[offset + 9 + component * 3].toInt() and 0xff
                    assertEquals(0x11, sampling, "JPEG must use 4:4:4 sampling")
                }
                return
            }
            assertNotEquals(0xc2, marker, "JPEG must not be progressive")
            if (marker in 0xd0..0xd9 || marker == 0x01) continue
            val length = ((bytes[offset].toInt() and 0xff) shl 8) or (bytes[offset + 1].toInt() and 0xff)
            offset += length
        }
        fail<Unit>("baseline SOF marker not found")
    }
}
