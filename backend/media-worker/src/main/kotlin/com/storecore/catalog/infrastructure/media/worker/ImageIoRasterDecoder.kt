package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.MediaFormat
import com.storecore.catalog.domain.media.MediaNormalizationRejectReason
import com.storecore.catalog.domain.media.PixelDimensions
import java.awt.color.ColorSpace
import java.awt.color.ICC_ColorSpace
import java.awt.color.ICC_Profile
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.zip.InflaterInputStream
import javax.imageio.spi.IIORegistry
import javax.imageio.spi.ImageReaderSpi
import javax.imageio.stream.MemoryCacheImageInputStream

class ImageIoRasterDecoder {
    fun decode(bytes: ByteArray, format: MediaFormat, expected: PixelDimensions): RasterDecodeResult {
        val spi = explicitReader(format) ?: return RasterDecodeResult.Unknown
        val reader = runCatching { spi.createReaderInstance() }.getOrNull() ?: return RasterDecodeResult.Unknown
        return try {
            MemoryCacheImageInputStream(ByteArrayInputStream(bytes)).use { stream ->
                reader.input = stream
                val frames = runCatching { reader.getNumImages(true) }.getOrElse {
                    return RasterDecodeResult.Rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER)
                }
                if (frames != 1) {
                    return RasterDecodeResult.Rejected(
                        if (frames > 1) MediaNormalizationRejectReason.ANIMATED_MEDIA
                        else MediaNormalizationRejectReason.CORRUPT_CONTAINER,
                    )
                }
                if (reader.getWidth(0) != expected.width || reader.getHeight(0) != expected.height) {
                    return RasterDecodeResult.Rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER)
                }
                val rawType = reader.getRawImageType(0)
                val rawSpace = rawType?.colorModel?.colorSpace
                if (rawSpace?.type == ColorSpace.TYPE_CMYK ||
                    (rawSpace is ICC_ColorSpace && !rawSpace.isCS_sRGB && rawSpace.type != ColorSpace.TYPE_GRAY) ||
                    EmbeddedColorProfile.hasUnsupportedProfile(bytes, format)
                ) {
                    return RasterDecodeResult.Rejected(MediaNormalizationRejectReason.UNSUPPORTED_COLOR_PROFILE)
                }
                val orientation = ExifOrientationReader.read(bytes)
                if (orientation == ExifOrientation.UNKNOWN) {
                    return RasterDecodeResult.Rejected(MediaNormalizationRejectReason.NORMALIZATION_FAILED)
                }
                val image = runCatching { reader.read(0) }.getOrElse {
                    return RasterDecodeResult.Rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER)
                } ?: return RasterDecodeResult.Rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER)
                val decodedColor = classifyColor(image.colorModel.colorSpace)
                if (decodedColor == RasterColor.UNKNOWN) {
                    return RasterDecodeResult.Rejected(MediaNormalizationRejectReason.UNSUPPORTED_COLOR_PROFILE)
                }
                RasterDecodeResult.Decoded(DecodedRaster(image, expected, orientation, decodedColor))
            }
        } catch (_: Throwable) {
            RasterDecodeResult.Rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        } finally {
            reader.dispose()
        }
    }

    private fun explicitReader(format: MediaFormat): ImageReaderSpi? {
        val expectedClass = when (format) {
            MediaFormat.JPEG -> "com.twelvemonkeys.imageio.plugins.jpeg.JPEGImageReaderSpi"
            MediaFormat.PNG -> "com.sun.imageio.plugins.png.PNGImageReaderSpi"
            MediaFormat.WEBP -> "com.twelvemonkeys.imageio.plugins.webp.WebPImageReaderSpi"
            MediaFormat.UNKNOWN -> return null
        }
        val providers = IIORegistry.getDefaultInstance().getServiceProviders(ImageReaderSpi::class.java, true)
        var match: ImageReaderSpi? = null
        while (providers.hasNext()) {
            val candidate = providers.next()
            if (candidate.javaClass.name == expectedClass) {
                if (match != null) return null
                match = candidate
            }
        }
        return match
    }

    private fun classifyColor(colorSpace: ColorSpace): RasterColor =
        if (colorSpace.isCS_sRGB || colorSpace.type == ColorSpace.TYPE_GRAY) RasterColor.SRGB else RasterColor.UNKNOWN
}

