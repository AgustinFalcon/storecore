package com.storecore.catalog

import com.storecore.catalog.domain.CatalogVersion
import com.storecore.catalog.domain.OfferWindow
import com.storecore.catalog.domain.PriceVersion
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class Posc003bCatalogVersionTest {
    @Test
    fun catalogAndPriceVersionsRejectUnknownWire() {
        val digest = "A".repeat(43)
        val catalog = CatalogVersion.fromWire("c1_$digest")
        assertTrue(catalog is CatalogVersion.Current)
        assertEquals("CURRENT", catalog.label)
        assertEquals(46, catalog.wire.length)
        assertTrue(CatalogVersion.fromWire("catalog-1") is CatalogVersion.Unknown)
        assertEquals("UNKNOWN", CatalogVersion.fromWire("catalog-1").label)
        val price = PriceVersion.fromWire("p1_$digest")
        assertTrue(price is PriceVersion.Quoted)
        assertEquals("QUOTED", price.label)
        assertTrue(PriceVersion.fromWire("catalog-9") is PriceVersion.Unknown)
    }

    @Test
    fun offerWindowIsHalfOpen() {
        val start = Instant.parse("2026-09-30T12:00:00Z")
        val end = Instant.parse("2026-09-30T13:00:00Z")
        assertTrue(OfferWindow.contains(start, start, end))
        assertFalse(OfferWindow.contains(end, start, end))
        assertTrue(OfferWindow.contains(end.minusSeconds(1), start, end))
    }
}
