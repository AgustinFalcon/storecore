package com.storecore.commerce.domain

data class OfficialPaymentResource(
    val providerPaymentId: String,
    val externalReference: String?,
    val status: String,
)

data class OfficialMlItem(
    val listingId: String,
    val variationId: String?,
    val externalOrderItemId: String,
    val quantity: Int,
    val observedQuantity: Int?,
)

data class OfficialMlResource(
    val externalOrderId: String,
    val items: List<OfficialMlItem>,
)
