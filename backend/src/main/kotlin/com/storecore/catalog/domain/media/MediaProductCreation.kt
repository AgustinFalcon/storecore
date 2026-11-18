package com.storecore.catalog.domain.media

import com.storecore.catalog.domain.ArsAmount
import com.storecore.catalog.domain.ProductStatus
import java.util.Collections

private fun normalizedCreationText(raw: String?, max: Int): String? {
    val value = raw?.replace(Regex("[\\p{Z}\\s]+"), " ")?.trim() ?: return null
    if (value.codePointCount(0, value.length) !in 1..max) return null
    if (value.codePoints().anyMatch { Character.isISOControl(it) || Character.getType(it) == Character.FORMAT.toInt() }) return null
    return value
}

@JvmInline value class ClientVariantRef private constructor(val value: String) {
    companion object { fun fromWire(raw: String?): ClientVariantRef? = normalizedCreationText(raw, 80)?.let(::ClientVariantRef) }
}

@JvmInline value class CreationProductName private constructor(val value: String) {
    companion object { fun fromWire(raw: String?): CreationProductName? = normalizedCreationText(raw, 200)?.let(::CreationProductName) }
}

@JvmInline value class CreationProductSlug private constructor(val value: String) {
    companion object {
        private val pattern = Regex("[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?")
        fun fromWire(raw: String?): CreationProductSlug? = raw?.takeIf(pattern::matches)?.let(::CreationProductSlug)
    }
}

@JvmInline value class CreationSku private constructor(val value: String) {
    companion object { fun fromWire(raw: String?): CreationSku? = normalizedCreationText(raw, 128)?.let(::CreationSku) }
}

@JvmInline value class CreationVariantLabel private constructor(val value: String) {
    companion object { fun fromWire(raw: String?): CreationVariantLabel? = normalizedCreationText(raw, 200)?.let(::CreationVariantLabel) }
}

@JvmInline value class InitialAvailableQuantity private constructor(val value: Int) {
    companion object { fun fromWire(raw: Any?): InitialAvailableQuantity? = (raw as? Int)?.takeIf { it >= 0 }?.let(::InitialAvailableQuantity) }
}

data class MediaProductCreationVariant(
    val clientRef: ClientVariantRef,
    val sku: CreationSku,
    val label: CreationVariantLabel,
    val active: Boolean,
    val attributes: Map<String, String>,
    val initialAvailable: InitialAvailableQuantity,
)

data class MediaProductCreationImage(
    val assetId: MediaAssetId,
    val sortOrder: Int,
    val isPrimary: Boolean,
    val altText: AltText,
)

data class MediaProductCreationVariantGallery(
    val clientRef: ClientVariantRef,
    val images: List<VariantMediaCompositionEntry>,
)

enum class MediaProductCreationValidationCode {
    INVALID_PRODUCT, INVALID_VARIANTS, DUPLICATE_CLIENT_REF, DUPLICATE_SKU,
    INVALID_ATTRIBUTES, INVALID_COMPOSITION, UNKNOWN_STATUS,
}

enum class MediaProductCreationLedgerState(override val wire: String) : MediaWireType {
    IN_PROGRESS("IN_PROGRESS"), COMPLETED("COMPLETED"), UNKNOWN("UNKNOWN");
    companion object {
        fun fromWire(raw: String?): MediaProductCreationLedgerState =
            entries.firstOrNull { it != UNKNOWN && it.wire == raw } ?: UNKNOWN
    }
}

sealed interface MediaProductCreationValidationResult {
    data class Valid(val command: MediaProductCreationCommand) : MediaProductCreationValidationResult
    data class Invalid(val code: MediaProductCreationValidationCode) : MediaProductCreationValidationResult
}

