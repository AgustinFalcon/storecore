package com.storecore.catalog.infrastructure.media

import com.storecore.catalog.domain.media.MediaDimensionDecision
import com.storecore.catalog.domain.media.MediaFormat
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.domain.media.MediaNormalizationRejectReason
import com.storecore.catalog.domain.media.PixelDimensions
import java.util.zip.CRC32

sealed interface MediaContainerPreflightOutcome {
    data class Accepted(val format: MediaFormat, val dimensions: PixelDimensions) : MediaContainerPreflightOutcome
    class Rejected private constructor(val reason: MediaNormalizationRejectReason) : MediaContainerPreflightOutcome {
        override fun equals(other: Any?): Boolean = other is Rejected && reason == other.reason
        override fun hashCode(): Int = reason.hashCode()
        override fun toString(): String = "Rejected(reason=$reason)"

        companion object {
            fun create(reason: MediaNormalizationRejectReason): Rejected? =
                reason.takeIf { it != MediaNormalizationRejectReason.UNKNOWN }?.let(::Rejected)
        }
    }
    data object Unknown : MediaContainerPreflightOutcome
}

/** Strict container framing gate. It never decodes pixels or trusts MIME/filenames. */
object MediaContainerPreflight {
    fun inspect(bytes: ByteArray, limits: MediaNormalizationLimits): MediaContainerPreflightOutcome {
        if (bytes.isEmpty()) return rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        if (bytes.size.toLong() > limits.maxInputBytes.value) return rejected(MediaNormalizationRejectReason.INPUT_LIMIT_EXCEEDED)
        return runCatching {
            when {
                bytes.startsWith(PNG_SIGNATURE) -> inspectPng(bytes, limits)
                bytes.startsWith(JPEG_SIGNATURE) -> inspectJpeg(bytes, limits)
                bytes.startsWith(RIFF) && bytes.size >= 12 && bytes.ascii(8, 4) == "WEBP" -> inspectWebp(bytes, limits)
                else -> rejected(MediaNormalizationRejectReason.UNSUPPORTED_FORMAT)
            }
        }.getOrElse { rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER) }
    }

    private fun inspectPng(bytes: ByteArray, limits: MediaNormalizationLimits): MediaContainerPreflightOutcome {
        var offset = PNG_SIGNATURE.size
        var segments = 0
        var metadataBytes = 0L
        var width: Int? = null
        var height: Int? = null
        var bitDepth: Int? = null
        var colorType: Int? = null
        var sawIdat = false
        var endedIdat = false
        var sawPlte = false

        while (offset < bytes.size) {
            if (++segments > limits.maxContainerSegments.value) return metadataExceeded()
            if (bytes.size - offset < 12) return corrupt()
            val length = bytes.u32be(offset)
            if (length > Int.MAX_VALUE.toLong()) return corrupt()
            val size = length.toInt()
            val typeOffset = offset + 4
            val dataOffset = offset + 8
            val dataEnd = dataOffset.toLong() + size
            val chunkEnd = dataEnd + 4
            if (chunkEnd > bytes.size.toLong()) return corrupt()
            val type = bytes.ascii(typeOffset, 4)
            if (type.length != 4 || type.any { it !in 'A'..'Z' && it !in 'a'..'z' }) return corrupt()
            val crc = CRC32().apply { update(bytes, typeOffset, 4 + size) }.value
            if (crc != bytes.u32be(dataEnd.toInt())) return corrupt()
            offset = chunkEnd.toInt()

            if (sawIdat && type != "IDAT" && type != "IEND") endedIdat = true
            when (type) {
                "IHDR" -> {
                    if (segments != 1 || width != null || size != 13) return corrupt()
                    val rawWidth = bytes.u32be(dataOffset)
                    val rawHeight = bytes.u32be(dataOffset + 4)
                    if (rawWidth > Int.MAX_VALUE || rawHeight > Int.MAX_VALUE) return invalidDimensions()
                    width = rawWidth.toInt()
                    height = rawHeight.toInt()
                    val parsedBitDepth = bytes.u8(dataOffset + 8)
                    bitDepth = parsedBitDepth
                    colorType = bytes.u8(dataOffset + 9)
                    if (!legalPngBitDepth(colorType, parsedBitDepth) || bytes.u8(dataOffset + 10) != 0 ||
                        bytes.u8(dataOffset + 11) != 0 || bytes.u8(dataOffset + 12) !in 0..1
                    ) return corrupt()
                }
                "PLTE" -> {
                    if (width == null || sawPlte || sawIdat || size !in 3..768 || size % 3 != 0) return corrupt()
                    if (colorType == 0 || colorType == 4) return corrupt()
                    if (colorType == 3 && size / 3 > (1 shl requireNotNull(bitDepth))) return corrupt()
                    sawPlte = true
                }
                "IDAT" -> {
                    if (width == null || endedIdat || (colorType == 3 && !sawPlte)) return corrupt()
                    sawIdat = true
                }
                "IEND" -> {
                    if (size != 0 || width == null || height == null || !sawIdat) return corrupt()
                    if (offset != bytes.size) return trailing()
                    return dimensions(MediaFormat.PNG, width, height, limits)
                }
                "acTL", "fcTL", "fdAT" -> return animated()
                else -> {
                    if (type[0].isUpperCase()) return corrupt()
                    metadataBytes += size
                    if (metadataBytes > limits.maxMetadataBytes.value) return metadataExceeded()
                }
            }
        }
        return corrupt()
    }

    private fun inspectJpeg(bytes: ByteArray, limits: MediaNormalizationLimits): MediaContainerPreflightOutcome {
        var offset = 2
        var segments = 0
        var metadataBytes = 0L
        var width: Int? = null
        var height: Int? = null
        var inScan = false
        var sawScan = false

        while (offset < bytes.size) {
            val marker: Int
            if (inScan) {
                var found: Int? = null
                while (offset < bytes.size && found == null) {
                    if (bytes.u8(offset++) != 0xff) continue
                    while (offset < bytes.size && bytes.u8(offset) == 0xff) offset++
                    if (offset >= bytes.size) return corrupt()
                    val candidate = bytes.u8(offset++)
                    if (candidate == 0x00 || candidate in 0xd0..0xd7) continue
                    found = candidate
                }
                marker = found ?: return corrupt()
                inScan = false
            } else {
                if (bytes.u8(offset++) != 0xff) return corrupt()
                while (offset < bytes.size && bytes.u8(offset) == 0xff) offset++
                if (offset >= bytes.size) return corrupt()
                marker = bytes.u8(offset++)
            }

            if (++segments > limits.maxContainerSegments.value) return metadataExceeded()
            when (marker) {
                0xd9 -> {
                    if (!sawScan || width == null || height == null) return corrupt()
                    if (offset != bytes.size) return trailing()
                    return dimensions(MediaFormat.JPEG, width, height, limits)
                }
                0xd8, 0x01, in 0xd0..0xd7 -> return corrupt()
            }
            if (marker !in JPEG_LENGTH_MARKERS) return corrupt()
            if (offset + 2 > bytes.size) return corrupt()
            val segmentLength = bytes.u16be(offset)
            if (segmentLength < 2) return corrupt()
            val dataOffset = offset + 2
            val dataSize = segmentLength - 2
            val end = dataOffset.toLong() + dataSize
            if (end > bytes.size.toLong()) return corrupt()
            offset = end.toInt()

            when {
                marker in SOF_MARKERS -> {
                    if (marker !in SUPPORTED_SOF || width != null || dataSize < 6) return corrupt()
                    val precision = bytes.u8(dataOffset)
                    val rawHeight = bytes.u16be(dataOffset + 1)
                    val rawWidth = bytes.u16be(dataOffset + 3)
                    val components = bytes.u8(dataOffset + 5)
                    if (precision != 8 || components !in setOf(1, 3) || dataSize != 6 + 3 * components) {
                        return if (components == 4) rejected(MediaNormalizationRejectReason.UNSUPPORTED_COLOR_PROFILE) else corrupt()
                    }
                    width = rawWidth
                    height = rawHeight
                }
                marker == 0xda -> {
                    if (width == null || dataSize < 6) return corrupt()
                    val components = bytes.u8(dataOffset)
                    if (components !in 1..3 || dataSize != 1 + 2 * components + 3) return corrupt()
                    sawScan = true
                    inScan = true
                }
                marker in 0xe0..0xef || marker == 0xfe -> {
                    metadataBytes += dataSize
                    if (metadataBytes > limits.maxMetadataBytes.value) return metadataExceeded()
                    if (marker == 0xe2 && dataSize >= 4 && bytes.ascii(dataOffset, 4) == "MPF\u0000") return animated()
                }
            }
        }
        return corrupt()
    }

    private fun inspectWebp(bytes: ByteArray, limits: MediaNormalizationLimits): MediaContainerPreflightOutcome {
        if (bytes.size < 20) return corrupt()
        val riffSize = bytes.u32le(4)
        if (riffSize + 8 != bytes.size.toLong()) return if (riffSize + 8 < bytes.size) trailing() else corrupt()
        var offset = 12
        var segments = 0
        var metadataBytes = 0L
        var extendedWidth: Int? = null
        var extendedHeight: Int? = null
        var sawExtended = false
        var sawImage = false
        var imageWidth: Int? = null
        var imageHeight: Int? = null
        var sawAlpha = false
        var sawIcc = false
        var sawExif = false
        var sawXmp = false
        var expectsIcc = false
        var expectsAlpha = false
        var expectsExif = false
        var expectsXmp = false
        var losslessAlpha: Boolean? = null

        while (offset < bytes.size) {
            if (++segments > limits.maxContainerSegments.value) return metadataExceeded()
            if (bytes.size - offset < 8) return corrupt()
            val type = bytes.ascii(offset, 4)
            val length = bytes.u32le(offset + 4)
            if (length > Int.MAX_VALUE.toLong()) return corrupt()
            val dataOffset = offset + 8
            val dataEnd = dataOffset.toLong() + length
            val paddedEnd = dataEnd + (length and 1L)
            if (paddedEnd > bytes.size.toLong()) return corrupt()
            if ((length and 1L) != 0L && bytes.u8(dataEnd.toInt()) != 0) return corrupt()
            val size = length.toInt()
            offset = paddedEnd.toInt()

            when (type) {
                "VP8X" -> {
                    if (segments != 1 || sawExtended || size != 10) return corrupt()
                    val flags = bytes.u8(dataOffset)
                    if (flags and 0x02 != 0) return animated()
                    if (flags and 0xc1 != 0 || bytes.u8(dataOffset + 1) != 0 || bytes.u8(dataOffset + 2) != 0 || bytes.u8(dataOffset + 3) != 0) return corrupt()
                    expectsIcc = flags and 0x20 != 0
                    expectsAlpha = flags and 0x10 != 0
                    expectsExif = flags and 0x08 != 0
                    expectsXmp = flags and 0x04 != 0
                    extendedWidth = bytes.u24le(dataOffset + 4) + 1
                    extendedHeight = bytes.u24le(dataOffset + 7) + 1
                    sawExtended = true
                }
                "ANIM", "ANMF" -> return animated()
                "ICCP" -> {
                    if (!sawExtended || !expectsIcc || sawIcc || sawImage || size == 0) return corrupt()
                    sawIcc = true
                    metadataBytes += size
                }
                "ALPH" -> {
                    if (!sawExtended || !expectsAlpha || sawAlpha || sawImage || size == 0 || (expectsIcc && !sawIcc)) return corrupt()
                    sawAlpha = true
                }
                "VP8 " -> {
                    if (sawImage || (!sawExtended && segments != 1) || (expectsIcc && !sawIcc) || (expectsAlpha && !sawAlpha)) return corrupt()
                    val dimensions = webpVp8Dimensions(bytes, dataOffset, size) ?: return corrupt()
                    imageWidth = dimensions.first
                    imageHeight = dimensions.second
                    losslessAlpha = false
                    sawImage = true
                }
                "VP8L" -> {
                    if (sawImage || sawAlpha || (!sawExtended && segments != 1) || (expectsIcc && !sawIcc)) return corrupt()
                    val dimensions = webpVp8lDimensions(bytes, dataOffset, size) ?: return corrupt()
                    imageWidth = dimensions.width
                    imageHeight = dimensions.height
                    losslessAlpha = dimensions.hasAlpha
                    sawImage = true
                }
                "EXIF", "XMP " -> {
                    val expected = if (type == "EXIF") expectsExif else expectsXmp
                    val duplicate = if (type == "EXIF") sawExif else sawXmp
                    if (!sawExtended || !expected || duplicate || size == 0) return corrupt()
                    if (type == "EXIF") sawExif = true else sawXmp = true
                    metadataBytes += size
                }
                else -> return corrupt()
            }
            if (metadataBytes > limits.maxMetadataBytes.value) return metadataExceeded()
        }
        if (!sawImage || imageWidth == null || imageHeight == null) return corrupt()
        if (sawExtended && (extendedWidth != imageWidth || extendedHeight != imageHeight)) return corrupt()
        if (sawExtended && (sawIcc != expectsIcc || sawExif != expectsExif || sawXmp != expectsXmp)) return corrupt()
        if (sawExtended) {
            if (losslessAlpha == true && (sawAlpha || !expectsAlpha)) return corrupt()
            if (losslessAlpha == false && sawAlpha != expectsAlpha) return corrupt()
        }
        return dimensions(MediaFormat.WEBP, imageWidth, imageHeight, limits)
    }

    private fun dimensions(format: MediaFormat, width: Int, height: Int, limits: MediaNormalizationLimits) =
        when (val decision = limits.inspectDimensions(width, height)) {
            is MediaDimensionDecision.Accepted -> MediaContainerPreflightOutcome.Accepted(format, decision.dimensions)
            is MediaDimensionDecision.Rejected -> rejected(decision.reason)
            MediaDimensionDecision.Unknown -> MediaContainerPreflightOutcome.Unknown
        }

    private fun webpVp8Dimensions(bytes: ByteArray, offset: Int, size: Int): Pair<Int, Int>? {
        if (size < 10 || bytes.u8(offset) and 1 != 0 || bytes.u8(offset + 3) != 0x9d ||
            bytes.u8(offset + 4) != 0x01 || bytes.u8(offset + 5) != 0x2a
        ) return null
        return (bytes.u16le(offset + 6) and 0x3fff) to (bytes.u16le(offset + 8) and 0x3fff)
    }

    private fun webpVp8lDimensions(bytes: ByteArray, offset: Int, size: Int): WebpLosslessHeader? {
        if (size < 5 || bytes.u8(offset) != 0x2f) return null
        val bits = bytes.u32le(offset + 1)
        if ((bits ushr 29) != 0L) return null
        return WebpLosslessHeader(
            ((bits and 0x3fff) + 1).toInt(),
            (((bits ushr 14) and 0x3fff) + 1).toInt(),
            bits and (1L shl 28) != 0L,
        )
    }

    private data class WebpLosslessHeader(val width: Int, val height: Int, val hasAlpha: Boolean)

    private fun legalPngBitDepth(colorType: Int?, bitDepth: Int): Boolean = when (colorType) {
        0 -> bitDepth in setOf(1, 2, 4, 8, 16)
        2, 4, 6 -> bitDepth in setOf(8, 16)
        3 -> bitDepth in setOf(1, 2, 4, 8)
        else -> false
    }

    private fun rejected(reason: MediaNormalizationRejectReason): MediaContainerPreflightOutcome =
        MediaContainerPreflightOutcome.Rejected.create(reason) ?: MediaContainerPreflightOutcome.Unknown
    private fun corrupt() = rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER)
    private fun trailing() = rejected(MediaNormalizationRejectReason.TRAILING_DATA)
    private fun animated() = rejected(MediaNormalizationRejectReason.ANIMATED_MEDIA)
    private fun invalidDimensions() = rejected(MediaNormalizationRejectReason.INVALID_DIMENSIONS)
    private fun metadataExceeded() = rejected(MediaNormalizationRejectReason.METADATA_LIMIT_EXCEEDED)

    private val PNG_SIGNATURE = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    private val JPEG_SIGNATURE = byteArrayOf(0xff.toByte(), 0xd8.toByte())
    private val RIFF = "RIFF".toByteArray(Charsets.US_ASCII)
    private val SOF_MARKERS = setOf(0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf)
    private val SUPPORTED_SOF = setOf(0xc0, 0xc1, 0xc2)
    private val JPEG_LENGTH_MARKERS = SOF_MARKERS + setOf(0xc4, 0xcc, 0xda, 0xdb, 0xdd) + (0xe0..0xef) + setOf(0xfe)
}

private fun ByteArray.startsWith(prefix: ByteArray): Boolean = size >= prefix.size && prefix.indices.all { this[it] == prefix[it] }
private fun ByteArray.u8(offset: Int): Int = this[offset].toInt() and 0xff
private fun ByteArray.u16be(offset: Int): Int = (u8(offset) shl 8) or u8(offset + 1)
private fun ByteArray.u16le(offset: Int): Int = u8(offset) or (u8(offset + 1) shl 8)
private fun ByteArray.u24le(offset: Int): Int = u8(offset) or (u8(offset + 1) shl 8) or (u8(offset + 2) shl 16)
private fun ByteArray.u32be(offset: Int): Long = (u8(offset).toLong() shl 24) or (u8(offset + 1).toLong() shl 16) or
    (u8(offset + 2).toLong() shl 8) or u8(offset + 3).toLong()
private fun ByteArray.u32le(offset: Int): Long = u8(offset).toLong() or (u8(offset + 1).toLong() shl 8) or
    (u8(offset + 2).toLong() shl 16) or (u8(offset + 3).toLong() shl 24)
private fun ByteArray.ascii(offset: Int, length: Int): String = String(this, offset, length, Charsets.ISO_8859_1)
