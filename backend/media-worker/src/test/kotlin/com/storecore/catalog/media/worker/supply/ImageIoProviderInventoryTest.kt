package com.storecore.catalog.media.worker.supply

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ImageIoProviderInventoryTest {
    @Test
    fun `closed translators map unknown names to Unknown`() {
        assertEquals(ImageIoProviderId.UNKNOWN, ImageIoProviderId.fromWire(null))
        assertEquals(ImageIoProviderId.UNKNOWN, ImageIoProviderId.fromWire("com.example.EvilSpi"))
        assertEquals(ImageIoSpiCategory.UNKNOWN, ImageIoSpiCategory.fromWire("OTHER"))
        assertEquals(AllowedComponentLicense.UNKNOWN, AllowedComponentLicense.fromWire("GPL-3.0"))
        assertEquals(AllowedComponentLicense.BSD_3_CLAUSE, AllowedComponentLicense.fromWire("The BSD License"))
        assertEquals(AllowedComponentLicense.TWELVEMONKEYS_BSD, AllowedComponentLicense.fromWire("BSD-4-Clause"))
        assertEquals(AllowedComponentLicense.APACHE_2_0, AllowedComponentLicense.fromWire("Apache License, Version 2.0"))
    }

    @Test
    fun `duplicate or unknown observed providers fail closed`() {
        val unknown = listOf(
            ImageIoProviderInventory.ObservedSpi(ImageIoSpiCategory.READER, "com.example.UnknownReaderSpi"),
        )
        assertSame(ImageIoProviderInventoryResult.Unknown, ImageIoProviderInventory.evaluate(unknown))

        val duplicate = listOf(
            ImageIoProviderInventory.ObservedSpi(ImageIoSpiCategory.READER, ImageIoProviderId.TM_JPEG_READER.wire),
            ImageIoProviderInventory.ObservedSpi(ImageIoSpiCategory.READER, ImageIoProviderId.TM_JPEG_READER.wire),
        )
        assertSame(ImageIoProviderInventoryResult.Unavailable, ImageIoProviderInventory.evaluate(duplicate))
    }

    @Test
    fun `registry matches the closed IMAGE_IO_V1 inventory`() {
        val observed = ImageIoProviderInventory.observeRegistry()
        val result = ImageIoProviderInventory.evaluate(observed)
        val details = observed.joinToString("\n") { "${it.category.wire} ${it.className}" }
        assertTrue(
            result is ImageIoProviderInventoryResult.Matched,
            "inventory drift:\n$details\nresult=$result",
        )
        val matched = result as ImageIoProviderInventoryResult.Matched
        assertEquals(ImageIoProviderInventory.imageIoV1Expected, matched.providers)
        assertTrue(matched.providers.any { it.provider == ImageIoProviderId.TM_JPEG_READER })
        assertTrue(matched.providers.any { it.provider == ImageIoProviderId.TM_WEBP_READER })
        assertTrue(matched.providers.none { it.provider == ImageIoProviderId.UNKNOWN })
    }

    @Test
    fun `matched factory rejects unknown members`() {
        assertEquals(
            null,
            ImageIoProviderInventoryResult.Matched.create(
                setOf(ImageIoProviderRecord(ImageIoSpiCategory.READER, ImageIoProviderId.UNKNOWN)),
            ),
        )
    }
}
