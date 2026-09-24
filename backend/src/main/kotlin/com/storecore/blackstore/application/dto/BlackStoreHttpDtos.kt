package com.storecore.blackstore.application.dto

data class BlackStoreReservationRequest(
    val catalogVersion: String? = null,
    val priceVersion: String? = null,
    val lines: List<BlackStoreReservationLineRequest>? = null,
)

data class BlackStoreReservationLineRequest(
    val variantId: Long? = null,
    val sku: String? = null,
    val quantity: Int? = null,
    val priceVersion: String? = null,
)

data class BlackStoreReconcileRequest(
    val knownReceipts: List<String>? = null,
)
