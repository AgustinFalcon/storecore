package com.storecore.commerce.application

data class CreateListingMappingCommand(
    val accountId: Long?,
    val externalListingId: String,
    val variationId: String,
    val sku: String,
)
