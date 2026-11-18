package com.storecore.catalog.infrastructure.media

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode
import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.media.*

/** Sole JSON boundary for durable creation receipts. Unknown versions/forms fail closed. */
class MediaProductCreationResultCodec(private val mapper: ObjectMapper) {
    fun encode(snapshot: MediaProductCreationSnapshot): String {
        val root = mapper.createObjectNode()
        root.put("version", 1); root.put("state", MediaProductCreationLedgerState.COMPLETED.wire)
        root.put("productId", snapshot.productId.value); root.put("mediaRevision", snapshot.mediaRevision.value)
        root.putArray("variants").also { array -> snapshot.variants.forEach { item ->
            array.addObject().put("clientRef", item.clientRef.value).put("variantId", item.variantId.value)
        } }
        root.putArray("productImages").also { array -> snapshot.productImages.forEach { item ->
            array.addObject().put("assetId", item.assetId.value.toString()).put("productImageId", item.productImageId.value)
                .put("sortOrder", item.sortOrder).put("primary", item.isPrimary)
        } }
        root.putArray("variantGalleries").also { array -> snapshot.variantGalleries.forEach { gallery ->
            val node = array.addObject().put("clientRef", gallery.clientRef.value)
            node.putArray("images").also { images -> gallery.images.forEach { image ->
                images.addObject().put("productImageId", image.productImageId.value).put("sortOrder", image.sortOrder).put("primary", image.isPrimary)
            } }
        } }
        return mapper.writeValueAsString(root)
    }

    fun decode(raw: String?): MediaProductCreationSnapshot? = runCatching {
        val root = mapper.readTree(raw ?: return null)
        if (!root.isObject || root.fieldNames().asSequence().toSet() != setOf("version","state","productId","mediaRevision","variants","productImages","variantGalleries")) return null
        if (root["version"]?.takeIf { it.isIntegralNumber && it.canConvertToLong() }?.longValue() != 1L ||
            MediaProductCreationLedgerState.fromWire(root["state"]?.textValue()) != MediaProductCreationLedgerState.COMPLETED) return null
        val productId = MediaProductId.fromWire(root.safeLong("productId")) ?: return null
        val revision = MediaCompositionRevision.fromWire(root.safeLong("mediaRevision")) ?: return null
        val variantsRaw = root["variants"].strictArray()?.takeIf { it.size in 1..100 } ?: return null
        val variants = variantsRaw.map { node ->
            if (!node.strictObject(setOf("clientRef","variantId"))) return null
            CreatedVariantSnapshot(ClientVariantRef.fromWire(node["clientRef"]?.textValue()) ?: return null,
                MediaVariantId.fromWire(node.safeLong("variantId")) ?: return null)
        }
        if (variants.isEmpty() || variants.map { it.clientRef }.toSet().size != variants.size || variants.map { it.variantId }.toSet().size != variants.size) return null
        val productImagesRaw = root["productImages"].strictArray()?.takeIf { it.size <= MediaComposition.MAX_PRODUCT_IMAGES } ?: return null
        val productImages = productImagesRaw.map { node ->
            if (!node.strictObject(setOf("assetId","productImageId","sortOrder","primary"))) return null
            CreatedProductImageSnapshot(MediaAssetId.fromWire(node["assetId"]?.textValue()) ?: return null,
                ProductImageId.fromWire(node.safeLong("productImageId")) ?: return null,
                node.safeInt("sortOrder") ?: return null, node["primary"]?.takeIf { it.isBoolean }?.booleanValue() ?: return null)
        }
        if (!validOrderAndPrimary(productImages.map { it.sortOrder }, productImages.map { it.isPrimary }) ||
            productImages.map { it.assetId }.toSet().size != productImages.size || productImages.map { it.productImageId }.toSet().size != productImages.size) return null
        val imageIds = productImages.map { it.productImageId }.toSet()
        val galleriesRaw = root["variantGalleries"].strictArray()?.takeIf { it.size <= variants.size } ?: return null
        val variantGalleries = galleriesRaw.map { node ->
            if (!node.strictObject(setOf("clientRef","images"))) return null
            val ref = ClientVariantRef.fromWire(node["clientRef"]?.textValue()) ?: return null
            val images = node["images"].strictArray()?.takeIf { it.size <= MediaComposition.MAX_VARIANT_IMAGES }?.map { image ->
                if (!image.strictObject(setOf("productImageId","sortOrder","primary"))) return null
                VariantMediaSnapshotEntry(ProductImageId.fromWire(image.safeLong("productImageId")) ?: return null,
                    image.safeInt("sortOrder") ?: return null, image["primary"]?.takeIf { it.isBoolean }?.booleanValue() ?: return null)
            } ?: return null
            if (!validOrderAndPrimary(images.map { it.sortOrder }, images.map { it.isPrimary }) ||
                images.map { it.productImageId }.toSet().size != images.size || images.any { it.productImageId !in imageIds }) return null
            CreatedVariantGallerySnapshot(ref, images)
        } ?: return null
        if (variantGalleries.map { it.clientRef }.toSet().size != variantGalleries.size ||
            !variants.map { it.clientRef }.toSet().containsAll(variantGalleries.map { it.clientRef })) return null
        MediaProductCreationSnapshot(productId, revision, variants, productImages, variantGalleries)
    }.getOrNull()

    private fun JsonNode.strictArray(): List<JsonNode>? = takeIf { it.isArray }?.toList()
    private fun JsonNode.strictObject(fields: Set<String>): Boolean = isObject && fieldNames().asSequence().toSet() == fields
    private fun JsonNode.safeLong(field: String): Long? = get(field)?.takeIf { it.isIntegralNumber && it.canConvertToLong() }?.longValue()
    private fun JsonNode.safeInt(field: String): Int? = get(field)?.takeIf { it.isIntegralNumber && it.canConvertToInt() }?.intValue()
    private fun validOrderAndPrimary(order: List<Int>, primary: List<Boolean>): Boolean =
        order.sorted() == order.indices.toList() && primary.count { it } == if (primary.isEmpty()) 0 else 1
}
