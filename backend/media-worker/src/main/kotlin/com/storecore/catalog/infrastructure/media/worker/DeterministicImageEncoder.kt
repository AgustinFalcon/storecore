package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.MediaFormat
import com.storecore.catalog.domain.media.PixelDimensions
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.IIOImage
import javax.imageio.ImageTypeSpecifier
import javax.imageio.ImageWriteParam
import javax.imageio.metadata.IIOMetadataNode
import javax.imageio.spi.IIORegistry
import javax.imageio.spi.ImageWriterSpi
import javax.imageio.stream.MemoryCacheImageOutputStream

data class NormalizedRaster(val image: BufferedImage, val alpha: RasterAlpha, val dimensions: PixelDimensions)

object RasterNormalizer {
    fun normalize(decoded: DecodedRaster): NormalizedRaster? {
        val source = decoded.image
        val rotated = decoded.orientation in setOf(
            ExifOrientation.TRANSPOSE, ExifOrientation.ROTATE_90,
            ExifOrientation.TRANSVERSE, ExifOrientation.ROTATE_270,
        )
        val width = if (rotated) source.height else source.width
        val height = if (rotated) source.width else source.height
        val dimensions = PixelDimensions.fromWire(width, height) ?: return null
        val argb = IntArray(width * height)
        var translucent = false
        for (y in 0 until height) for (x in 0 until width) {
            val (sx, sy) = sourceCoordinate(decoded.orientation, x, y, source.width, source.height)
            var pixel = source.getRGB(sx, sy)
            val alpha = pixel ushr 24 and 0xff
            if (alpha != 255) translucent = true
            if (alpha == 0) pixel = 0
            argb[y * width + x] = pixel
        }
        val type = if (translucent) BufferedImage.TYPE_INT_ARGB else BufferedImage.TYPE_3BYTE_BGR
        val output = BufferedImage(width, height, type)
        output.setRGB(0, 0, width, height, argb, 0, width)
        return NormalizedRaster(output, if (translucent) RasterAlpha.TRANSPARENT else RasterAlpha.OPAQUE, dimensions)
    }

    private fun sourceCoordinate(o: ExifOrientation, x: Int, y: Int, w: Int, h: Int): Pair<Int, Int> = when (o) {
        ExifOrientation.NORMAL -> x to y
        ExifOrientation.MIRROR_HORIZONTAL -> (w - 1 - x) to y
        ExifOrientation.ROTATE_180 -> (w - 1 - x) to (h - 1 - y)
        ExifOrientation.MIRROR_VERTICAL -> x to (h - 1 - y)
        ExifOrientation.TRANSPOSE -> y to x
        ExifOrientation.ROTATE_90 -> y to (h - 1 - x)
        ExifOrientation.TRANSVERSE -> (w - 1 - y) to (h - 1 - x)
        ExifOrientation.ROTATE_270 -> (w - 1 - y) to x
        ExifOrientation.UNKNOWN -> throw IllegalArgumentException("unknown orientation")
    }
}

class OutputLimitExceeded : RuntimeException()

class BoundedByteArrayOutputStream(private val maxBytes: Int) : ByteArrayOutputStream() {
    override fun write(b: Int) {
        if (count + 1 > maxBytes) throw OutputLimitExceeded()
        super.write(b)
    }

    override fun write(b: ByteArray, off: Int, len: Int) {
        if (count + len > maxBytes) throw OutputLimitExceeded()
        super.write(b, off, len)
    }
}

class DeterministicImageEncoder {
    fun encode(raster: NormalizedRaster, maxOutputBytes: Long): Pair<MediaFormat, ByteArray>? {
        val format = if (raster.alpha == RasterAlpha.TRANSPARENT) MediaFormat.PNG else MediaFormat.JPEG
        val spi = explicitWriter(format) ?: return null
        val writer = runCatching { spi.createWriterInstance() }.getOrNull() ?: return null
        val cap = maxOutputBytes.toInt().coerceAtMost(Int.MAX_VALUE)
        return try {
            val bytes = BoundedByteArrayOutputStream(cap)
            MemoryCacheImageOutputStream(bytes).use { output ->
                writer.output = output
                val param = writer.defaultWriteParam
                val metadata = when (format) {
                    MediaFormat.JPEG -> {
                        param.compressionMode = ImageWriteParam.MODE_EXPLICIT
                        param.compressionQuality = 0.90f
                        param.progressiveMode = ImageWriteParam.MODE_DISABLED
                        jpeg444Metadata(writer.getDefaultImageMetadata(ImageTypeSpecifier(raster.image), param))
                    }
                    MediaFormat.PNG -> {
                        param.compressionMode = ImageWriteParam.MODE_EXPLICIT
                        param.compressionTypes?.firstOrNull { it.equals("Deflate", true) }?.let { param.compressionType = it }
                        param.compressionQuality = 0.0f
                        null
                    }
                    else -> return null
                }
                writer.write(null, IIOImage(raster.image, null, metadata), param)
                output.flush()
            }
            format to bytes.toByteArray()
        } catch (_: OutputLimitExceeded) {
            throw OutputLimitExceeded()
        } catch (_: Throwable) {
            null
        } finally {
            writer.dispose()
        }
    }

    private fun explicitWriter(format: MediaFormat): ImageWriterSpi? {
        val expected = when (format) {
            MediaFormat.JPEG -> "com.sun.imageio.plugins.jpeg.JPEGImageWriterSpi"
            MediaFormat.PNG -> "com.sun.imageio.plugins.png.PNGImageWriterSpi"
            else -> return null
        }
        val providers = IIORegistry.getDefaultInstance().getServiceProviders(ImageWriterSpi::class.java, true)
        var match: ImageWriterSpi? = null
        while (providers.hasNext()) {
            val candidate = providers.next()
            if (candidate.javaClass.name == expected) {
                if (match != null) return null
                match = candidate
            }
        }
        return match
    }

    private fun jpeg444Metadata(metadata: javax.imageio.metadata.IIOMetadata): javax.imageio.metadata.IIOMetadata {
        val format = "javax_imageio_jpeg_image_1.0"
        val root = metadata.getAsTree(format) as IIOMetadataNode
        val sof = find(root, "sof") ?: return metadata
        for (i in 0 until sof.length) {
            val child = sof.item(i) as? IIOMetadataNode ?: continue
            if (child.nodeName == "componentSpec") {
                child.setAttribute("HsamplingFactor", "1")
                child.setAttribute("VsamplingFactor", "1")
            }
        }
        metadata.setFromTree(format, root)
        return metadata
    }

    private fun find(node: IIOMetadataNode, name: String): IIOMetadataNode? {
        if (node.nodeName == name) return node
        for (i in 0 until node.length) {
            val found = (node.item(i) as? IIOMetadataNode)?.let { find(it, name) }
            if (found != null) return found
        }
        return null
    }
}
