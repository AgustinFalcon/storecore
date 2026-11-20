package com.storecore.catalog.media.worker.supply

enum class ImageIoSpiCategory(val wire: String) {
    READER("READER"),
    WRITER("WRITER"),
    INPUT_STREAM("INPUT_STREAM"),
    OUTPUT_STREAM("OUTPUT_STREAM"),
    UNKNOWN("UNKNOWN");

    companion object {
        fun fromWire(raw: String?): ImageIoSpiCategory =
            entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN
    }
}

enum class ImageIoProviderId(val wire: String) {
    JDK_JPEG_READER("com.sun.imageio.plugins.jpeg.JPEGImageReaderSpi"),
    JDK_JPEG_WRITER("com.sun.imageio.plugins.jpeg.JPEGImageWriterSpi"),
    JDK_PNG_READER("com.sun.imageio.plugins.png.PNGImageReaderSpi"),
    JDK_PNG_WRITER("com.sun.imageio.plugins.png.PNGImageWriterSpi"),
    JDK_GIF_READER("com.sun.imageio.plugins.gif.GIFImageReaderSpi"),
    JDK_GIF_WRITER("com.sun.imageio.plugins.gif.GIFImageWriterSpi"),
    JDK_BMP_READER("com.sun.imageio.plugins.bmp.BMPImageReaderSpi"),
    JDK_BMP_WRITER("com.sun.imageio.plugins.bmp.BMPImageWriterSpi"),
    JDK_WBMP_READER("com.sun.imageio.plugins.wbmp.WBMPImageReaderSpi"),
    JDK_WBMP_WRITER("com.sun.imageio.plugins.wbmp.WBMPImageWriterSpi"),
    JDK_TIFF_READER("com.sun.imageio.plugins.tiff.TIFFImageReaderSpi"),
    JDK_TIFF_WRITER("com.sun.imageio.plugins.tiff.TIFFImageWriterSpi"),
    JDK_FILE_INPUT_STREAM("com.sun.imageio.spi.FileImageInputStreamSpi"),
    JDK_INPUT_STREAM("com.sun.imageio.spi.InputStreamImageInputStreamSpi"),
    JDK_RAF_INPUT_STREAM("com.sun.imageio.spi.RAFImageInputStreamSpi"),
    JDK_FILE_OUTPUT_STREAM("com.sun.imageio.spi.FileImageOutputStreamSpi"),
    JDK_OUTPUT_STREAM("com.sun.imageio.spi.OutputStreamImageOutputStreamSpi"),
    JDK_RAF_OUTPUT_STREAM("com.sun.imageio.spi.RAFImageOutputStreamSpi"),
    TM_JPEG_READER("com.twelvemonkeys.imageio.plugins.jpeg.JPEGImageReaderSpi"),
    TM_JPEG_WRITER("com.twelvemonkeys.imageio.plugins.jpeg.JPEGImageWriterSpi"),
    TM_WEBP_READER("com.twelvemonkeys.imageio.plugins.webp.WebPImageReaderSpi"),
    TM_BUFFERED_FILE_INPUT_STREAM("com.twelvemonkeys.imageio.stream.BufferedFileImageInputStreamSpi"),
    TM_BUFFERED_RAF_INPUT_STREAM("com.twelvemonkeys.imageio.stream.BufferedRAFImageInputStreamSpi"),
    TM_BUFFERED_INPUT_STREAM("com.twelvemonkeys.imageio.stream.BufferedInputStreamImageInputStreamSpi"),
    UNKNOWN("UNKNOWN");

    companion object {
        fun fromWire(raw: String?): ImageIoProviderId =
            entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN
    }
}

enum class AllowedComponentLicense(val wire: String) {
    BSD_3_CLAUSE("BSD-3-Clause"),
    TWELVEMONKEYS_BSD("BSD-4-Clause"),
    APACHE_2_0("Apache-2.0"),
    MIT("MIT"),
    UNKNOWN("UNKNOWN");

    companion object {
        fun fromWire(raw: String?): AllowedComponentLicense {
            val normalized = raw?.trim().orEmpty()
            return when {
                normalized.equals("BSD-3-Clause", ignoreCase = true) ||
                    normalized.equals("The BSD License", ignoreCase = true) ||
                    normalized.equals("BSD 3-Clause License", ignoreCase = true) -> BSD_3_CLAUSE
                normalized.equals("BSD-4-Clause", ignoreCase = true) -> TWELVEMONKEYS_BSD
                normalized.equals("Apache-2.0", ignoreCase = true) ||
                    normalized.equals("Apache License, Version 2.0", ignoreCase = true) ||
                    normalized.equals("Apache 2.0", ignoreCase = true) -> APACHE_2_0
                normalized.equals("MIT", ignoreCase = true) ||
                    normalized.equals("MIT License", ignoreCase = true) -> MIT
                else -> UNKNOWN
            }
        }
    }
}

data class ImageIoProviderRecord(val category: ImageIoSpiCategory, val provider: ImageIoProviderId)

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
}

sealed interface ImageIoProviderInventoryResult {
    class Matched private constructor(val providers: Set<ImageIoProviderRecord>) : ImageIoProviderInventoryResult {
        companion object {
            fun create(providers: Set<ImageIoProviderRecord>?): Matched? {
                if (providers == null) return null
                if (providers.any { it.category == ImageIoSpiCategory.UNKNOWN || it.provider == ImageIoProviderId.UNKNOWN }) {
                    return null
                }
                if (providers != ImageIoProviderInventory.imageIoV1Expected) return null
                return Matched(providers.toSet())
            }
        }
    }

    data object Unavailable : ImageIoProviderInventoryResult
    data object Unknown : ImageIoProviderInventoryResult
}
