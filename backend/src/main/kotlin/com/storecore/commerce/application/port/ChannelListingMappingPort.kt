package com.storecore.commerce.application.port

interface ChannelListingMappingPort {
    fun requireVariantId(sku: String): Long
    fun upsert(accountId: Long, externalListingId: String, variationId: String, variantId: Long)
}
