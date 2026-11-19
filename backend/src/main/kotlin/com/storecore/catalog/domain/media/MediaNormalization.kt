package com.storecore.catalog.domain.media

import java.time.Duration

private const val MAX_SAFE_MEDIA_LIMIT = 9_007_199_254_740_991L

enum class MediaNormalizationProfile(override val wire: String) : MediaWireType {
    IMAGE_IO_V1("IMAGE_IO_V1"),
    UNKNOWN("UNKNOWN");

    fun permitsOutput(format: MediaFormat): Boolean = when (this) {
        IMAGE_IO_V1 -> format == MediaFormat.JPEG || format == MediaFormat.PNG
        UNKNOWN -> false
    }

    companion object {
        fun fromWire(raw: String?): MediaNormalizationProfile =
            entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN
    }
}

enum class MediaNormalizationRejectReason(override val wire: String) : MediaWireType {
    UNSUPPORTED_FORMAT("UNSUPPORTED_FORMAT"),
    MAGIC_MISMATCH("MAGIC_MISMATCH"),
    CORRUPT_CONTAINER("CORRUPT_CONTAINER"),
    TRAILING_DATA("TRAILING_DATA"),
    ANIMATED_MEDIA("ANIMATED_MEDIA"),
    INVALID_DIMENSIONS("INVALID_DIMENSIONS"),
    PIXEL_LIMIT_EXCEEDED("PIXEL_LIMIT_EXCEEDED"),
    INPUT_LIMIT_EXCEEDED("INPUT_LIMIT_EXCEEDED"),
    METADATA_LIMIT_EXCEEDED("METADATA_LIMIT_EXCEEDED"),
    UNSUPPORTED_COLOR_PROFILE("UNSUPPORTED_COLOR_PROFILE"),
    DECODE_TIMEOUT("DECODE_TIMEOUT"),
    RESOURCE_LIMIT_EXCEEDED("RESOURCE_LIMIT_EXCEEDED"),
    OUTPUT_LIMIT_EXCEEDED("OUTPUT_LIMIT_EXCEEDED"),
    NORMALIZATION_FAILED("NORMALIZATION_FAILED"),
    UNKNOWN("UNKNOWN");

    companion object {
        fun fromWire(raw: String?): MediaNormalizationRejectReason =
            entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN
    }
}

@JvmInline
value class MediaByteLimit private constructor(val value: Long) {
    companion object {
        fun fromWire(raw: Any?): MediaByteLimit? = strictPositiveLong(raw)?.let(::MediaByteLimit)
    }
}

@JvmInline
value class MediaCountLimit private constructor(val value: Int) {
    companion object {
        fun fromWire(raw: Any?): MediaCountLimit? = strictPositiveInt(raw)?.let(::MediaCountLimit)
    }
}

@JvmInline
value class MediaDurationLimit private constructor(val value: Duration) {
    companion object {
        fun fromWire(rawMilliseconds: Any?): MediaDurationLimit? =
            strictPositiveLong(rawMilliseconds)?.let(Duration::ofMillis)?.let(::MediaDurationLimit)
    }
}

@JvmInline
value class MediaPixelSideLimit private constructor(val value: Int) {
    companion object {
        fun fromWire(raw: Any?): MediaPixelSideLimit? = strictPositiveInt(raw)?.let(::MediaPixelSideLimit)
    }
}

@JvmInline
value class MediaPixelCountLimit private constructor(val value: Long) {
    companion object {
        fun fromWire(raw: Any?): MediaPixelCountLimit? = strictPositiveLong(raw)?.let(::MediaPixelCountLimit)
    }
}

sealed interface MediaDimensionDecision {
    data class Accepted(val dimensions: PixelDimensions) : MediaDimensionDecision
    class Rejected private constructor(val reason: MediaNormalizationRejectReason) : MediaDimensionDecision {
        companion object {
            fun create(reason: MediaNormalizationRejectReason): Rejected? =
                reason.takeIf { it != MediaNormalizationRejectReason.UNKNOWN }?.let(::Rejected)
        }
    }
    data object Unknown : MediaDimensionDecision
}

