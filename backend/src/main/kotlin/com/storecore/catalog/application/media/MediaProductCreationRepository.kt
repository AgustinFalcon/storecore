package com.storecore.catalog.application.media

import com.storecore.catalog.domain.media.*

data class CreatedVariantSnapshot(
    val clientRef: ClientVariantRef,
    val variantId: MediaVariantId,
)

data class CreatedProductImageSnapshot(
    val assetId: MediaAssetId,
    val productImageId: ProductImageId,
    val sortOrder: Int,
    val isPrimary: Boolean,
)

data class CreatedVariantGallerySnapshot(
    val clientRef: ClientVariantRef,
    val images: List<VariantMediaSnapshotEntry>,
)

data class MediaProductCreationSnapshot(
    val productId: MediaProductId,
    val mediaRevision: MediaCompositionRevision,
    val variants: List<CreatedVariantSnapshot>,
    val productImages: List<CreatedProductImageSnapshot>,
    val variantGalleries: List<CreatedVariantGallerySnapshot>,
)

sealed interface MediaProductCreationResult {
    data class Created(val snapshot: MediaProductCreationSnapshot) : MediaProductCreationResult
    data class Replayed(val snapshot: MediaProductCreationSnapshot) : MediaProductCreationResult
    data object Conflict : MediaProductCreationResult
    data object ScopeDenied : MediaProductCreationResult
    data object DraftClosed : MediaProductCreationResult
    data object AssetUnavailable : MediaProductCreationResult
    data object InvalidAssociation : MediaProductCreationResult
    data object Unknown : MediaProductCreationResult
}

/** Local create-only boundary. Implementations must not perform external I/O. */
interface MediaProductCreationRepository {
    fun create(command: MediaProductCreationCommand): MediaProductCreationResult
}
