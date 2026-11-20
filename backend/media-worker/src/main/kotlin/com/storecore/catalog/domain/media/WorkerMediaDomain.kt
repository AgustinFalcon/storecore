package com.storecore.catalog.domain.media

import java.time.Duration

private const val MAX_SAFE_MEDIA_LIMIT = 9_007_199_254_740_991L
private val SHA256 = Regex("^[a-f0-9]{64}$")

interface MediaWireType { val wire: String }

enum class MediaFormat(override val wire: String) : MediaWireType {
    JPEG("JPEG"), PNG("PNG"), WEBP("WEBP"), UNKNOWN("UNKNOWN");
    companion object {
        fun fromWire(raw: String?): MediaFormat = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN
    }
}

enum class MediaNormalizationProfile(override val wire: String) : MediaWireType {
    IMAGE_IO_V1("IMAGE_IO_V1"), UNKNOWN("UNKNOWN");
    fun permitsOutput(format: MediaFormat): Boolean = this == IMAGE_IO_V1 && format in setOf(MediaFormat.JPEG, MediaFormat.PNG)
    companion object {
        fun fromWire(raw: String?): MediaNormalizationProfile =
            entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN
    }
}

enum class MediaNormalizationRejectReason(override val wire: String) : MediaWireType {
    UNSUPPORTED_FORMAT("UNSUPPORTED_FORMAT"), MAGIC_MISMATCH("MAGIC_MISMATCH"),
    CORRUPT_CONTAINER("CORRUPT_CONTAINER"), TRAILING_DATA("TRAILING_DATA"),
    ANIMATED_MEDIA("ANIMATED_MEDIA"), INVALID_DIMENSIONS("INVALID_DIMENSIONS"),
    PIXEL_LIMIT_EXCEEDED("PIXEL_LIMIT_EXCEEDED"), INPUT_LIMIT_EXCEEDED("INPUT_LIMIT_EXCEEDED"),
    METADATA_LIMIT_EXCEEDED("METADATA_LIMIT_EXCEEDED"), UNSUPPORTED_COLOR_PROFILE("UNSUPPORTED_COLOR_PROFILE"),
    DECODE_TIMEOUT("DECODE_TIMEOUT"), RESOURCE_LIMIT_EXCEEDED("RESOURCE_LIMIT_EXCEEDED"),
    OUTPUT_LIMIT_EXCEEDED("OUTPUT_LIMIT_EXCEEDED"), NORMALIZATION_FAILED("NORMALIZATION_FAILED"),
    UNKNOWN("UNKNOWN");
    companion object {
        fun fromWire(raw: String?): MediaNormalizationRejectReason =
            entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN
    }
}

@JvmInline value class ContentDigest private constructor(val value: String) {
    companion object { fun fromWire(raw: String?): ContentDigest? = raw?.takeIf(SHA256::matches)?.let(::ContentDigest) }
}
@JvmInline value class MediaByteSize private constructor(val value: Long) {
    companion object { fun fromWire(raw: Any?): MediaByteSize? = strictPositiveLong(raw)?.let(::MediaByteSize) }
}
@JvmInline value class MediaByteLimit private constructor(val value: Long) {
    companion object { fun fromWire(raw: Any?): MediaByteLimit? = strictPositiveLong(raw)?.let(::MediaByteLimit) }
}
@JvmInline value class MediaCountLimit private constructor(val value: Int) {
    companion object { fun fromWire(raw: Any?): MediaCountLimit? = strictPositiveInt(raw)?.let(::MediaCountLimit) }
}
@JvmInline value class MediaDurationLimit private constructor(val value: Duration) {
    companion object { fun fromWire(raw: Any?): MediaDurationLimit? = strictPositiveLong(raw)?.let(Duration::ofMillis)?.let(::MediaDurationLimit) }
}
@JvmInline value class MediaPixelSideLimit private constructor(val value: Int) {
    companion object { fun fromWire(raw: Any?): MediaPixelSideLimit? = strictPositiveInt(raw)?.let(::MediaPixelSideLimit) }
}
@JvmInline value class MediaPixelCountLimit private constructor(val value: Long) {
    companion object { fun fromWire(raw: Any?): MediaPixelCountLimit? = strictPositiveLong(raw)?.let(::MediaPixelCountLimit) }
}

class PixelDimensions private constructor(val width: Int, val height: Int) {
    val pixels: Long get() = width.toLong() * height
    override fun equals(other: Any?) = other is PixelDimensions && width == other.width && height == other.height
    override fun hashCode() = 31 * width + height
    override fun toString() = "${width}x$height"
    companion object {
        const val MIN_SIDE = 320
        const val MAX_SIDE = 6000
        const val MAX_PIXELS = 16_000_000L
        fun fromWire(width: Any?, height: Any?): PixelDimensions? {
            val w = width as? Int ?: return null
            val h = height as? Int ?: return null
            return PixelDimensions(w, h).takeIf {
                w in MIN_SIDE..MAX_SIDE && h in MIN_SIDE..MAX_SIDE && it.pixels <= MAX_PIXELS
            }
        }
    }
}

