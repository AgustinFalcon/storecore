package com.storecore.catalog.application.media

import com.storecore.catalog.domain.media.*

data class MediaCompositionCommand(
    val ownerId: MediaOwnerId,
    val draftId: CatalogMediaDraftId,
    val productId: MediaProductId,
    val expectedRevision: MediaCompositionRevision,
    val composition: MediaComposition,
)

data class ProductMediaSnapshotEntry(
    val productImageId: ProductImageId,
    val source: ProductMediaSource,
    val sortOrder: Int,
    val isPrimary: Boolean,
    val altText: AltText,
)

data class VariantMediaSnapshotEntry(
    val productImageId: ProductImageId,
    val sortOrder: Int,
    val isPrimary: Boolean,
)

data class VariantMediaSnapshot(
    val variantId: MediaVariantId,
    val images: List<VariantMediaSnapshotEntry>,
)

/** Read snapshots preserve legacy galleries exceeding the current write limit. */
data class MediaCompositionSnapshot(
    val productId: MediaProductId,
    val revision: MediaCompositionRevision,
    val productImages: List<ProductMediaSnapshotEntry>,
    val variantImages: List<VariantMediaSnapshot>,
)

sealed interface MediaCompositionResult {
    data class Saved(val snapshot: MediaCompositionSnapshot) : MediaCompositionResult
    data object Conflict : MediaCompositionResult
    data object ScopeDenied : MediaCompositionResult
    data object DraftClosed : MediaCompositionResult
    data object Missing : MediaCompositionResult
    data object AssetUnavailable : MediaCompositionResult
    data object InvalidAssociation : MediaCompositionResult
    data object RevisionExhausted : MediaCompositionResult
    data object Unknown : MediaCompositionResult
}

/** Local atomic CAS only: implementations must not call external object storage. */
interface MediaCompositionRepository {
    fun read(productId: MediaProductId): MediaCompositionSnapshot?
    fun replace(command: MediaCompositionCommand): MediaCompositionResult
}
