package com.storecore.catalog.media

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.ArsAmount
import com.storecore.catalog.domain.ProductStatus
import com.storecore.catalog.domain.media.*
import com.storecore.catalog.infrastructure.media.MediaProductCreationResultCodec
import kotlin.test.*

class MediaProductCreationDomainTest {
    private val owner = MediaOwnerId.fromWire(7L)!!
    private val draft = CatalogMediaDraftId.fromWire("11111111-1111-4111-8111-111111111111")!!
    private val assetA = MediaAssetId.fromWire("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")!!
    private val assetB = MediaAssetId.fromWire("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")!!

    @Test fun `command rejects unknown state duplicate identities and invalid composition`() {
        val valid = command()
        assertIs<MediaProductCreationValidationResult.Valid>(valid)
        val base = (valid as MediaProductCreationValidationResult.Valid).command
        assertEquals(ProductStatus.DRAFT, base.status)
        assertIs<MediaProductCreationValidationResult.Invalid>(build(status = ProductStatus.UNKNOWN))
        val duplicate = variants().let { listOf(it[0], it[1].copy(clientRef = it[0].clientRef)) }
        assertEquals(MediaProductCreationValidationCode.DUPLICATE_CLIENT_REF,
            (build(variants = duplicate) as MediaProductCreationValidationResult.Invalid).code)
        val outside = listOf(MediaProductCreationVariantGallery(variants()[0].clientRef,
            listOf(VariantMediaCompositionEntry(MediaImageReference.StagedAsset(MediaAssetId.fromWire("cccccccc-cccc-4ccc-8ccc-cccccccccccc")!!),0,true))))
        assertEquals(MediaProductCreationValidationCode.INVALID_COMPOSITION,
            (build(galleries = outside) as MediaProductCreationValidationResult.Invalid).code)
    }

    @Test fun `hash is stable across map and variant order and covers every mutation`() {
        val first = (build(variants = variants()) as MediaProductCreationValidationResult.Valid).command
        val reordered = (build(variants = variants().reversed().map { it.copy(attributes = it.attributes.entries.reversed().associate { e -> e.toPair() }) }) as MediaProductCreationValidationResult.Valid).command
        assertEquals(MediaProductCreationHash.calculate(first), MediaProductCreationHash.calculate(reordered))
        val changed = (build(variants = variants().mapIndexed { index, value -> if (index == 0) value.copy(initialAvailable = InitialAvailableQuantity.fromWire(6)!!) else value }) as MediaProductCreationValidationResult.Valid).command
        assertNotEquals(MediaProductCreationHash.calculate(first), MediaProductCreationHash.calculate(changed))
    }

    @Test fun `validated command deep freezes caller attributes`() {
        val attributes = linkedMapOf("color" to "Rojo")
        val source = variants().first().copy(attributes = attributes)
        val stored = (build(variants = listOf(source)) as MediaProductCreationValidationResult.Valid).command
        attributes["color"] = "Azul"
        assertEquals("Rojo", stored.variants.single().attributes["color"])
        assertFailsWith<UnsupportedOperationException> {
            @Suppress("UNCHECKED_CAST")
            (stored.variants.single().attributes as MutableMap<String,String>)["color"] = "Verde"
        }
    }

    @Test fun `receipt codec round trips strict snapshot and rejects future or malformed data`() {
        val codec = MediaProductCreationResultCodec(jacksonObjectMapper())
        val red = ClientVariantRef.fromWire("red")!!
        val snapshot = MediaProductCreationSnapshot(
            MediaProductId.fromWire(41L)!!, MediaCompositionRevision.fromWire(1L)!!,
            listOf(CreatedVariantSnapshot(red, MediaVariantId.fromWire(51L)!!)),
            listOf(CreatedProductImageSnapshot(assetA, ProductImageId.fromWire(61L)!!,0,true)),
            listOf(CreatedVariantGallerySnapshot(red, listOf(VariantMediaSnapshotEntry(ProductImageId.fromWire(61L)!!,0,true)))),
        )
        assertEquals(snapshot, codec.decode(codec.encode(snapshot)))
        assertNull(codec.decode(codec.encode(snapshot).replace("\"version\":1", "\"version\":2")))
        assertNull(codec.decode(codec.encode(snapshot).replace("\"version\":1", "\"version\":1.5")))
        assertNull(codec.decode("{\"version\":1,\"state\":\"COMPLETED\"}"))
        assertNull(codec.decode(codec.encode(snapshot).replace(
            "\"variantGalleries\":[{\"clientRef\":\"red\",\"images\":[{\"productImageId\":61",
            "\"variantGalleries\":[{\"clientRef\":\"red\",\"images\":[{\"productImageId\":62",
        )))
    }

    private fun command() = build()
    private fun build(
        status: ProductStatus = ProductStatus.DRAFT,
        variants: List<MediaProductCreationVariant> = variants(),
        galleries: List<MediaProductCreationVariantGallery> = galleries(),
    ) = MediaProductCreationCommand.create(
        owner, draft, CreationProductName.fromWire("Taladro Pro"), CreationProductSlug.fromWire("taladro-pro"),
        "Herramienta", null, null, ArsAmount.fromWire("1000.00"), status, variants,
        listOf(MediaProductCreationImage(assetA,0,true,AltText.fromWire("Taladro")!!), MediaProductCreationImage(assetB,1,false,AltText.fromWire("Taladro lateral")!!)),
        galleries,
    )
    private fun variants() = listOf(
        MediaProductCreationVariant(ClientVariantRef.fromWire("red")!!, CreationSku.fromWire("DRILL-RED")!!,
            CreationVariantLabel.fromWire("Rojo")!!, true, linkedMapOf("color" to "Rojo", "voltage" to "220V"), InitialAvailableQuantity.fromWire(5)!!),
        MediaProductCreationVariant(ClientVariantRef.fromWire("blue")!!, CreationSku.fromWire("DRILL-BLUE")!!,
            CreationVariantLabel.fromWire("Azul")!!, true, mapOf("color" to "Azul"), InitialAvailableQuantity.fromWire(0)!!),
    )
    private fun galleries() = listOf(MediaProductCreationVariantGallery(ClientVariantRef.fromWire("red")!!,
        listOf(VariantMediaCompositionEntry(MediaImageReference.StagedAsset(assetA),0,true))))
}
