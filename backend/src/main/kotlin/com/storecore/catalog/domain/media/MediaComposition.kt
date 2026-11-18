package com.storecore.catalog.domain.media

import java.util.Collections

sealed interface MediaImageReference {
    data class ExistingProductImage(val productImageId: ProductImageId) : MediaImageReference
    data class StagedAsset(val assetId: MediaAssetId) : MediaImageReference
}

data class ProductMediaCompositionEntry(
    val reference: MediaImageReference,
    val sortOrder: Int,
    val isPrimary: Boolean,
    val altText: AltText,
)

data class VariantMediaCompositionEntry(
    val reference: MediaImageReference,
    val sortOrder: Int,
    val isPrimary: Boolean,
)

data class VariantMediaComposition(
    val variantId: MediaVariantId,
    val images: List<VariantMediaCompositionEntry>,
)

enum class MediaCompositionValidationCode {
    PRODUCT_LIMIT_EXCEEDED, VARIANT_LIMIT_EXCEEDED,
    DUPLICATE_PRODUCT_REFERENCE, DUPLICATE_VARIANT, DUPLICATE_VARIANT_REFERENCE,
    INVALID_PRODUCT_ORDER, INVALID_VARIANT_ORDER,
    INVALID_PRODUCT_PRIMARY, INVALID_VARIANT_PRIMARY, VARIANT_REFERENCE_OUTSIDE_PRODUCT,
}

sealed interface MediaCompositionValidationResult {
    data class Valid(val composition: MediaComposition) : MediaCompositionValidationResult
    data class Invalid(val code: MediaCompositionValidationCode) : MediaCompositionValidationResult
}

/** A validated replacement command, including the explicit empty-gallery case. */
class MediaComposition private constructor(
    val productImages: List<ProductMediaCompositionEntry>,
    val variantImages: List<VariantMediaComposition>,
) {
    companion object {
        const val MAX_PRODUCT_IMAGES = 20
        const val MAX_VARIANT_IMAGES = 12

        fun create(
            productImages: List<ProductMediaCompositionEntry>,
            variantImages: List<VariantMediaComposition>,
        ): MediaCompositionValidationResult {
            val product = productImages.toList()
            val variants = variantImages.map { it.copy(images = immutable(it.images)) }
            fun invalid(code: MediaCompositionValidationCode) = MediaCompositionValidationResult.Invalid(code)
            if (product.size > MAX_PRODUCT_IMAGES) return invalid(MediaCompositionValidationCode.PRODUCT_LIMIT_EXCEEDED)
            val references = product.map { it.reference }.toSet()
            if (references.size != product.size) return invalid(MediaCompositionValidationCode.DUPLICATE_PRODUCT_REFERENCE)
            if (!validOrder(product.map { it.sortOrder })) return invalid(MediaCompositionValidationCode.INVALID_PRODUCT_ORDER)
            if (!validPrimary(product.map { it.isPrimary })) return invalid(MediaCompositionValidationCode.INVALID_PRODUCT_PRIMARY)
            if (variants.map { it.variantId }.toSet().size != variants.size) return invalid(MediaCompositionValidationCode.DUPLICATE_VARIANT)
            for (variant in variants) {
                if (variant.images.size > MAX_VARIANT_IMAGES) return invalid(MediaCompositionValidationCode.VARIANT_LIMIT_EXCEEDED)
                val variantReferences = variant.images.map { it.reference }
                if (variantReferences.toSet().size != variantReferences.size) return invalid(MediaCompositionValidationCode.DUPLICATE_VARIANT_REFERENCE)
                if (!validOrder(variant.images.map { it.sortOrder })) return invalid(MediaCompositionValidationCode.INVALID_VARIANT_ORDER)
                if (!validPrimary(variant.images.map { it.isPrimary })) return invalid(MediaCompositionValidationCode.INVALID_VARIANT_PRIMARY)
                if (!references.containsAll(variantReferences)) return invalid(MediaCompositionValidationCode.VARIANT_REFERENCE_OUTSIDE_PRODUCT)
            }
            return MediaCompositionValidationResult.Valid(MediaComposition(immutable(product), immutable(variants)))
        }

        private fun validOrder(orders: List<Int>): Boolean = orders.sorted() == orders.indices.toList()
        private fun validPrimary(primary: List<Boolean>): Boolean = primary.count { it } == if (primary.isEmpty()) 0 else 1
        private fun <T> immutable(items: List<T>): List<T> = Collections.unmodifiableList(ArrayList(items))
    }
}

/** Persistence translates source_kind once; malformed rows cannot masquerade as managed media. */
enum class MediaSourceKind(override val wire: String) : MediaWireType {
    LEGACY_URL("LEGACY_URL"), MANAGED("MANAGED"), UNKNOWN("UNKNOWN");
    companion object {
        fun fromWire(raw: String?): MediaSourceKind = entries.firstOrNull { it != UNKNOWN && it.wire == raw } ?: UNKNOWN
    }
}

sealed interface ProductMediaSource {
    val kind: MediaSourceKind
    data class Legacy(val url: PublicMediaUrl) : ProductMediaSource { override val kind = MediaSourceKind.LEGACY_URL }
    data class Managed(val assetId: MediaAssetId) : ProductMediaSource { override val kind = MediaSourceKind.MANAGED }
    data object Unknown : ProductMediaSource { override val kind = MediaSourceKind.UNKNOWN }
    companion object {
        fun fromWire(kind: String?, assetId: String?, url: String?, allowedHosts: Set<String>): ProductMediaSource =
            when (MediaSourceKind.fromWire(kind)) {
                MediaSourceKind.LEGACY_URL -> if (assetId != null) Unknown else
                    PublicMediaUrl.fromWire(url, allowedHosts)?.let(::Legacy) ?: Unknown
                MediaSourceKind.MANAGED -> if (url != null) Unknown else
                    MediaAssetId.fromWire(assetId)?.let(::Managed) ?: Unknown
                MediaSourceKind.UNKNOWN -> Unknown
            }
    }
}
