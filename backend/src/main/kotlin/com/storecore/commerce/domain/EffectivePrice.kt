package com.storecore.commerce.domain

import java.math.BigDecimal
import java.time.Instant

/** Price snapshot resolved from the active local offer policy for one sellable SKU. */
data class EffectivePrice(
    val variantId: Long,
    val sku: String,
    val basePrice: BigDecimal,
    val discountAmount: BigDecimal,
    val effectivePrice: BigDecimal,
    val offerRef: String?,
    val campaignRef: String?,
    val active: Boolean,
    val validFrom: Instant?,
    val validUntil: Instant?,
)
