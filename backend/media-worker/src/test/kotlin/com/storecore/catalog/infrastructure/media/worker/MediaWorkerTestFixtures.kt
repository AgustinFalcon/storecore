package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.MediaByteSize
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.domain.media.MediaNormalizationProfile
import java.awt.Color
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID
import java.util.zip.CRC32
import java.util.zip.Deflater
import javax.imageio.ImageIO

internal object MediaWorkerTestFixtures {
    fun image(format: String, alpha: Boolean = false, width: Int = 320, height: Int = 320): ByteArray {
        val type = if (alpha) BufferedImage.TYPE_INT_ARGB else BufferedImage.TYPE_3BYTE_BGR
        val image = BufferedImage(width, height, type)
        for (y in 0 until image.height) for (x in 0 until image.width) {
            val a = if (alpha && x < 40) 0 else if (alpha && x < 80) 128 else 255
            val color = Color((x * 3) and 0xff, (y * 5) and 0xff, (x + y) and 0xff, a)
            image.setRGB(x, y, color.rgb)
        }
        return ByteArrayOutputStream().also { require(ImageIO.write(image, format, it)) }.toByteArray()
    }

    fun request(
        input: ByteArray,
        limits: MediaNormalizationLimits = MediaNormalizationLimits.standard(),
    ): MediaWorkerRequest = requireNotNull(
        MediaWorkerRequest.create(
            UUID.fromString("12345678-1234-5678-9234-567812345678"),
            ByteArray(32) { it.toByte() },
            MediaNormalizationProfile.IMAGE_IO_V1,
            MediaByteSize.fromWire(input.size.toLong()),
            sha256(input),
            limits,
        ),
    )

    fun golden(name: String): ByteArray =
        requireNotNull(javaClass.getResourceAsStream("/goldens/$name")) { "missing golden $name" }.use { it.readAllBytes() }

    fun workspace(root: Path, input: ByteArray): MediaWorkerRequest {
        val request = request(input)
        Files.write(root.resolve("input.bin"), input)
        Files.write(root.resolve("request.bin"), MediaWorkerProtocolCodec.encodeRequest(request))
        return request
    }

    fun withJpegExif(jpeg: ByteArray, orientation: Int): ByteArray {
        val tiff = tiffOrientation(orientation)
        val payload = byteArrayOf(0x45, 0x78, 0x69, 0x66, 0, 0) + tiff
        val app1 = ByteArrayOutputStream().apply {
            write(0xff); write(0xe1)
            write((payload.size + 2) ushr 8); write(payload.size + 2)
            write(payload)
        }.toByteArray()
        return jpeg.copyOfRange(0, 2) + app1 + jpeg.copyOfRange(2, jpeg.size)
    }

    fun withPngExif(png: ByteArray, orientation: Int): ByteArray {
        val ihdrEnd = 8 + 25
        return png.copyOfRange(0, ihdrEnd) + pngChunk("eXIf", tiffOrientation(orientation)) + png.copyOfRange(ihdrEnd, png.size)
    }

    fun pngWithInflatingIccp(): ByteArray {
        val png = image("png")
        val raw = ByteArray(2 * 1024 * 1024)
        val deflater = Deflater(Deflater.BEST_COMPRESSION)
        deflater.setInput(raw)
        deflater.finish()
        val compressed = ByteArray(64 * 1024)
        val size = deflater.deflate(compressed)
        deflater.end()
        val iccp = "bomb".toByteArray() + byteArrayOf(0, 0) + compressed.copyOf(size)
        val ihdrEnd = 8 + 25
        return png.copyOfRange(0, ihdrEnd) + pngChunk("iCCP", iccp) + png.copyOfRange(ihdrEnd, png.size)
    }

    private fun tiffOrientation(orientation: Int): ByteArray {
        val tiff = ByteArray(26)
        tiff[0] = 'I'.code.toByte(); tiff[1] = 'I'.code.toByte()
        tiff[2] = 42; tiff[3] = 0
        tiff[4] = 8
        tiff[8] = 1; tiff[9] = 0
        tiff[10] = 0x12; tiff[11] = 0x01
        tiff[12] = 3; tiff[13] = 0
        tiff[14] = 1
        tiff[18] = orientation.toByte()
        return tiff
    }

    private fun pngChunk(type: String, data: ByteArray): ByteArray {
        val typeBytes = type.toByteArray(Charsets.US_ASCII)
        val crc = CRC32().apply { update(typeBytes); update(data) }.value
        return ByteArrayOutputStream().apply {
            write(data.size ushr 24); write(data.size ushr 16); write(data.size ushr 8); write(data.size)
            write(typeBytes)
            write(data)
            write((crc ushr 24).toInt()); write((crc ushr 16).toInt()); write((crc ushr 8).toInt()); write(crc.toInt())
        }.toByteArray()
    }

    fun structurallyValidUndecodableWebp(): ByteArray {
        // VP8L signature plus 14-bit (width-1), 14-bit (height-1), alpha=0, version=0.
        val payload = byteArrayOf(0x2f, 0x3f, 0xc1.toByte(), 0x4f, 0x00)
        val bytes = ByteArray(12 + 8 + payload.size + 1)
        "RIFF".toByteArray().copyInto(bytes, 0)
        putLe32(bytes, 4, bytes.size - 8)
        "WEBP".toByteArray().copyInto(bytes, 8)
        "VP8L".toByteArray().copyInto(bytes, 12)
        putLe32(bytes, 16, payload.size)
        payload.copyInto(bytes, 20)
        return bytes
    }

    private fun putLe32(target: ByteArray, offset: Int, value: Int) {
        repeat(4) { target[offset + it] = (value ushr (it * 8)).toByte() }
    }
}
