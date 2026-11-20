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
