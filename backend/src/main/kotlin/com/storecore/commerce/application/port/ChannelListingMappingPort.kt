package com.storecore.commerce.application.port

data class ListingMappingWrite(
    val listingId: Long,
    val variantId: Long,
    val created: Boolean,
    val remapped: Boolean,
)

interface ChannelListingMappingPort {
    fun requireVariantId(sku: String): Long
    fun upsert(accountId: Long, externalListingId: String, variationId: String, variantId: Long): ListingMappingWrite
    fun requireListingId(accountId: Long, externalListingId: String, variationId: String): Long
    fun lockAndSetState(listingId: Long, state: String, clearIntervention: Boolean = false, requireNoIntervention: Boolean = false): Long
}
