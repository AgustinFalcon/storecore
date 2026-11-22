package com.storecore.catalog

import com.storecore.catalog.domain.CatalogImageReference
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class CatalogImageReferenceTest {
    @Test
    fun `accepts secure remote and application-owned asset references`() {
        assertIs<CatalogImageReference.SecureRemote>(CatalogImageReference.fromWire("https://images.example.com/tool.jpg"))
        assertIs<CatalogImageReference.ApplicationAsset>(CatalogImageReference.fromWire("/assets/showcase/catalog/tool-001.jpg"))
    }

    @Test
    fun `maps unsafe and future wire values to Unknown`() {
        listOf(
            "http://images.example.com/tool.jpg",
            "/assets/../secret.jpg",
            "/assets/tool.jpg?redirect=https://example.com",
            "/assets/showcase/catalog/tool.JPG",
            "/other/tool.jpg",
            "javascript:alert(1)",
            "future-reference",
        ).forEach { assertEquals(CatalogImageReference.Unknown, CatalogImageReference.fromWire(it), it) }
    }
}
