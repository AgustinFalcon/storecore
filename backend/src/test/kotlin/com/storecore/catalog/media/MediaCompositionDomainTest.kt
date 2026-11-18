package com.storecore.catalog.media

import com.storecore.catalog.domain.media.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.math.BigInteger

class MediaCompositionDomainTest {
    private val alt = AltText.fromWire("Vista frontal")!!
    private val assetId = MediaAssetId.fromWire("00000000-0000-4000-8000-000000000001")!!
    private val variantId = MediaVariantId.fromWire(1)!!
    private fun reference(id: Int): MediaImageReference = MediaImageReference.ExistingProductImage(ProductImageId.fromWire(id)!!)
    private fun product(id: Int, order: Int = id - 1, primary: Boolean = id == 1) =
        ProductMediaCompositionEntry(reference(id), order, primary, alt)
    private fun variant(vararg ids: Int): VariantMediaComposition = VariantMediaComposition(
        variantId, ids.mapIndexed { order, id -> VariantMediaCompositionEntry(reference(id), order, order == 0) },
    )
    private fun invalid(
        code: MediaCompositionValidationCode,
        products: List<ProductMediaCompositionEntry>,
        variants: List<VariantMediaComposition> = emptyList(),
    ) {
        assertEquals(MediaCompositionValidationResult.Invalid(code), MediaComposition.create(products, variants))
    }

    @Test fun `identities and revisions accept only positive safe integral wire values`() {
        for (value in listOf<Any>(1.toByte(), 2.toShort(), 3, 4L, 9_007_199_254_740_991L)) {
            assertNotNull(MediaCompositionRevision.fromWire(value))
            assertNotNull(ProductImageId.fromWire(value))
            assertNotNull(MediaVariantId.fromWire(value))
        }
        for (value in listOf(null, 0, -1L, Long.MAX_VALUE, 9_007_199_254_740_992L,
            1.0, 1.5, Float.NaN, Double.POSITIVE_INFINITY, "1", BigDecimal.ONE, BigInteger.ONE, true)) {
            assertNull(MediaCompositionRevision.fromWire(value))
            assertNull(ProductImageId.fromWire(value))
            assertNull(MediaVariantId.fromWire(value))
        }
        assertEquals(MediaCompositionRevision.fromWire(2), MediaCompositionRevision.fromWire(1)!!.next())
        assertNull(MediaCompositionRevision.fromWire(9_007_199_254_740_991L)!!.next())
    }

    @Test fun `empty composition and empty variant galleries are valid`() {
        assertInstanceOf(MediaCompositionValidationResult.Valid::class.java, MediaComposition.create(emptyList(), listOf(variant())))
    }

    @Test fun `maximum galleries can mix published and own staging references with independent order and cover`() {
        val staged = MediaImageReference.StagedAsset(assetId)
        val products = (1..19).map { product(it) } + ProductMediaCompositionEntry(staged, 19, false, alt)
        val images = listOf(VariantMediaCompositionEntry(staged, 0, false)) +
            (1..11).map { VariantMediaCompositionEntry(reference(it), it, it == 11) }
        val result = MediaComposition.create(products.reversed(), listOf(VariantMediaComposition(variantId, images.reversed())))
        assertInstanceOf(MediaCompositionValidationResult.Valid::class.java, result)
    }

    @Test fun `oversized galleries are rejected rather than silently truncated`() {
        invalid(MediaCompositionValidationCode.PRODUCT_LIMIT_EXCEEDED, (1..21).map { product(it) })
        invalid(MediaCompositionValidationCode.VARIANT_LIMIT_EXCEEDED, (1..20).map { product(it) }, listOf(variant(*(1..13).toList().toIntArray())))
    }

    @Test fun `product references and variant identities are unique`() {
        invalid(MediaCompositionValidationCode.DUPLICATE_PRODUCT_REFERENCE, listOf(product(1), product(1, 1, false)))
        val staged = ProductMediaCompositionEntry(MediaImageReference.StagedAsset(assetId), 0, true, alt)
        invalid(MediaCompositionValidationCode.DUPLICATE_PRODUCT_REFERENCE, listOf(staged, staged.copy(sortOrder = 1, isPrimary = false)))
        invalid(MediaCompositionValidationCode.DUPLICATE_VARIANT, listOf(product(1)), listOf(variant(1), variant()))
        invalid(MediaCompositionValidationCode.DUPLICATE_VARIANT_REFERENCE, listOf(product(1)), listOf(variant(1, 1)))
    }

