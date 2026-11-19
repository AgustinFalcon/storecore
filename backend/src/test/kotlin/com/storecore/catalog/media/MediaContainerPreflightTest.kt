package com.storecore.catalog.media

import com.storecore.catalog.domain.media.MediaFormat
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.domain.media.MediaNormalizationRejectReason
import com.storecore.catalog.infrastructure.media.MediaContainerPreflight
import com.storecore.catalog.infrastructure.media.MediaContainerPreflightOutcome
import org.junit.jupiter.api.Test
import java.io.ByteArrayOutputStream
import java.util.zip.CRC32
import kotlin.test.assertEquals
import kotlin.test.assertIs

class MediaContainerPreflightTest {
    private val limits = MediaNormalizationLimits.standard()

    @Test
    fun `accepts exact static JPEG PNG and WebP framing at the domain boundary`() {
        accepted(jpeg(800, 600), MediaFormat.JPEG, 800, 600)
        accepted(png(800, 600), MediaFormat.PNG, 800, 600)
        accepted(webpVp8(800, 600), MediaFormat.WEBP, 800, 600)
        accepted(webpVp8l(320, 320), MediaFormat.WEBP, 320, 320)
        accepted(jpeg(800, 600, sofMarker = 0xc2), MediaFormat.JPEG, 800, 600)
    }

