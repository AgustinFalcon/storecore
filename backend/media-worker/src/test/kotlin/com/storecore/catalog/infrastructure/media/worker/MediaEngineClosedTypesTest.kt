package com.storecore.catalog.infrastructure.media.worker

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class MediaEngineClosedTypesTest {
    @Test
    fun `unknown wire values fail into closed Unknown cases`() {
        assertEquals(ExifOrientation.UNKNOWN, ExifOrientation.fromWire(9))
        assertEquals(ExifOrientation.UNKNOWN, ExifOrientation.fromWire(null))
        assertEquals(RasterColor.UNKNOWN, RasterColor.fromWire("DISPLAY_P3"))
        assertEquals(RasterAlpha.UNKNOWN, RasterAlpha.fromWire("MAYBE"))
    }

    @Test
    fun `all eight EXIF orientations are closed values`() {
        (1..8).forEach { assertEquals(it, ExifOrientation.fromWire(it).wire) }
    }

    @Test
    fun `metadata policy rejects identifying and textual metadata`() {
        assertEquals(false, MediaMetadataPolicy.outputMetadataAllowed("Exif"))
        assertEquals(false, MediaMetadataPolicy.outputMetadataAllowed("iCCP"))
        assertEquals(false, MediaMetadataPolicy.outputMetadataAllowed("text"))
        assertEquals(true, MediaMetadataPolicy.outputMetadataAllowed("IHDR"))
    }
}