    @Test fun `orders must be unique nonnegative and contiguous within each gallery`() {
        for (orders in listOf(listOf(-1, 0), listOf(0, 0), listOf(0, 2), listOf(1, 2))) {
            invalid(MediaCompositionValidationCode.INVALID_PRODUCT_ORDER, listOf(product(1, orders[0]), product(2, orders[1])))
            val images = orders.mapIndexed { index, order -> VariantMediaCompositionEntry(reference(index + 1), order, index == 0) }
            invalid(MediaCompositionValidationCode.INVALID_VARIANT_ORDER, listOf(product(1), product(2)), listOf(VariantMediaComposition(variantId, images)))
        }
    }

    @Test fun `each nonempty gallery requires exactly one cover`() {
        for (primary in listOf(false, true)) {
            invalid(MediaCompositionValidationCode.INVALID_PRODUCT_PRIMARY, listOf(product(1, primary = primary), product(2, primary = primary)))
            val images = (1..2).map { VariantMediaCompositionEntry(reference(it), it - 1, primary) }
            invalid(MediaCompositionValidationCode.INVALID_VARIANT_PRIMARY, listOf(product(1), product(2)), listOf(VariantMediaComposition(variantId, images)))
        }
    }

    @Test fun `variant references must occur in the general composition even for empty general gallery`() {
        invalid(MediaCompositionValidationCode.VARIANT_REFERENCE_OUTSIDE_PRODUCT, listOf(product(1)), listOf(variant(2)))
        invalid(MediaCompositionValidationCode.VARIANT_REFERENCE_OUTSIDE_PRODUCT, emptyList(), listOf(variant(1)))
        val staged = VariantMediaCompositionEntry(MediaImageReference.StagedAsset(assetId), 0, true)
        invalid(MediaCompositionValidationCode.VARIANT_REFERENCE_OUTSIDE_PRODUCT, listOf(product(1)), listOf(VariantMediaComposition(variantId, listOf(staged))))
    }

    @Test fun `validated composition owns immutable copies of all input lists`() {
        val products = mutableListOf(product(1))
        val images = mutableListOf(VariantMediaCompositionEntry(reference(1), 0, true))
        val variants = mutableListOf(VariantMediaComposition(variantId, images))
        val result = MediaComposition.create(products, variants) as MediaCompositionValidationResult.Valid
        products.clear()
        images.clear()
        variants.clear()
        assertEquals(1, result.composition.productImages.size)
        assertEquals(1, result.composition.variantImages.single().images.size)
        assertThrows(UnsupportedOperationException::class.java) { (result.composition.productImages as MutableList).clear() }
        assertThrows(UnsupportedOperationException::class.java) { (result.composition.variantImages as MutableList).clear() }
        assertThrows(UnsupportedOperationException::class.java) { (result.composition.variantImages.single().images as MutableList).clear() }
    }

    @Test fun `source boundary is closed and malformed rows cannot expose arbitrary urls`() {
        val hosts = setOf("images.example.test")
        val url = "https://images.example.test/front.jpg"
        assertEquals(MediaSourceKind.LEGACY_URL, ProductMediaSource.fromWire(MediaSourceKind.LEGACY_URL.wire, null, url, hosts).kind)
        assertEquals(ProductMediaSource.Managed(assetId), ProductMediaSource.fromWire(MediaSourceKind.MANAGED.wire, assetId.value.toString(), null, hosts))
        for (kind in listOf(null, "FUTURE", "managed", MediaSourceKind.UNKNOWN.wire)) {
            assertEquals(MediaSourceKind.UNKNOWN, MediaSourceKind.fromWire(kind))
            assertEquals(ProductMediaSource.Unknown, ProductMediaSource.fromWire(kind, null, url, hosts))
        }
        assertEquals(ProductMediaSource.Unknown, ProductMediaSource.fromWire(MediaSourceKind.MANAGED.wire, assetId.value.toString(), url, hosts))
        assertEquals(ProductMediaSource.Unknown, ProductMediaSource.fromWire(MediaSourceKind.MANAGED.wire, "invalid", null, hosts))
        assertEquals(ProductMediaSource.Unknown, ProductMediaSource.fromWire(MediaSourceKind.LEGACY_URL.wire, assetId.value.toString(), url, hosts))
        assertEquals(ProductMediaSource.Unknown, ProductMediaSource.fromWire(MediaSourceKind.LEGACY_URL.wire, null, "http://images.example.test/front.jpg", hosts))
        assertEquals(ProductMediaSource.Unknown, ProductMediaSource.fromWire(MediaSourceKind.LEGACY_URL.wire, null, "https://other.test/front.jpg", hosts))
    }
}