    @Test
    fun `rejects unknown truncated and over-input containers fail closed`() {
        rejected("not-an-image".toByteArray(), MediaNormalizationRejectReason.UNSUPPORTED_FORMAT)
        rejected(byteArrayOf(0xff.toByte(), 0xd8.toByte(), 0xff.toByte()), MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(ByteArray(limits.maxInputBytes.value.toInt() + 1).also { it[0] = 0x89.toByte() }, MediaNormalizationRejectReason.INPUT_LIMIT_EXCEEDED)
    }

    @Test
    fun `PNG requires CRC canonical ordering one image and exact EOF`() {
        val valid = png(640, 480)
        rejected(valid.copyOf().also { it[29] = (it[29].toInt() xor 1).toByte() }, MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(valid + byteArrayOf(1), MediaNormalizationRejectReason.TRAILING_DATA)
        rejected(png(640, 480, beforeIdat = listOf(pngChunk("acTL", ByteArray(8)))), MediaNormalizationRejectReason.ANIMATED_MEDIA)

        val ihdr = pngIhdr(640, 480)
        rejected(pngFile(ihdr, ihdr, pngChunk("IDAT", byteArrayOf(0)), pngChunk("IEND", byteArrayOf())), MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(
            pngFile(ihdr, pngChunk("IDAT", byteArrayOf(0)), pngChunk("tEXt", byteArrayOf(1)), pngChunk("IDAT", byteArrayOf(2)), pngChunk("IEND", byteArrayOf())),
            MediaNormalizationRejectReason.CORRUPT_CONTAINER,
        )
        accepted(
            pngFile(ihdr, pngChunk("IDAT", byteArrayOf()), pngChunk("IDAT", byteArrayOf()), pngChunk("IDAT", byteArrayOf(1)), pngChunk("IEND", byteArrayOf())),
            MediaFormat.PNG,
            640,
            480,
        )
    }

    @Test
    fun `PNG applies palette legality and indexed bit depth entry caps`() {
        rejected(
            pngFile(pngIhdr(640, 480, colorType = 0), pngChunk("PLTE", ByteArray(3)), pngChunk("IDAT", byteArrayOf(1)), pngChunk("IEND", byteArrayOf())),
            MediaNormalizationRejectReason.CORRUPT_CONTAINER,
        )
        rejected(
            pngFile(pngIhdr(640, 480, colorType = 4), pngChunk("PLTE", ByteArray(3)), pngChunk("IDAT", byteArrayOf(1)), pngChunk("IEND", byteArrayOf())),
            MediaNormalizationRejectReason.CORRUPT_CONTAINER,
        )
        rejected(
            pngFile(pngIhdr(640, 480, bitDepth = 2, colorType = 3), pngChunk("IDAT", byteArrayOf(1)), pngChunk("IEND", byteArrayOf())),
            MediaNormalizationRejectReason.CORRUPT_CONTAINER,
        )
        rejected(
            pngFile(pngIhdr(640, 480, bitDepth = 2, colorType = 3), pngChunk("PLTE", ByteArray(15)), pngChunk("IDAT", byteArrayOf(1)), pngChunk("IEND", byteArrayOf())),
            MediaNormalizationRejectReason.CORRUPT_CONTAINER,
        )
        accepted(
            pngFile(pngIhdr(640, 480, bitDepth = 2, colorType = 3), pngChunk("PLTE", ByteArray(12)), pngChunk("IDAT", byteArrayOf()), pngChunk("IEND", byteArrayOf())),
            MediaFormat.PNG,
            640,
            480,
        )
    }

    @Test
    fun `PNG rejects chunk floods and metadata beyond typed limits`() {
        val tooMuchMetadata = ByteArray(limits.maxMetadataBytes.value.toInt() + 1)
        rejected(png(640, 480, beforeIdat = listOf(pngChunk("tEXt", tooMuchMetadata))), MediaNormalizationRejectReason.METADATA_LIMIT_EXCEEDED)

        val chunks = List(limits.maxContainerSegments.value) { pngChunk("aaAa", byteArrayOf()) }
        rejected(pngFile(pngIhdr(640, 480), *chunks.toTypedArray(), pngChunk("IDAT", byteArrayOf(0)), pngChunk("IEND", byteArrayOf())), MediaNormalizationRejectReason.METADATA_LIMIT_EXCEEDED)
    }

    @Test
    fun `JPEG rejects MPF additional images malformed marker graphs and trailing data`() {
        rejected(jpeg(640, 480, beforeSof = jpegSegment(0xe2, "MPF\u0000payload".toByteArray())), MediaNormalizationRejectReason.ANIMATED_MEDIA)
        rejected(jpeg(640, 480) + byteArrayOf(0), MediaNormalizationRejectReason.TRAILING_DATA)
        rejected(jpeg(640, 480).dropLast(2).toByteArray(), MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(jpeg(640, 480, duplicateSof = true), MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(jpeg(640, 480, components = 4), MediaNormalizationRejectReason.UNSUPPORTED_COLOR_PROFILE)
        val complete = jpeg(640, 480)
        rejected(injectAfterSoi(complete, byteArrayOf(0xff.toByte(), 0x00, 0x00, 0x02)), MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(injectAfterSoi(complete, byteArrayOf(0xff.toByte(), 0xf0.toByte(), 0x00, 0x02)), MediaNormalizationRejectReason.CORRUPT_CONTAINER)
    }

    @Test
    fun `WebP requires exact RIFF padding one image and rejects animation`() {
        rejected(webpVp8(640, 480) + byteArrayOf(0), MediaNormalizationRejectReason.TRAILING_DATA)
        rejected(webpVp8(640, 480).copyOf().also { it[4] = (it[4] - 1).toByte() }, MediaNormalizationRejectReason.TRAILING_DATA)
        rejected(webpVp8(640, 480).copyOf().also { it[4] = (it[4] + 1).toByte() }, MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(webpExtended(640, 480, flags = 0x02), MediaNormalizationRejectReason.ANIMATED_MEDIA)
        rejected(webpExtended(640, 480, extraChunks = listOf(webpChunk("ANMF", ByteArray(16)))), MediaNormalizationRejectReason.ANIMATED_MEDIA)
        rejected(riff(webpChunk("VP8 ", vp8Payload(640, 480)), webpChunk("VP8 ", vp8Payload(640, 480))), MediaNormalizationRejectReason.CORRUPT_CONTAINER)

        val odd = webpVp8(640, 480, extraPayloadByte = true).copyOf()
        odd[odd.lastIndex] = 1
        rejected(odd, MediaNormalizationRejectReason.CORRUPT_CONTAINER)
    }

    @Test
    fun `WebP extended feature flags exactly match chunks and alpha encoding`() {
        val icc = webpChunk("ICCP", byteArrayOf(1))
        val exif = webpChunk("EXIF", byteArrayOf(2))
        val xmp = webpChunk("XMP ", byteArrayOf(3))
        val alpha = webpChunk("ALPH", byteArrayOf(4))

        rejected(webpExtended(640, 480, beforeImage = listOf(icc)), MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(webpExtended(640, 480, flags = 0x20), MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(webpExtended(640, 480, afterImage = listOf(exif)), MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(webpExtended(640, 480, flags = 0x08), MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(webpExtended(640, 480, afterImage = listOf(xmp)), MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(webpExtended(640, 480, flags = 0x04), MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(webpExtended(640, 480, beforeImage = listOf(alpha)), MediaNormalizationRejectReason.CORRUPT_CONTAINER)
        rejected(webpExtended(640, 480, flags = 0x10), MediaNormalizationRejectReason.CORRUPT_CONTAINER)

        accepted(
            webpExtended(640, 480, flags = 0x3c, beforeImage = listOf(icc, alpha), afterImage = listOf(exif, xmp)),
            MediaFormat.WEBP,
            640,
            480,
        )
        accepted(
            webpExtended(640, 480, flags = 0x0c, afterImage = listOf(xmp, exif)),
            MediaFormat.WEBP,
            640,
            480,
        )
        accepted(
            webpExtended(640, 480, flags = 0x0c, beforeImage = listOf(exif, xmp)),
            MediaFormat.WEBP,
            640,
            480,
        )
        accepted(
            webpExtended(640, 480, flags = 0x0c, beforeImage = listOf(xmp, exif)),
            MediaFormat.WEBP,
            640,
            480,
        )
        accepted(
            webpExtended(640, 480, flags = 0x3c, beforeImage = listOf(xmp, exif, icc, alpha)),
            MediaFormat.WEBP,
            640,
            480,
        )
        rejected(
            webpExtended(640, 480, flags = 0x30, beforeImage = listOf(alpha, icc)),
            MediaNormalizationRejectReason.CORRUPT_CONTAINER,
        )
        rejected(
            webpExtended(640, 480, flags = 0x20, beforeImage = listOf(icc, icc)),
            MediaNormalizationRejectReason.CORRUPT_CONTAINER,
        )
        rejected(
            webpExtended(640, 480, flags = 0x08, afterImage = listOf(exif, exif)),
            MediaNormalizationRejectReason.CORRUPT_CONTAINER,
        )
        rejected(
            webpExtended(640, 480, flags = 0x04, afterImage = listOf(xmp, xmp)),
            MediaNormalizationRejectReason.CORRUPT_CONTAINER,
        )
        accepted(
            webpExtended(640, 480, flags = 0x10, image = webpChunk("VP8L", vp8lPayload(640, 480, hasAlpha = true))),
            MediaFormat.WEBP,
            640,
            480,
        )
        rejected(
            webpExtended(640, 480, image = webpChunk("VP8L", vp8lPayload(640, 480, hasAlpha = true))),
            MediaNormalizationRejectReason.CORRUPT_CONTAINER,
        )
        rejected(
            webpExtended(640, 480, flags = 0x10, beforeImage = listOf(alpha), image = webpChunk("VP8L", vp8lPayload(640, 480, hasAlpha = true))),
            MediaNormalizationRejectReason.CORRUPT_CONTAINER,
        )
    }

    @Test
    fun `all formats delegate side and pixel policy to domain limits`() {
        rejected(png(319, 320), MediaNormalizationRejectReason.INVALID_DIMENSIONS)
        rejected(jpeg(6001, 320), MediaNormalizationRejectReason.INVALID_DIMENSIONS)
        rejected(webpVp8(5000, 4000), MediaNormalizationRejectReason.PIXEL_LIMIT_EXCEEDED)
    }

    @Test
    fun `rejected outcome cannot manufacture Unknown or bypass its factory with copy`() {
        assertEquals(null, MediaContainerPreflightOutcome.Rejected.create(MediaNormalizationRejectReason.UNKNOWN))
        assertEquals(
            false,
            MediaContainerPreflightOutcome.Rejected::class.java.declaredMethods.any { it.name.startsWith("copy") },
        )
    }

    private fun accepted(bytes: ByteArray, format: MediaFormat, width: Int, height: Int) {
        val outcome = assertIs<MediaContainerPreflightOutcome.Accepted>(MediaContainerPreflight.inspect(bytes, limits))
        assertEquals(format, outcome.format)
        assertEquals(width, outcome.dimensions.width)
        assertEquals(height, outcome.dimensions.height)
    }

    private fun rejected(bytes: ByteArray, reason: MediaNormalizationRejectReason) {
        val outcome = assertIs<MediaContainerPreflightOutcome.Rejected>(MediaContainerPreflight.inspect(bytes, limits))
        assertEquals(reason, outcome.reason)
    }

    private fun png(width: Int, height: Int, beforeIdat: List<ByteArray> = emptyList()) = pngFile(
        pngIhdr(width, height), *beforeIdat.toTypedArray(), pngChunk("IDAT", byteArrayOf(0)), pngChunk("IEND", byteArrayOf()),
    )

    private fun pngIhdr(width: Int, height: Int, bitDepth: Int = 8, colorType: Int = 6): ByteArray {
        val data = ByteArrayOutputStream().apply {
            writeBe32(width); writeBe32(height); write(byteArrayOf(bitDepth.toByte(), colorType.toByte(), 0, 0, 0))
        }.toByteArray()
        return pngChunk("IHDR", data)
    }

    private fun pngFile(vararg chunks: ByteArray) = PNG_SIGNATURE + chunks.fold(byteArrayOf()) { all, chunk -> all + chunk }

    private fun pngChunk(type: String, data: ByteArray): ByteArray {
        val typeBytes = type.toByteArray(Charsets.US_ASCII)
        val crc = CRC32().apply { update(typeBytes); update(data) }.value
        return ByteArrayOutputStream().apply {
            writeBe32(data.size); write(typeBytes); write(data); writeBe32(crc.toInt())
        }.toByteArray()
    }

    private fun jpeg(
        width: Int,
        height: Int,
        sofMarker: Int = 0xc0,
        components: Int = 3,
        beforeSof: ByteArray = byteArrayOf(),
        duplicateSof: Boolean = false,
    ): ByteArray {
        val sofData = ByteArrayOutputStream().apply {
            write(8); writeBe16(height); writeBe16(width); write(components)
            repeat(components) { index -> write(index + 1); write(0x11); write(0) }
        }.toByteArray()
        val sof = jpegSegment(sofMarker, sofData)
        val sosData = ByteArrayOutputStream().apply {
            write(components); repeat(components) { index -> write(index + 1); write(0) }; write(byteArrayOf(0, 63, 0))
        }.toByteArray()
        return JPEG_SIGNATURE + beforeSof + sof + (if (duplicateSof) sof else byteArrayOf()) +
            jpegSegment(0xda, sosData) + byteArrayOf(0x11, 0xff.toByte(), 0x00, 0xff.toByte(), 0xd9.toByte())
    }

    private fun jpegSegment(marker: Int, data: ByteArray) = ByteArrayOutputStream().apply {
        write(0xff); write(marker); writeBe16(data.size + 2); write(data)
    }.toByteArray()

    private fun injectAfterSoi(jpeg: ByteArray, injected: ByteArray): ByteArray =
        jpeg.copyOfRange(0, 2) + injected + jpeg.copyOfRange(2, jpeg.size)

    private fun webpVp8(width: Int, height: Int, extraPayloadByte: Boolean = false) =
        riff(webpChunk("VP8 ", vp8Payload(width, height) + if (extraPayloadByte) byteArrayOf(0) else byteArrayOf()))

    private fun vp8Payload(width: Int, height: Int) = byteArrayOf(
        0, 0, 0, 0x9d.toByte(), 0x01, 0x2a, width.toByte(), (width ushr 8).toByte(), height.toByte(), (height ushr 8).toByte(),
    )

    private fun webpVp8l(width: Int, height: Int): ByteArray {
        return riff(webpChunk("VP8L", vp8lPayload(width, height)))
    }

    private fun vp8lPayload(width: Int, height: Int, hasAlpha: Boolean = false): ByteArray {
        val bits = (width - 1).toLong() or ((height - 1).toLong() shl 14) or (if (hasAlpha) 1L shl 28 else 0L)
        return byteArrayOf(0x2f, bits.toByte(), (bits ushr 8).toByte(), (bits ushr 16).toByte(), (bits ushr 24).toByte())
    }

    private fun webpExtended(
        width: Int,
        height: Int,
        flags: Int = 0,
        beforeImage: List<ByteArray> = emptyList(),
        image: ByteArray = webpChunk("VP8 ", vp8Payload(width, height)),
        afterImage: List<ByteArray> = emptyList(),
        extraChunks: List<ByteArray> = emptyList(),
    ): ByteArray {
        val header = ByteArrayOutputStream().apply {
            write(flags); write(byteArrayOf(0, 0, 0)); writeLe24(width - 1); writeLe24(height - 1)
        }.toByteArray()
        return riff(webpChunk("VP8X", header), *beforeImage.toTypedArray(), image, *afterImage.toTypedArray(), *extraChunks.toTypedArray())
    }

    private fun riff(vararg chunks: ByteArray): ByteArray {
        val body = "WEBP".toByteArray() + chunks.fold(byteArrayOf()) { all, chunk -> all + chunk }
        return ByteArrayOutputStream().apply { write("RIFF".toByteArray()); writeLe32(body.size); write(body) }.toByteArray()
    }

    private fun webpChunk(type: String, data: ByteArray) = ByteArrayOutputStream().apply {
        write(type.toByteArray()); writeLe32(data.size); write(data); if (data.size % 2 != 0) write(0)
    }.toByteArray()

    private fun ByteArrayOutputStream.writeBe16(value: Int) { write(value ushr 8); write(value) }
    private fun ByteArrayOutputStream.writeBe32(value: Int) { writeBe32(value.toLong()) }
    private fun ByteArrayOutputStream.writeBe32(value: Long) { write((value ushr 24).toInt()); write((value ushr 16).toInt()); write((value ushr 8).toInt()); write(value.toInt()) }
    private fun ByteArrayOutputStream.writeLe24(value: Int) { write(value); write(value ushr 8); write(value ushr 16) }
    private fun ByteArrayOutputStream.writeLe32(value: Int) { write(value); write(value ushr 8); write(value ushr 16); write(value ushr 24) }

    companion object {
        private val PNG_SIGNATURE = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
        private val JPEG_SIGNATURE = byteArrayOf(0xff.toByte(), 0xd8.toByte())
    }
}
