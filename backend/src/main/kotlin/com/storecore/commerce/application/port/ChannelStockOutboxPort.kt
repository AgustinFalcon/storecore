package com.storecore.commerce.application.port

data class DesiredStockChangedIntent(
    val listingId: Long,
    val accountId: Long,
    val variantId: Long,
    val externalListingId: String,
    val variationId: String?,
    val desiredQuantity: Int,
    val projectionVersion: Long,
    val mappingFingerprint: String,
    val eligibilityFingerprint: String,
    val sourceCause: String,
)

interface ChannelStockOutboxPort {
    fun appendDesiredStockChanged(intent: DesiredStockChangedIntent)
}
