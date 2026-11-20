package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.MediaFormat
import com.storecore.catalog.domain.media.MediaNormalizationRejectReason
import com.storecore.catalog.domain.media.PixelDimensions
import java.awt.image.BufferedImage

enum class ExifOrientation(val wire: Int) {
    NORMAL(1), MIRROR_HORIZONTAL(2), ROTATE_180(3), MIRROR_VERTICAL(4),
    TRANSPOSE(5), ROTATE_90(6), TRANSVERSE(7), ROTATE_270(8), UNKNOWN(0);
    companion object { fun fromWire(raw: Int?) = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}

enum class RasterColor(val wire: String) {
    SRGB("SRGB"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}

enum class RasterAlpha(val wire: String) {
    OPAQUE("OPAQUE"), TRANSPARENT("TRANSPARENT"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}

data class DecodedRaster(
    val image: BufferedImage,
    val dimensions: PixelDimensions,
    val orientation: ExifOrientation,
    val color: RasterColor,
)

sealed interface RasterDecodeResult {
    data class Decoded(val raster: DecodedRaster) : RasterDecodeResult
    data class Rejected(val reason: MediaNormalizationRejectReason) : RasterDecodeResult
    data object Unknown : RasterDecodeResult
}

sealed interface MediaEngineResult {
    data class Accepted(val bytes: ByteArray, val format: MediaFormat, val dimensions: PixelDimensions) : MediaEngineResult
    data class Rejected(val reason: MediaNormalizationRejectReason) : MediaEngineResult
    data object Unavailable : MediaEngineResult
    data object Unknown : MediaEngineResult
}

object MediaMetadataPolicy {
    val forbiddenOutputMetadata = setOf("EXIF", "XMP", "ICC", "TEXT")
    fun outputMetadataAllowed(name: String?): Boolean =
        name?.uppercase()?.let { candidate -> forbiddenOutputMetadata.none(candidate::contains) } ?: false
}
