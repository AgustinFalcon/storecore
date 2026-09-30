package com.storecore.commerce.application.port

import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.ChannelAccountState
import com.storecore.commerce.domain.ProductCatalogStatus
import com.storecore.commerce.domain.ProjectionState

data class LockedListingProjection(
    val listingId: Long,
    val accountId: Long,
    val variantId: Long,
    val externalListingId: String,
    val variationId: String?,
    val listingState: ChannelAccountState,
    val manualIntervention: Boolean,
    val mappingRevision: Long,
    val purpose: ChannelAccountPurpose,
    val accountState: ChannelAccountState,
    val accountRevision: Long,
    val productStatus: ProductCatalogStatus,
    val productRevision: Long,
    val variantActive: Boolean,
    val variantRevision: Long,
    val availableQuantity: Int,
    val reservedQuantity: Int,
    val safetyStock: Int,
    val currentVersion: Long?,
    val currentState: ProjectionState?,
    val currentQuantity: Int?,
    val currentReason: String?,
    val currentMappingFingerprint: String?,
    val currentEligibilityFingerprint: String?,
    val currentVariantId: Long?,
)

data class ProjectionWrite(
    val listingId: Long,
    val accountId: Long,
    val variantId: Long,
    val externalListingId: String,
    val variationId: String?,
    val desiredQuantity: Int,
    val expectedVersion: Long?,
    val nextVersion: Long,
    val state: ProjectionState,
    val withholdingReason: String?,
    val mappingFingerprint: String,
    val eligibilityFingerprint: String,
    val sourceCause: String,
)

interface MarketplaceListingProjectionPort {
    fun lockByVariantIds(variantIds: Collection<Long>): List<LockedListingProjection>
    fun write(photo: ProjectionWrite): Int
}
