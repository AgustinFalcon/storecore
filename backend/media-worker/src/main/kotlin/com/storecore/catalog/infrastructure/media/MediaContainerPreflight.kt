package com.storecore.catalog.infrastructure.media

import com.storecore.catalog.domain.media.*
import java.util.zip.CRC32

sealed interface MediaContainerPreflightOutcome {
    data class Accepted(val format: MediaFormat, val dimensions: PixelDimensions) : MediaContainerPreflightOutcome
    data class Rejected(val reason: MediaNormalizationRejectReason) : MediaContainerPreflightOutcome
    data object Unknown : MediaContainerPreflightOutcome
}

/** Worker-local copy of the strict V1 framing gate; it never trusts MIME or filenames. */
object MediaContainerPreflight {
    fun inspect(bytes: ByteArray, limits: MediaNormalizationLimits): MediaContainerPreflightOutcome {
        if (bytes.isEmpty()) return rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        if (bytes.size.toLong() > limits.maxInputBytes.value) return rejected(MediaNormalizationRejectReason.INPUT_LIMIT_EXCEEDED)
        return runCatching {
            when {
                bytes.startsWith(PNG) -> png(bytes, limits)
                bytes.startsWith(JPEG) -> jpeg(bytes, limits)
                bytes.startsWith(RIFF) && bytes.size >= 12 && bytes.ascii(8, 4) == "WEBP" -> webp(bytes, limits)
                else -> rejected(MediaNormalizationRejectReason.UNSUPPORTED_FORMAT)
            }
        }.getOrElse { rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER) }
    }

    private fun png(bytes: ByteArray, limits: MediaNormalizationLimits): MediaContainerPreflightOutcome {
        var offset = PNG.size; var segments = 0; var metadata = 0L
        var width: Int? = null; var height: Int? = null; var color: Int? = null; var depth: Int? = null
        var idat = false; var endedIdat = false; var palette = false
        while (offset < bytes.size) {
            if (++segments > limits.maxContainerSegments.value) return metadataExceeded()
            if (bytes.size - offset < 12) return corrupt()
            val length = bytes.u32be(offset)
            if (length > Int.MAX_VALUE) return corrupt()
            val size = length.toInt(); val typeAt = offset + 4; val dataAt = offset + 8
            val dataEnd = dataAt.toLong() + size; val end = dataEnd + 4
            if (end > bytes.size) return corrupt()
            val type = bytes.ascii(typeAt, 4)
            if (type.any { it !in 'A'..'Z' && it !in 'a'..'z' }) return corrupt()
            if (CRC32().apply { update(bytes, typeAt, 4 + size) }.value != bytes.u32be(dataEnd.toInt())) return corrupt()
            offset = end.toInt()
            if (idat && type != "IDAT" && type != "IEND") endedIdat = true
            when (type) {
                "IHDR" -> {
                    if (segments != 1 || width != null || size != 13) return corrupt()
                    val w = bytes.u32be(dataAt); val h = bytes.u32be(dataAt + 4)
                    if (w > Int.MAX_VALUE || h > Int.MAX_VALUE) return invalidDimensions()
                    width = w.toInt(); height = h.toInt(); depth = bytes.u8(dataAt + 8); color = bytes.u8(dataAt + 9)
                    if (!legalPng(color, depth!!) || bytes.u8(dataAt + 10) != 0 || bytes.u8(dataAt + 11) != 0 || bytes.u8(dataAt + 12) !in 0..1) return corrupt()
                }
                "PLTE" -> {
                    if (width == null || palette || idat || size !in 3..768 || size % 3 != 0 || color in setOf(0, 4)) return corrupt()
                    if (color == 3 && size / 3 > (1 shl requireNotNull(depth))) return corrupt()
                    palette = true
                }
                "IDAT" -> {
                    if (width == null || endedIdat || (color == 3 && !palette)) return corrupt()
                    idat = true
                }
                "IEND" -> {
                    if (size != 0 || width == null || height == null || !idat) return corrupt()
                    if (offset != bytes.size) return trailing()
                    return dimensions(MediaFormat.PNG, width!!, height!!, limits)
                }
                "acTL", "fcTL", "fdAT" -> return animated()
                else -> {
                    if (type[0].isUpperCase()) return corrupt()
                    metadata += size
                    if (metadata > limits.maxMetadataBytes.value) return metadataExceeded()
                }
            }
        }
        return corrupt()
    }

    private fun jpeg(bytes: ByteArray, limits: MediaNormalizationLimits): MediaContainerPreflightOutcome {
        var offset = 2; var segments = 0; var metadata = 0L
        var width: Int? = null; var height: Int? = null; var inScan = false; var sawScan = false
        while (offset < bytes.size) {
            val marker: Int
            if (inScan) {
                var found: Int? = null
                while (offset < bytes.size && found == null) {
                    if (bytes.u8(offset++) != 0xff) continue
                    while (offset < bytes.size && bytes.u8(offset) == 0xff) offset++
                    if (offset >= bytes.size) return corrupt()
                    val candidate = bytes.u8(offset++)
                    if (candidate == 0 || candidate in 0xd0..0xd7) continue
                    found = candidate
                }
                marker = found ?: return corrupt(); inScan = false
            } else {
                if (bytes.u8(offset++) != 0xff) return corrupt()
                while (offset < bytes.size && bytes.u8(offset) == 0xff) offset++
                if (offset >= bytes.size) return corrupt()
                marker = bytes.u8(offset++)
            }
            if (++segments > limits.maxContainerSegments.value) return metadataExceeded()
            if (marker == 0xd9) {
                if (!sawScan || width == null || height == null) return corrupt()
                return if (offset == bytes.size) dimensions(MediaFormat.JPEG, width!!, height!!, limits) else trailing()
            }
            if (marker !in JPEG_LENGTH_MARKERS) return corrupt()
            if (offset + 2 > bytes.size) return corrupt()
            val length = bytes.u16be(offset); if (length < 2) return corrupt()
            val dataAt = offset + 2; val size = length - 2; val end = dataAt.toLong() + size
            if (end > bytes.size) return corrupt()
            offset = end.toInt()
            when {
                marker in SOF -> {
                    if (marker !in SUPPORTED_SOF || width != null || size < 6) return corrupt()
                    val components = bytes.u8(dataAt + 5)
                    if (bytes.u8(dataAt) != 8 || components !in setOf(1, 3) || size != 6 + 3 * components) {
                        return if (components == 4) rejected(MediaNormalizationRejectReason.UNSUPPORTED_COLOR_PROFILE) else corrupt()
                    }
                    height = bytes.u16be(dataAt + 1); width = bytes.u16be(dataAt + 3)
                }
                marker == 0xda -> {
                    if (width == null || size < 6) return corrupt()
                    val components = bytes.u8(dataAt)
                    if (components !in 1..3 || size != 1 + 2 * components + 3) return corrupt()
                    sawScan = true; inScan = true
                }
                marker in 0xe0..0xef || marker == 0xfe -> {
                    metadata += size
                    if (metadata > limits.maxMetadataBytes.value) return metadataExceeded()
                    if (marker == 0xe2 && size >= 4 && bytes.ascii(dataAt, 4) == "MPF\u0000") return animated()
                }
            }
        }
        return corrupt()
    }

    private fun webp(bytes: ByteArray, limits: MediaNormalizationLimits): MediaContainerPreflightOutcome {
        if (bytes.size < 20) return corrupt()
        val riffSize = bytes.u32le(4)
        if (riffSize + 8 != bytes.size.toLong()) return if (riffSize + 8 < bytes.size) trailing() else corrupt()
        var offset = 12; var segments = 0; var metadata = 0L
        var extendedWidth: Int? = null; var extendedHeight: Int? = null; var imageWidth: Int? = null; var imageHeight: Int? = null
        var extended = false; var image = false; var alpha = false; var icc = false; var exif = false; var xmp = false
        var expectsIcc = false; var expectsAlpha = false; var expectsExif = false; var expectsXmp = false; var losslessAlpha: Boolean? = null
        while (offset < bytes.size) {
            if (++segments > limits.maxContainerSegments.value || bytes.size - offset < 8) return corrupt()
            val type = bytes.ascii(offset, 4); val length = bytes.u32le(offset + 4)
            if (length > Int.MAX_VALUE) return corrupt()
            val dataAt = offset + 8; val dataEnd = dataAt.toLong() + length; val end = dataEnd + (length and 1)
            if (end > bytes.size || ((length and 1) != 0L && bytes.u8(dataEnd.toInt()) != 0)) return corrupt()
            val size = length.toInt(); offset = end.toInt()
            when (type) {
                "VP8X" -> {
                    if (segments != 1 || extended || size != 10) return corrupt()
                    val flags = bytes.u8(dataAt)
                    if (flags and 2 != 0) return animated()
                    if (flags and 0xc1 != 0 || bytes.u8(dataAt + 1) != 0 || bytes.u8(dataAt + 2) != 0 || bytes.u8(dataAt + 3) != 0) return corrupt()
                    expectsIcc = flags and 0x20 != 0; expectsAlpha = flags and 0x10 != 0
                    expectsExif = flags and 8 != 0; expectsXmp = flags and 4 != 0
                    extendedWidth = bytes.u24le(dataAt + 4) + 1; extendedHeight = bytes.u24le(dataAt + 7) + 1; extended = true
                }
                "ANIM", "ANMF" -> return animated()
                "ICCP" -> { if (!extended || !expectsIcc || icc || image || size == 0) return corrupt(); icc = true; metadata += size }
                "ALPH" -> { if (!extended || !expectsAlpha || alpha || image || size == 0 || (expectsIcc && !icc)) return corrupt(); alpha = true }
                "VP8 " -> {
                    if (image || (!extended && segments != 1) || (expectsIcc && !icc) || (expectsAlpha && !alpha)) return corrupt()
                    if (size < 10 || bytes.u8(dataAt) and 1 != 0 || bytes.ascii(dataAt + 3, 3) != "\u009d\u0001*") return corrupt()
                    imageWidth = bytes.u16le(dataAt + 6) and 0x3fff; imageHeight = bytes.u16le(dataAt + 8) and 0x3fff
                    losslessAlpha = false; image = true
                }
                "VP8L" -> {
                    if (image || alpha || (!extended && segments != 1) || (expectsIcc && !icc) || size < 5 || bytes.u8(dataAt) != 0x2f) return corrupt()
                    val bits = bytes.u32le(dataAt + 1); if (bits ushr 29 != 0L) return corrupt()
                    imageWidth = ((bits and 0x3fff) + 1).toInt(); imageHeight = (((bits ushr 14) and 0x3fff) + 1).toInt()
                    losslessAlpha = bits and (1L shl 28) != 0L; image = true
                }
                "EXIF", "XMP " -> {
                    val expected = if (type == "EXIF") expectsExif else expectsXmp
                    val duplicate = if (type == "EXIF") exif else xmp
                    if (!extended || !expected || duplicate || size == 0) return corrupt()
                    if (type == "EXIF") exif = true else xmp = true
                    metadata += size
                }
                else -> return corrupt()
            }
            if (metadata > limits.maxMetadataBytes.value) return metadataExceeded()
        }
        if (!image || imageWidth == null || imageHeight == null) return corrupt()
        if (extended && (extendedWidth != imageWidth || extendedHeight != imageHeight)) return corrupt()
        if (extended && (icc != expectsIcc || exif != expectsExif || xmp != expectsXmp)) return corrupt()
        if (extended && ((losslessAlpha == true && (alpha || !expectsAlpha)) || (losslessAlpha == false && alpha != expectsAlpha))) return corrupt()
        return dimensions(MediaFormat.WEBP, imageWidth!!, imageHeight!!, limits)
    }

    private fun dimensions(format: MediaFormat, w: Int, h: Int, limits: MediaNormalizationLimits) =
        when (val decision = limits.inspectDimensions(w, h)) {
            is MediaDimensionDecision.Accepted -> MediaContainerPreflightOutcome.Accepted(format, decision.dimensions)
            is MediaDimensionDecision.Rejected -> rejected(decision.reason)
            MediaDimensionDecision.Unknown -> MediaContainerPreflightOutcome.Unknown
        }
    private fun legalPng(color: Int?, depth: Int) = when (color) {
        0 -> depth in setOf(1, 2, 4, 8, 16); 2, 4, 6 -> depth in setOf(8, 16); 3 -> depth in setOf(1, 2, 4, 8); else -> false
    }
    private fun rejected(reason: MediaNormalizationRejectReason) = MediaContainerPreflightOutcome.Rejected(reason)
    private fun corrupt() = rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER)
    private fun trailing() = rejected(MediaNormalizationRejectReason.TRAILING_DATA)
    private fun animated() = rejected(MediaNormalizationRejectReason.ANIMATED_MEDIA)
    private fun invalidDimensions() = rejected(MediaNormalizationRejectReason.INVALID_DIMENSIONS)
    private fun metadataExceeded() = rejected(MediaNormalizationRejectReason.METADATA_LIMIT_EXCEEDED)

    private val PNG = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    private val JPEG = byteArrayOf(0xff.toByte(), 0xd8.toByte())
    private val RIFF = "RIFF".toByteArray(Charsets.US_ASCII)
    private val SOF = setOf(0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf)
    private val SUPPORTED_SOF = setOf(0xc0, 0xc1, 0xc2)
    private val JPEG_LENGTH_MARKERS = SOF + setOf(0xc4, 0xcc, 0xda, 0xdb, 0xdd) + (0xe0..0xef) + setOf(0xfe)
}

private fun ByteArray.startsWith(prefix: ByteArray) = size >= prefix.size && prefix.indices.all { this[it] == prefix[it] }
private fun ByteArray.u8(offset: Int) = this[offset].toInt() and 0xff
private fun ByteArray.u16be(offset: Int) = (u8(offset) shl 8) or u8(offset + 1)
private fun ByteArray.u16le(offset: Int) = u8(offset) or (u8(offset + 1) shl 8)
private fun ByteArray.u24le(offset: Int) = u8(offset) or (u8(offset + 1) shl 8) or (u8(offset + 2) shl 16)
private fun ByteArray.u32be(offset: Int) = (u8(offset).toLong() shl 24) or (u8(offset + 1).toLong() shl 16) or (u8(offset + 2).toLong() shl 8) or u8(offset + 3).toLong()
private fun ByteArray.u32le(offset: Int) = u8(offset).toLong() or (u8(offset + 1).toLong() shl 8) or (u8(offset + 2).toLong() shl 16) or (u8(offset + 3).toLong() shl 24)
private fun ByteArray.ascii(offset: Int, length: Int) = String(this, offset, length, Charsets.ISO_8859_1)