sealed interface MediaDimensionDecision {
    data class Accepted(val dimensions: PixelDimensions) : MediaDimensionDecision
    data class Rejected(val reason: MediaNormalizationRejectReason) : MediaDimensionDecision
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
    fun acceptsInput(size: MediaByteSize) = size.value <= maxInputBytes.value
    fun acceptsOutput(size: MediaByteSize) = size.value <= maxOutputBytes.value
    fun forOutputPreflight() = MediaNormalizationLimits(
        maxOutputBytes, maxOutputBytes, minSide, maxSide, maxPixels, workerHeapBytes,
        workspaceBytes, timeout, maxConcurrency, maxDiagnosticBytes, maxContainerSegments, maxMetadataBytes,
    )
    fun inspectDimensions(width: Any?, height: Any?): MediaDimensionDecision {
        val w = width as? Int ?: return MediaDimensionDecision.Unknown
        val h = height as? Int ?: return MediaDimensionDecision.Unknown
        if (w !in minSide.value..maxSide.value || h !in minSide.value..maxSide.value) {
            return MediaDimensionDecision.Rejected(MediaNormalizationRejectReason.INVALID_DIMENSIONS)
        }
        if (w.toLong() * h > maxPixels.value) {
            return MediaDimensionDecision.Rejected(MediaNormalizationRejectReason.PIXEL_LIMIT_EXCEEDED)
        }
        return PixelDimensions.fromWire(w, h)?.let(MediaDimensionDecision::Accepted)
            ?: MediaDimensionDecision.Rejected(MediaNormalizationRejectReason.INVALID_DIMENSIONS)
    }
    companion object {
        private const val MIB = 1024L * 1024L
        fun standard() = requireNotNull(create(
            MediaByteLimit.fromWire(10 * MIB), MediaByteLimit.fromWire(20 * MIB),
            MediaPixelSideLimit.fromWire(PixelDimensions.MIN_SIDE), MediaPixelSideLimit.fromWire(PixelDimensions.MAX_SIDE),
            MediaPixelCountLimit.fromWire(PixelDimensions.MAX_PIXELS), MediaByteLimit.fromWire(192 * MIB),
            MediaByteLimit.fromWire(48 * MIB), MediaDurationLimit.fromWire(12_000L), MediaCountLimit.fromWire(1),
            MediaByteLimit.fromWire(64 * 1024L), MediaCountLimit.fromWire(1_024), MediaByteLimit.fromWire(MIB),
        ))
        fun create(
            maxInputBytes: MediaByteLimit?, maxOutputBytes: MediaByteLimit?, minSide: MediaPixelSideLimit?,
            maxSide: MediaPixelSideLimit?, maxPixels: MediaPixelCountLimit?, workerHeapBytes: MediaByteLimit?,
            workspaceBytes: MediaByteLimit?, timeout: MediaDurationLimit?, maxConcurrency: MediaCountLimit?,
            maxDiagnosticBytes: MediaByteLimit?, maxContainerSegments: MediaCountLimit?, maxMetadataBytes: MediaByteLimit?,
        ): MediaNormalizationLimits? {
            val all = listOf(maxInputBytes, maxOutputBytes, minSide, maxSide, maxPixels, workerHeapBytes,
                workspaceBytes, timeout, maxConcurrency, maxDiagnosticBytes, maxContainerSegments, maxMetadataBytes)
            if (all.any { it == null }) return null
            val input = requireNotNull(maxInputBytes); val output = requireNotNull(maxOutputBytes)
            val min = requireNotNull(minSide); val max = requireNotNull(maxSide); val pixels = requireNotNull(maxPixels)
            val heap = requireNotNull(workerHeapBytes); val workspace = requireNotNull(workspaceBytes)
            val deadline = requireNotNull(timeout); val concurrency = requireNotNull(maxConcurrency)
            val diagnostics = requireNotNull(maxDiagnosticBytes); val segments = requireNotNull(maxContainerSegments)
            val metadata = requireNotNull(maxMetadataBytes)
            if (min.value < PixelDimensions.MIN_SIDE || max.value > PixelDimensions.MAX_SIDE || min.value > max.value) return null
            if (pixels.value > PixelDimensions.MAX_PIXELS || workspace.value < input.value + output.value || heap.value < output.value) return null
            if (metadata.value > input.value || diagnostics.value > input.value || deadline.value > Duration.ofMinutes(1)) return null
            if (concurrency.value > 2 || segments.value > 4_096) return null
            return MediaNormalizationLimits(input, output, min, max, pixels, heap, workspace, deadline, concurrency, diagnostics, segments, metadata)
        }
    }
}

private fun strictPositiveLong(raw: Any?): Long? = when (raw) {
    is Byte -> raw.toLong(); is Short -> raw.toLong(); is Int -> raw.toLong(); is Long -> raw; else -> null
}?.takeIf { it in 1..MAX_SAFE_MEDIA_LIMIT }
private fun strictPositiveInt(raw: Any?): Int? = when (raw) {
    is Byte -> raw.toInt(); is Short -> raw.toInt(); is Int -> raw; else -> null
}?.takeIf { it > 0 }
