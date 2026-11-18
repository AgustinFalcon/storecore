package com.storecore.catalog.domain.media

import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.math.BigDecimal
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

/** Versioned length-prefixed canonicalization; independent from JSON and map iteration order. */
object MediaProductCreationHash {
    fun calculate(command: MediaProductCreationCommand): MediaRequestHash {
        val bytes = ByteArrayOutputStream()
        DataOutputStream(bytes).use { out ->
            out.writeInt(1)
            out.text(command.draftId.value.toString()); out.writeLong(command.ownerId.value)
            out.text(command.name.value); out.text(command.slug.value); out.nullableText(command.description)
            out.nullableLong(command.brandId); out.nullableLong(command.categoryId)
            out.text(command.basePrice.value.stripTrailingZeros().toPlainString()); out.text(command.status.name)
            val variants = command.variants.sortedBy { it.clientRef.value }
            out.writeInt(variants.size)
            variants.forEach { variant ->
                out.text(variant.clientRef.value); out.text(variant.sku.value); out.text(variant.label.value)
                out.writeBoolean(variant.active); out.writeInt(variant.initialAvailable.value)
                val attributes = variant.attributes.toSortedMap()
                out.writeInt(attributes.size); attributes.forEach { (key, value) -> out.text(key); out.text(value) }
            }
            out.writeInt(command.productImages.size)
            command.productImages.sortedBy { it.sortOrder }.forEach { image ->
                out.text(image.assetId.value.toString()); out.writeInt(image.sortOrder); out.writeBoolean(image.isPrimary); out.text(image.altText.value)
            }
            out.writeInt(command.variantGalleries.size)
            command.variantGalleries.sortedBy { it.clientRef.value }.forEach { gallery ->
                out.text(gallery.clientRef.value); out.writeInt(gallery.images.size)
                gallery.images.sortedBy { it.sortOrder }.forEach { image ->
                    out.text((image.reference as MediaImageReference.StagedAsset).assetId.value.toString())
                    out.writeInt(image.sortOrder); out.writeBoolean(image.isPrimary)
                }
            }
        }
        val digest = MessageDigest.getInstance("SHA-256").digest(bytes.toByteArray()).joinToString("") { "%02x".format(it) }
        return requireNotNull(MediaRequestHash.fromWire(digest))
    }

    private fun DataOutputStream.text(value: String) {
        val encoded = value.toByteArray(StandardCharsets.UTF_8); writeInt(encoded.size); write(encoded)
    }
    private fun DataOutputStream.nullableText(value: String?) { writeBoolean(value != null); if (value != null) text(value) }
    private fun DataOutputStream.nullableLong(value: Long?) { writeBoolean(value != null); if (value != null) writeLong(value) }
}