private object EmbeddedColorProfile {
    private val JPEG_ICC = "ICC_PROFILE\u0000".toByteArray(Charsets.ISO_8859_1)
    private val SRGB = ICC_Profile.getInstance(ColorSpace.CS_sRGB).data

    /*
     * IMAGE_IO_V1 does not perform color conversion. Profiles whose identity
     * cannot be proven without conversion fail closed; absent profiles use
     * the profile's documented sRGB interpretation.
     */
    fun hasUnsupportedProfile(bytes: ByteArray, format: MediaFormat): Boolean {
        val profile = runCatching {
            when (format) {
                MediaFormat.JPEG -> jpegProfile(bytes)
                MediaFormat.PNG -> pngProfile(bytes)
                MediaFormat.WEBP -> webpProfile(bytes)
                MediaFormat.UNKNOWN -> return true
            }
        }.getOrElse { return true } ?: return false
        return !profile.contentEquals(SRGB)
    }

    private fun jpegProfile(bytes: ByteArray): ByteArray? {
        var offset = 2
        val chunks = sortedMapOf<Int, ByteArray>()
        var declaredCount: Int? = null
        while (offset + 4 <= bytes.size) {
            if (bytes[offset++].toInt() and 0xff != 0xff) return null
            while (offset < bytes.size && bytes[offset].toInt() and 0xff == 0xff) offset++
            if (offset >= bytes.size) return null
            val marker = bytes[offset++].toInt() and 0xff
            if (marker == 0xda || marker == 0xd9) break
            if (marker in 0xd0..0xd8 || marker == 0x01) continue
            if (offset + 2 > bytes.size) return null
            val length = u16be(bytes, offset)
            if (length < 2 || offset + length > bytes.size) return null
            val dataAt = offset + 2
            val dataSize = length - 2
            if (marker == 0xe2 && dataSize >= JPEG_ICC.size + 2 &&
                JPEG_ICC.indices.all { bytes[dataAt + it] == JPEG_ICC[it] }
            ) {
                val sequence = bytes[dataAt + JPEG_ICC.size].toInt() and 0xff
                val count = bytes[dataAt + JPEG_ICC.size + 1].toInt() and 0xff
                if (sequence !in 1..count || count == 0 || (declaredCount != null && declaredCount != count)) throw IllegalArgumentException()
                declaredCount = count
                if (chunks.put(sequence, bytes.copyOfRange(dataAt + JPEG_ICC.size + 2, offset + length)) != null) throw IllegalArgumentException()
            }
            offset += length
        }
        val count = declaredCount ?: return null
        if (chunks.keys != (1..count).toSet()) throw IllegalArgumentException()
        return ByteArrayOutputStream().also { out -> chunks.values.forEach(out::write) }.toByteArray()
    }

    private fun pngProfile(bytes: ByteArray): ByteArray? {
        var offset = 8
        while (offset + 12 <= bytes.size) {
            val length = u32be(bytes, offset)
            if (length > Int.MAX_VALUE || offset.toLong() + 12 + length > bytes.size) throw IllegalArgumentException()
            val size = length.toInt()
            val type = String(bytes, offset + 4, 4, Charsets.US_ASCII)
            if (type == "iCCP") {
                val start = offset + 8
                val end = start + size
                val zero = (start until end).firstOrNull { bytes[it] == 0.toByte() } ?: throw IllegalArgumentException()
                if (zero == start || zero + 2 > end || bytes[zero + 1] != 0.toByte()) throw IllegalArgumentException()
                return InflaterInputStream(ByteArrayInputStream(bytes, zero + 2, end - zero - 2)).use { it.readAllBytes() }
            }
            offset += 12 + size
        }
        return null
    }

