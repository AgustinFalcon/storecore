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
    fun decode(
        bytes: ByteArray,
        format: MediaFormat,
        expected: PixelDimensions,
        maxMetadataBytes: Long,
    ): RasterDecodeResult {
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
                when (EmbeddedColorProfile.inspect(bytes, format, maxMetadataBytes)) {
                    ProfileInspection.Unsupported ->
                        return RasterDecodeResult.Rejected(MediaNormalizationRejectReason.UNSUPPORTED_COLOR_PROFILE)
                    ProfileInspection.LimitExceeded ->
                        return RasterDecodeResult.Rejected(MediaNormalizationRejectReason.METADATA_LIMIT_EXCEEDED)
                    ProfileInspection.Corrupt ->
                        return RasterDecodeResult.Rejected(MediaNormalizationRejectReason.CORRUPT_CONTAINER)
                    ProfileInspection.Absent, ProfileInspection.Srgb -> Unit
                }
                if (rawSpace?.type == ColorSpace.TYPE_CMYK ||
                    (rawSpace is ICC_ColorSpace && !rawSpace.isCS_sRGB && rawSpace.type != ColorSpace.TYPE_GRAY)
                ) {
                    return RasterDecodeResult.Rejected(MediaNormalizationRejectReason.UNSUPPORTED_COLOR_PROFILE)
                }
                val orientation = ExifOrientationReader.read(bytes, format)
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

internal sealed interface ProfileInspection {
    data object Absent : ProfileInspection
    data object Srgb : ProfileInspection
    data object Unsupported : ProfileInspection
    data object LimitExceeded : ProfileInspection
    data object Corrupt : ProfileInspection
}

private object EmbeddedColorProfile {
    private val JPEG_ICC = "ICC_PROFILE\u0000".toByteArray(Charsets.ISO_8859_1)
    private val SRGB = ICC_Profile.getInstance(ColorSpace.CS_sRGB).data

    /*
     * IMAGE_IO_V1 does not perform color conversion. Profiles whose identity
     * cannot be proven without conversion fail closed; absent profiles use
     * the profile's documented sRGB interpretation.
     */
    fun inspect(bytes: ByteArray, format: MediaFormat, maxMetadataBytes: Long): ProfileInspection {
        if (format == MediaFormat.UNKNOWN) return ProfileInspection.Unsupported
        val profile = runCatching {
            when (format) {
                MediaFormat.JPEG -> jpegProfile(bytes)
                MediaFormat.PNG -> pngProfile(bytes, maxMetadataBytes)
                MediaFormat.WEBP -> webpProfile(bytes)
                MediaFormat.UNKNOWN -> return ProfileInspection.Unsupported
            }
        }.getOrElse { error ->
            return if (error is MetadataLimitExceeded) ProfileInspection.LimitExceeded else ProfileInspection.Corrupt
        } ?: return ProfileInspection.Absent
        if (profile.size.toLong() > maxMetadataBytes) return ProfileInspection.LimitExceeded
        return if (profile.contentEquals(SRGB)) ProfileInspection.Srgb else ProfileInspection.Unsupported
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

    private fun pngProfile(bytes: ByteArray, maxMetadataBytes: Long): ByteArray? {
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
                return inflateBounded(bytes, zero + 2, end - zero - 2, maxMetadataBytes)
            }
            offset += 12 + size
        }
        return null
    }

    private fun inflateBounded(bytes: ByteArray, offset: Int, length: Int, maxBytes: Long): ByteArray {
        val cap = maxBytes.toInt().coerceAtMost(Int.MAX_VALUE)
        return InflaterInputStream(ByteArrayInputStream(bytes, offset, length)).use { inflater ->
            val out = ByteArrayOutputStream()
            val buffer = ByteArray(4_096)
            var total = 0
            while (true) {
                val count = inflater.read(buffer)
                if (count < 0) break
                total += count
                if (total > cap) throw MetadataLimitExceeded()
                out.write(buffer, 0, count)
            }
            out.toByteArray()
        }
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

internal class MetadataLimitExceeded : RuntimeException()

private object ExifOrientationReader {
    private val EXIF = byteArrayOf(0x45, 0x78, 0x69, 0x66, 0, 0)

    fun read(bytes: ByteArray, format: MediaFormat): ExifOrientation {
        val payloads = when (format) {
            MediaFormat.JPEG -> jpegExifPayloads(bytes)
            MediaFormat.PNG -> pngExifPayloads(bytes)
            MediaFormat.WEBP -> webpExifPayloads(bytes)
            MediaFormat.UNKNOWN -> return ExifOrientation.UNKNOWN
        } ?: return ExifOrientation.UNKNOWN
        if (payloads.isEmpty()) return ExifOrientation.NORMAL
        val values = payloads.map { payload ->
            parseTiff(payload, tiffBase(payload)) ?: return ExifOrientation.UNKNOWN
        }.distinct()
        return if (values.size == 1) ExifOrientation.fromWire(values.single()) else ExifOrientation.UNKNOWN
    }

    private fun tiffBase(payload: ByteArray): Int =
        if (payload.size >= EXIF.size && EXIF.indices.all { payload[it] == EXIF[it] }) EXIF.size else 0

    private fun jpegExifPayloads(bytes: ByteArray): List<ByteArray>? {
        val payloads = mutableListOf<ByteArray>()
        var offset = 2
        while (offset + 4 <= bytes.size) {
            if (bytes[offset].toInt() and 0xff != 0xff) return null
            while (offset < bytes.size && bytes[offset].toInt() and 0xff == 0xff) offset++
            if (offset >= bytes.size) return null
            val marker = bytes[offset++].toInt() and 0xff
            if (marker == 0xda || marker == 0xd9) break
            if (marker in 0xd0..0xd8 || marker == 0x01) continue
            if (offset + 2 > bytes.size) return null
            val length = ((bytes[offset].toInt() and 0xff) shl 8) or (bytes[offset + 1].toInt() and 0xff)
            if (length < 2 || offset + length > bytes.size) return null
            if (marker == 0xe1 && length - 2 >= EXIF.size &&
                EXIF.indices.all { bytes[offset + 2 + it] == EXIF[it] }
            ) {
                payloads += bytes.copyOfRange(offset + 2, offset + length)
            }
            offset += length
        }
        return payloads
    }

    private fun pngExifPayloads(bytes: ByteArray): List<ByteArray>? {
        if (bytes.size < 8) return null
        val payloads = mutableListOf<ByteArray>()
        var offset = 8
        while (offset + 12 <= bytes.size) {
            val length = ((bytes[offset].toLong() and 0xff) shl 24) or ((bytes[offset + 1].toLong() and 0xff) shl 16) or
                ((bytes[offset + 2].toLong() and 0xff) shl 8) or (bytes[offset + 3].toLong() and 0xff)
            if (length > Int.MAX_VALUE || offset.toLong() + 12 + length > bytes.size) return null
            val type = String(bytes, offset + 4, 4, Charsets.US_ASCII)
            if (type == "eXIf") {
                payloads += bytes.copyOfRange(offset + 8, offset + 8 + length.toInt())
            }
            offset += 12 + length.toInt()
        }
        return payloads
    }

    private fun webpExifPayloads(bytes: ByteArray): List<ByteArray>? {
        if (bytes.size < 12) return null
        val payloads = mutableListOf<ByteArray>()
        var offset = 12
        while (offset + 8 <= bytes.size) {
            val size = (bytes[offset + 4].toLong() and 0xff) or ((bytes[offset + 5].toLong() and 0xff) shl 8) or
                ((bytes[offset + 6].toLong() and 0xff) shl 16) or ((bytes[offset + 7].toLong() and 0xff) shl 24)
            if (size > Int.MAX_VALUE || offset.toLong() + 8 + size > bytes.size) return null
            if (String(bytes, offset, 4, Charsets.US_ASCII) == "EXIF") {
                payloads += bytes.copyOfRange(offset + 8, offset + 8 + size.toInt())
            }
            offset += 8 + size.toInt() + (size.toInt() and 1)
        }
        return payloads
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
