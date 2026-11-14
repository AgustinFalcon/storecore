package com.storecore.catalog.application

import com.storecore.catalog.domain.ProductStatus
import com.storecore.catalog.domain.VariantStatus
import com.storecore.catalog.domain.PriceProjection
import com.storecore.commerce.application.CommerceValidation
import com.storecore.identity.application.ResourceNotFound

/** Sale eligibility is composed separately from read-only price authority. */
class SellableSkuPrice(private val authority: SkuPriceAuthority) {
    fun resolve(sku: String): Pair<Long,PriceProjection> {
        val identity=authority.resolve(sku) ?: throw ResourceNotFound()
        if(identity.productStatus != ProductStatus.ACTIVE || identity.variantStatus != VariantStatus.ACTIVE) throw ResourceNotFound()
        return identity.variantId to (identity.resolution.knownPrice() ?: throw CommerceValidation("SKU_PRICE_UNKNOWN"))
    }
}