    private fun webpProfile(bytes: ByteArray): ByteArray? {
        var offset = 12
        while (offset + 8 <= bytes.size) {
            val size = u32le(bytes, offset + 4)
            if (size > Int.MAX_VALUE || offset.toLong() + 8 + size > bytes.size) throw IllegalArgumentException()
            if (String(bytes, offset, 4, Charsets.US_ASCII) == "ICCP") {
                return bytes.copyOfRange(offset + 8, offset + 8 + size.toInt())
            }
            offset += 8 + size.toInt() + (size.toInt() and 1)
        }
        return null
    }

    private fun u16be(bytes: ByteArray, at: Int) =
        ((bytes[at].toInt() and 0xff) shl 8) or (bytes[at + 1].toInt() and 0xff)
    private fun u32be(bytes: ByteArray, at: Int): Long =
        ((bytes[at].toLong() and 0xff) shl 24) or ((bytes[at + 1].toLong() and 0xff) shl 16) or
            ((bytes[at + 2].toLong() and 0xff) shl 8) or (bytes[at + 3].toLong() and 0xff)
    private fun u32le(bytes: ByteArray, at: Int): Long =
        (bytes[at].toLong() and 0xff) or ((bytes[at + 1].toLong() and 0xff) shl 8) or
            ((bytes[at + 2].toLong() and 0xff) shl 16) or ((bytes[at + 3].toLong() and 0xff) shl 24)
}

private object ExifOrientationReader {
    private val EXIF = byteArrayOf(0x45, 0x78, 0x69, 0x66, 0, 0)

    fun read(bytes: ByteArray): ExifOrientation {
        val starts = mutableListOf<Int>()
        var index = 0
        while (index <= bytes.size - EXIF.size) {
            if (EXIF.indices.all { bytes[index + it] == EXIF[it] }) starts += index + EXIF.size
            index++
        }
        if (starts.isEmpty()) return ExifOrientation.NORMAL
        val values = starts.map { parseTiff(bytes, it) ?: return ExifOrientation.UNKNOWN }.distinct()
        return if (values.size == 1) ExifOrientation.fromWire(values.single()) else ExifOrientation.UNKNOWN
    }

    private fun parseTiff(bytes: ByteArray, base: Int): Int? {
        if (base + 8 > bytes.size) return null
        val little = when (String(bytes, base, 2, Charsets.US_ASCII)) { "II" -> true; "MM" -> false; else -> return null }
        if (u16(bytes, base + 2, little) != 42) return null
        val ifdOffset = u32(bytes, base + 4, little) ?: return null
        val ifd = base.toLong() + ifdOffset
        if (ifd < base || ifd + 2 > bytes.size) return null
        val count = u16(bytes, ifd.toInt(), little)
        if (count > 4_096) return null
        var orientation: Int? = null
        repeat(count) { entry ->
            val at = ifd + 2 + entry * 12L
            if (at + 12 > bytes.size) return null
            if (u16(bytes, at.toInt(), little) == 0x0112) {
                if (u16(bytes, at.toInt() + 2, little) != 3 || u32(bytes, at.toInt() + 4, little) != 1L) return null
                val value = u16(bytes, at.toInt() + 8, little)
                if (orientation != null && orientation != value) return null
                orientation = value
            }
        }
        return orientation ?: 1
    }

    private fun u16(bytes: ByteArray, at: Int, little: Boolean): Int {
        val a = bytes[at].toInt() and 0xff; val b = bytes[at + 1].toInt() and 0xff
        return if (little) a or (b shl 8) else (a shl 8) or b
    }
    private fun u32(bytes: ByteArray, at: Int, little: Boolean): Long? {
        if (at < 0 || at + 4 > bytes.size) return null
        val values = LongArray(4) { bytes[at + it].toLong() and 0xff }
        return if (little) values[0] or (values[1] shl 8) or (values[2] shl 16) or (values[3] shl 24)
        else (values[0] shl 24) or (values[1] shl 16) or (values[2] shl 8) or values[3]
    }
}
