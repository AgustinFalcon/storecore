package com.storecore.catalog.domain

import java.math.BigDecimal
import java.time.Instant

data class PriceQuote(
    val variantId: Long,
    val sku: String,
    val currency: String,
    val basePrice: BigDecimal,
    val discountAmount: BigDecimal,
    val effectivePrice: BigDecimal,
    val priceVersion: PriceVersion,
    val offerId: Long?,
    val offerPriority: Int?,
    val validFrom: Instant?,
    val validUntil: Instant?,
    val campaignRef: String?,
    val sellableActive: Boolean,
)