class MediaNormalizationLimits private constructor(
    val maxInputBytes: MediaByteLimit,
    val maxOutputBytes: MediaByteLimit,
    val minSide: MediaPixelSideLimit,
    val maxSide: MediaPixelSideLimit,
    val maxPixels: MediaPixelCountLimit,
    val workerHeapBytes: MediaByteLimit,
    val workspaceBytes: MediaByteLimit,
    val timeout: MediaDurationLimit,
    val maxConcurrency: MediaCountLimit,
    val maxDiagnosticBytes: MediaByteLimit,
    val maxContainerSegments: MediaCountLimit,
    val maxMetadataBytes: MediaByteLimit,
) {
    fun acceptsInput(size: MediaByteSize): Boolean = size.value <= maxInputBytes.value
    fun acceptsOutput(size: MediaByteSize): Boolean = size.value <= maxOutputBytes.value

    fun inspectDimensions(width: Any?, height: Any?): MediaDimensionDecision {
        val w = width as? Int ?: return MediaDimensionDecision.Unknown
        val h = height as? Int ?: return MediaDimensionDecision.Unknown
        if (w !in minSide.value..maxSide.value || h !in minSide.value..maxSide.value) {
            return requireNotNull(MediaDimensionDecision.Rejected.create(MediaNormalizationRejectReason.INVALID_DIMENSIONS))
        }
        val pixels = w.toLong() * h.toLong()
        if (pixels > maxPixels.value) {
            return requireNotNull(MediaDimensionDecision.Rejected.create(MediaNormalizationRejectReason.PIXEL_LIMIT_EXCEEDED))
        }
        val dimensions = PixelDimensions.fromWire(w, h)
            ?: return requireNotNull(MediaDimensionDecision.Rejected.create(MediaNormalizationRejectReason.INVALID_DIMENSIONS))
        return MediaDimensionDecision.Accepted(dimensions)
    }

    companion object {
        private const val MIB = 1024L * 1024L

        fun standard(): MediaNormalizationLimits = requireNotNull(
            create(
                maxInputBytes = MediaByteLimit.fromWire(10L * MIB),
                maxOutputBytes = MediaByteLimit.fromWire(20L * MIB),
                minSide = MediaPixelSideLimit.fromWire(PixelDimensions.MIN_SIDE),
                maxSide = MediaPixelSideLimit.fromWire(PixelDimensions.MAX_SIDE),
                maxPixels = MediaPixelCountLimit.fromWire(PixelDimensions.MAX_PIXELS),
                workerHeapBytes = MediaByteLimit.fromWire(192L * MIB),
                workspaceBytes = MediaByteLimit.fromWire(48L * MIB),
                timeout = MediaDurationLimit.fromWire(12_000L),
                maxConcurrency = MediaCountLimit.fromWire(1),
                maxDiagnosticBytes = MediaByteLimit.fromWire(64L * 1024L),
                maxContainerSegments = MediaCountLimit.fromWire(1_024),
                maxMetadataBytes = MediaByteLimit.fromWire(1L * MIB),
            ),
        )

        fun create(
            maxInputBytes: MediaByteLimit?,
            maxOutputBytes: MediaByteLimit?,
            minSide: MediaPixelSideLimit?,
            maxSide: MediaPixelSideLimit?,
            maxPixels: MediaPixelCountLimit?,
            workerHeapBytes: MediaByteLimit?,
            workspaceBytes: MediaByteLimit?,
            timeout: MediaDurationLimit?,
            maxConcurrency: MediaCountLimit?,
            maxDiagnosticBytes: MediaByteLimit?,
            maxContainerSegments: MediaCountLimit?,
            maxMetadataBytes: MediaByteLimit?,
        ): MediaNormalizationLimits? {
            if (listOf(
                    maxInputBytes, maxOutputBytes, minSide, maxSide, maxPixels, workerHeapBytes,
                    workspaceBytes, timeout, maxConcurrency, maxDiagnosticBytes, maxContainerSegments,
                    maxMetadataBytes,
                ).any { it == null }
            ) return null

            val input = requireNotNull(maxInputBytes)
            val output = requireNotNull(maxOutputBytes)
            val minimum = requireNotNull(minSide)
            val maximum = requireNotNull(maxSide)
            val pixels = requireNotNull(maxPixels)
            val heap = requireNotNull(workerHeapBytes)
            val workspace = requireNotNull(workspaceBytes)
            val deadline = requireNotNull(timeout)
            val concurrency = requireNotNull(maxConcurrency)
            val diagnostics = requireNotNull(maxDiagnosticBytes)
            val segments = requireNotNull(maxContainerSegments)
            val metadata = requireNotNull(maxMetadataBytes)

            if (minimum.value < PixelDimensions.MIN_SIDE || maximum.value > PixelDimensions.MAX_SIDE || minimum.value > maximum.value) return null
            if (pixels.value > PixelDimensions.MAX_PIXELS) return null
            if (workspace.value < input.value + output.value || heap.value < output.value) return null
            if (metadata.value > input.value || diagnostics.value > input.value) return null
            if (deadline.value > Duration.ofMinutes(1) || concurrency.value > 2 || segments.value > 4_096) return null

            return MediaNormalizationLimits(
                input, output, minimum, maximum, pixels, heap, workspace, deadline,
                concurrency, diagnostics, segments, metadata,
            )
        }
    }
}

private fun strictPositiveLong(raw: Any?): Long? = when (raw) {
    is Byte -> raw.toLong()
    is Short -> raw.toLong()
    is Int -> raw.toLong()
    is Long -> raw
    else -> null
}?.takeIf { it in 1..MAX_SAFE_MEDIA_LIMIT }

private fun strictPositiveInt(raw: Any?): Int? = when (raw) {
    is Byte -> raw.toInt()
    is Short -> raw.toInt()
    is Int -> raw
    else -> null
}?.takeIf { it > 0 }