class MediaProductCreationCommand private constructor(
    val ownerId: MediaOwnerId,
    val draftId: CatalogMediaDraftId,
    val name: CreationProductName,
    val slug: CreationProductSlug,
    val description: String?,
    val brandId: Long?,
    val categoryId: Long?,
    val basePrice: ArsAmount,
    val status: ProductStatus,
    variants: List<MediaProductCreationVariant>,
    productImages: List<MediaProductCreationImage>,
    variantGalleries: List<MediaProductCreationVariantGallery>,
) {
    val variants: List<MediaProductCreationVariant> = Collections.unmodifiableList(variants.map {
        it.copy(attributes = Collections.unmodifiableMap(LinkedHashMap(it.attributes)))
    })
    val productImages: List<MediaProductCreationImage> = Collections.unmodifiableList(ArrayList(productImages))
    val variantGalleries: List<MediaProductCreationVariantGallery> = Collections.unmodifiableList(
        variantGalleries.map { it.copy(images = Collections.unmodifiableList(ArrayList(it.images))) },
    )

    companion object {
        fun create(
            ownerId: MediaOwnerId?, draftId: CatalogMediaDraftId?, name: CreationProductName?,
            slug: CreationProductSlug?, description: String?, brandId: Long?, categoryId: Long?,
            basePrice: ArsAmount?, status: ProductStatus,
            variants: List<MediaProductCreationVariant>, productImages: List<MediaProductCreationImage>,
            variantGalleries: List<MediaProductCreationVariantGallery>,
        ): MediaProductCreationValidationResult {
            if (ownerId == null || draftId == null || name == null || slug == null || basePrice == null ||
                (brandId != null && brandId <= 0) || (categoryId != null && categoryId <= 0) ||
                (description != null && (description.length > 10_000 || description.any(Char::isISOControl))))
                return MediaProductCreationValidationResult.Invalid(MediaProductCreationValidationCode.INVALID_PRODUCT)
            if (status == ProductStatus.UNKNOWN) return MediaProductCreationValidationResult.Invalid(MediaProductCreationValidationCode.UNKNOWN_STATUS)
            if (variants.isEmpty() || variants.size > 100)
                return MediaProductCreationValidationResult.Invalid(MediaProductCreationValidationCode.INVALID_VARIANTS)
            if (variants.map { it.clientRef }.toSet().size != variants.size)
                return MediaProductCreationValidationResult.Invalid(MediaProductCreationValidationCode.DUPLICATE_CLIENT_REF)
            if (variants.map { it.sku }.toSet().size != variants.size)
                return MediaProductCreationValidationResult.Invalid(MediaProductCreationValidationCode.DUPLICATE_SKU)
            if (variants.any { variant -> variant.attributes.size > 8 || variant.attributes.any { (key, value) ->
                    normalizedCreationText(key, 40) != key || normalizedCreationText(value, 120) != value
                } }) return MediaProductCreationValidationResult.Invalid(MediaProductCreationValidationCode.INVALID_ATTRIBUTES)
            val refs = variants.map { it.clientRef }.toSet()
            if (productImages.size > MediaComposition.MAX_PRODUCT_IMAGES || productImages.map { it.assetId }.toSet().size != productImages.size ||
                productImages.map { it.sortOrder }.sorted() != productImages.indices.toList() ||
                productImages.count { it.isPrimary } != (if (productImages.isEmpty()) 0 else 1) ||
                variantGalleries.map { it.clientRef }.toSet().size != variantGalleries.size ||
                variantGalleries.any { it.clientRef !in refs || it.images.size > MediaComposition.MAX_VARIANT_IMAGES ||
                    it.images.map { image -> image.reference }.any { reference -> reference !is MediaImageReference.StagedAsset } ||
                    it.images.map { image -> image.reference }.toSet().size != it.images.size ||
                    it.images.map { image -> image.sortOrder }.sorted() != it.images.indices.toList() ||
                    it.images.count { image -> image.isPrimary } != (if (it.images.isEmpty()) 0 else 1) ||
                    !productImages.map { image -> MediaImageReference.StagedAsset(image.assetId) }.toSet().containsAll(it.images.map { image -> image.reference })
                }) return MediaProductCreationValidationResult.Invalid(MediaProductCreationValidationCode.INVALID_COMPOSITION)
            return MediaProductCreationValidationResult.Valid(MediaProductCreationCommand(
                ownerId, draftId, name, slug, description, brandId, categoryId, basePrice, status,
                variants, productImages, variantGalleries,
            ))
        }
    }
}
