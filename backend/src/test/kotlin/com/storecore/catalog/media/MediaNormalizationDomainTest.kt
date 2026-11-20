package com.storecore.catalog.media

import com.storecore.catalog.application.media.MediaNormalizationArtifact
import com.storecore.catalog.application.media.MediaNormalizationResult
import com.storecore.catalog.application.media.UnconfiguredMediaByteNormalizer
import com.storecore.catalog.domain.media.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream

class MediaNormalizationDomainTest {
    @Test
    fun `normalization finite types translate once and fail closed`() {
        assertEquals(MediaNormalizationProfile.IMAGE_IO_V1, MediaNormalizationProfile.fromWire("IMAGE_IO_V1"))
        assertEquals(
            MediaNormalizationRejectReason.TRAILING_DATA,
            MediaNormalizationRejectReason.fromWire("TRAILING_DATA"),
        )
        listOf(null, "", "image_io_v1", " IMAGE_IO_V1", "FUTURE").forEach {
            assertEquals(MediaNormalizationProfile.UNKNOWN, MediaNormalizationProfile.fromWire(it))
            assertEquals(MediaNormalizationRejectReason.UNKNOWN, MediaNormalizationRejectReason.fromWire(it))
        }
    }

    @Test
    fun `standard limits are typed and dimension decisions preserve distinct rejection causes`() {
        val limits = MediaNormalizationLimits.standard()
        assertEquals(10L * 1024 * 1024, limits.maxInputBytes.value)
        assertEquals(20L * 1024 * 1024, limits.maxOutputBytes.value)
        assertEquals(1_024, limits.maxContainerSegments.value)
        assertEquals(1L * 1024 * 1024, limits.maxMetadataBytes.value)
        val processMemory = requireNotNull(limits.processMemoryBytes())
        assertEquals(
            limits.workerHeapBytes.value + limits.maxOutputBytes.value + MediaNormalizationLimits.WORKER_NATIVE_RESERVE_BYTES,
            processMemory.value,
        )
        assertTrue(processMemory.value > limits.workerHeapBytes.value)

        assertEquals(MediaDimensionDecision.Unknown, limits.inspectDimensions("320", 320))
        assertEquals(
            MediaNormalizationRejectReason.INVALID_DIMENSIONS,
            (limits.inspectDimensions(319, 320) as MediaDimensionDecision.Rejected).reason,
        )
        assertEquals(
            MediaNormalizationRejectReason.INVALID_DIMENSIONS,
            (limits.inspectDimensions(6_001, 320) as MediaDimensionDecision.Rejected).reason,
        )
        assertEquals(16_000_000, (limits.inspectDimensions(4_000, 4_000) as MediaDimensionDecision.Accepted).dimensions.pixels)
        assertEquals(
            MediaNormalizationRejectReason.PIXEL_LIMIT_EXCEEDED,
            (limits.inspectDimensions(4_001, 4_000) as MediaDimensionDecision.Rejected).reason,
        )
    }

    @Test
    fun `invalid limit shapes fail instead of being repaired`() {
        val standard = MediaNormalizationLimits.standard()
        assertNull(
            MediaNormalizationLimits.create(
                standard.maxInputBytes,
                standard.maxOutputBytes,
                standard.maxSide,
                standard.minSide,
                standard.maxPixels,
                standard.workerHeapBytes,
                standard.workspaceBytes,
                standard.timeout,
                standard.maxConcurrency,
                standard.maxDiagnosticBytes,
                standard.maxContainerSegments,
                standard.maxMetadataBytes,
            ),
        )
        assertNull(MediaByteLimit.fromWire(0))
        assertNull(MediaByteLimit.fromWire(Long.MAX_VALUE))
        assertNull(MediaCountLimit.fromWire(1L))
        assertNull(MediaDurationLimit.fromWire("12000"))
    }

    @Test
    fun `accepted and rejected results cannot carry unknown closed values`() {
        val artifact = object : MediaNormalizationArtifact {
            override val size = requireNotNull(MediaByteSize.fromWire(3))
            override fun openStream() = ByteArrayInputStream(byteArrayOf(1, 2, 3))
            override fun close() = Unit
        }
        val digest = requireNotNull(ContentDigest.fromWire("a".repeat(64)))
        val dimensions = requireNotNull(PixelDimensions.fromWire(320, 320))

        assertNotNull(
            MediaNormalizationResult.Accepted.create(
                artifact, digest, digest, MediaFormat.PNG, dimensions, MediaNormalizationProfile.IMAGE_IO_V1,
                MediaNormalizationLimits.standard(),
            ),
        )
        assertNull(
            MediaNormalizationResult.Accepted.create(
                artifact, digest, digest, MediaFormat.UNKNOWN, dimensions, MediaNormalizationProfile.IMAGE_IO_V1,
                MediaNormalizationLimits.standard(),
            ),
        )
        assertNull(
            MediaNormalizationResult.Accepted.create(
                artifact, digest, digest, MediaFormat.WEBP, dimensions, MediaNormalizationProfile.IMAGE_IO_V1,
                MediaNormalizationLimits.standard(),
            ),
        )
        val standard = MediaNormalizationLimits.standard()
        val restrictive = requireNotNull(
            MediaNormalizationLimits.create(
                standard.maxInputBytes,
                standard.maxOutputBytes,
                standard.minSide,
                MediaPixelSideLimit.fromWire(1_000),
                MediaPixelCountLimit.fromWire(1_000_000L),
                standard.workerHeapBytes,
                standard.workspaceBytes,
                standard.timeout,
                standard.maxConcurrency,
                standard.maxDiagnosticBytes,
                standard.maxContainerSegments,
                standard.maxMetadataBytes,
            ),
        )
        val globallyValidButLocallyRejected = requireNotNull(PixelDimensions.fromWire(4_000, 4_000))
        assertNull(
            MediaNormalizationResult.Accepted.create(
                artifact, digest, digest, MediaFormat.PNG, globallyValidButLocallyRejected,
                MediaNormalizationProfile.IMAGE_IO_V1, restrictive,
            ),
        )
        assertNull(MediaNormalizationResult.Rejected.create(MediaNormalizationRejectReason.UNKNOWN))
        assertNull(MediaDimensionDecision.Rejected.create(MediaNormalizationRejectReason.UNKNOWN))
        assertFalse(
            listOf(
                MediaNormalizationResult.Rejected::class.java,
                MediaDimensionDecision.Rejected::class.java,
            ).flatMap { it.declaredMethods.toList() }.any { it.name == "copy" || it.name.startsWith("component") },
        )
        assertSame(
            MediaNormalizationResult.Unavailable,
            UnconfiguredMediaByteNormalizer().normalize(
                object : com.storecore.catalog.application.media.MediaNormalizationSource {
                    override val size = requireNotNull(MediaByteSize.fromWire(1))
                    override fun openStream() = ByteArrayInputStream(byteArrayOf(1))
                },
                MediaNormalizationLimits.standard(),
            ),
        )
    }
}
