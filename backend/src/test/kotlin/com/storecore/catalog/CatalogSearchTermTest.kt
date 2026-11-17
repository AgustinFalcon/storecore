package com.storecore.catalog

import com.storecore.catalog.domain.CatalogSearchTerm
import com.storecore.catalog.domain.CatalogSearchInvalid
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class CatalogSearchTermTest {
    @Test fun `normalizes whitespace and escapes only LIKE syntax`() {
        val query = CatalogSearchTerm.fromWire("  Taladro\t50%_! ")
        assertEquals("Taladro 50%_!", query.value)
        assertEquals("%Taladro 50!%!_!!%", query.literalLikePattern)
        assertTrue(query.present)
        assertEquals("%\\%", CatalogSearchTerm.fromWire("\\").literalLikePattern)
        assertEquals("a b c d", CatalogSearchTerm.fromWire("a\u001Cb\u2028c\u00A0d").value)
        assertEquals("edge", CatalogSearchTerm.fromWire("\u2029edge\u2028").value)
    }

    @Test fun `blank is absent and transport limits reject rather than truncate`() {
        assertFalse(CatalogSearchTerm.fromWire(" \n ").present)
        assertEquals(120, CatalogSearchTerm.fromWire("x".repeat(120)).value.length)
        assertThrows(CatalogSearchInvalid::class.java) { CatalogSearchTerm.fromWire("x".repeat(121)) }
        assertThrows(CatalogSearchInvalid::class.java) { CatalogSearchTerm.fromWire("x".repeat(2_049)) }
        assertThrows(CatalogSearchInvalid::class.java) { CatalogSearchTerm.fromWire("bad\u0000query") }
    }
}
