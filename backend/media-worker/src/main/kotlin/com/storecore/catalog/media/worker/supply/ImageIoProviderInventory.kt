package com.storecore.catalog.media.worker.supply

import javax.imageio.spi.IIORegistry
import javax.imageio.spi.ImageInputStreamSpi
import javax.imageio.spi.ImageOutputStreamSpi
import javax.imageio.spi.ImageReaderSpi
import javax.imageio.spi.ImageWriterSpi

object ImageIoProviderInventory {
    val imageIoV1Expected: Set<ImageIoProviderRecord> = setOf(
        ImageIoProviderRecord(ImageIoSpiCategory.READER, ImageIoProviderId.JDK_JPEG_READER),
        ImageIoProviderRecord(ImageIoSpiCategory.WRITER, ImageIoProviderId.JDK_JPEG_WRITER),
        ImageIoProviderRecord(ImageIoSpiCategory.READER, ImageIoProviderId.JDK_PNG_READER),
        ImageIoProviderRecord(ImageIoSpiCategory.WRITER, ImageIoProviderId.JDK_PNG_WRITER),
        ImageIoProviderRecord(ImageIoSpiCategory.READER, ImageIoProviderId.JDK_GIF_READER),
        ImageIoProviderRecord(ImageIoSpiCategory.WRITER, ImageIoProviderId.JDK_GIF_WRITER),
        ImageIoProviderRecord(ImageIoSpiCategory.READER, ImageIoProviderId.JDK_BMP_READER),
        ImageIoProviderRecord(ImageIoSpiCategory.WRITER, ImageIoProviderId.JDK_BMP_WRITER),
        ImageIoProviderRecord(ImageIoSpiCategory.READER, ImageIoProviderId.JDK_WBMP_READER),
        ImageIoProviderRecord(ImageIoSpiCategory.WRITER, ImageIoProviderId.JDK_WBMP_WRITER),
        ImageIoProviderRecord(ImageIoSpiCategory.READER, ImageIoProviderId.JDK_TIFF_READER),
        ImageIoProviderRecord(ImageIoSpiCategory.WRITER, ImageIoProviderId.JDK_TIFF_WRITER),
        ImageIoProviderRecord(ImageIoSpiCategory.INPUT_STREAM, ImageIoProviderId.JDK_FILE_INPUT_STREAM),
        ImageIoProviderRecord(ImageIoSpiCategory.INPUT_STREAM, ImageIoProviderId.JDK_INPUT_STREAM),
        ImageIoProviderRecord(ImageIoSpiCategory.INPUT_STREAM, ImageIoProviderId.JDK_RAF_INPUT_STREAM),
        ImageIoProviderRecord(ImageIoSpiCategory.OUTPUT_STREAM, ImageIoProviderId.JDK_FILE_OUTPUT_STREAM),
        ImageIoProviderRecord(ImageIoSpiCategory.OUTPUT_STREAM, ImageIoProviderId.JDK_OUTPUT_STREAM),
        ImageIoProviderRecord(ImageIoSpiCategory.OUTPUT_STREAM, ImageIoProviderId.JDK_RAF_OUTPUT_STREAM),
        ImageIoProviderRecord(ImageIoSpiCategory.READER, ImageIoProviderId.TM_JPEG_READER),
        ImageIoProviderRecord(ImageIoSpiCategory.WRITER, ImageIoProviderId.TM_JPEG_WRITER),
        ImageIoProviderRecord(ImageIoSpiCategory.READER, ImageIoProviderId.TM_WEBP_READER),
        ImageIoProviderRecord(ImageIoSpiCategory.INPUT_STREAM, ImageIoProviderId.TM_BUFFERED_FILE_INPUT_STREAM),
        ImageIoProviderRecord(ImageIoSpiCategory.INPUT_STREAM, ImageIoProviderId.TM_BUFFERED_RAF_INPUT_STREAM),
        ImageIoProviderRecord(ImageIoSpiCategory.INPUT_STREAM, ImageIoProviderId.TM_BUFFERED_INPUT_STREAM),
    )

    fun evaluate(observed: List<ObservedSpi> = observeRegistry()): ImageIoProviderInventoryResult {
        if (observed.isEmpty()) return ImageIoProviderInventoryResult.Unavailable
        val mapped = observed.map { record ->
            ImageIoProviderRecord(
                ImageIoSpiCategory.fromWire(record.category.wire),
                ImageIoProviderId.fromWire(record.className),
            )
        }
        if (mapped.any { it.category == ImageIoSpiCategory.UNKNOWN || it.provider == ImageIoProviderId.UNKNOWN }) {
            return ImageIoProviderInventoryResult.Unknown
        }
        val unique = mapped.toSet()
        if (unique.size != mapped.size) return ImageIoProviderInventoryResult.Unavailable
        return if (unique == imageIoV1Expected) {
            requireNotNull(ImageIoProviderInventoryResult.Matched.create(unique))
        } else {
            ImageIoProviderInventoryResult.Unavailable
        }
    }

    fun observeRegistry(): List<ObservedSpi> {
        val registry = IIORegistry.getDefaultInstance()
        return listOf(
            ImageIoSpiCategory.READER to ImageReaderSpi::class.java,
            ImageIoSpiCategory.WRITER to ImageWriterSpi::class.java,
            ImageIoSpiCategory.INPUT_STREAM to ImageInputStreamSpi::class.java,
            ImageIoSpiCategory.OUTPUT_STREAM to ImageOutputStreamSpi::class.java,
        ).flatMap { (category, type) ->
            providers(registry, type).map { spi -> ObservedSpi(category, spi.javaClass.name) }
        }
    }

    data class ObservedSpi(val category: ImageIoSpiCategory, val className: String)

    private fun <T : Any> providers(registry: IIORegistry, type: Class<T>): List<T> {
        val result = mutableListOf<T>()
        val iterator = registry.getServiceProviders(type, true)
        while (iterator.hasNext()) {
            result.add(iterator.next())
        }
        return result
    }
}
