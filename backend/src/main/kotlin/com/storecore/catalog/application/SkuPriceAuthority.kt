package com.storecore.catalog.application

import com.storecore.catalog.domain.*

data class SkuPriceIdentity(val variantId: Long, val productStatus: ProductStatus, val variantStatus: VariantStatus, val resolution: SkuPriceResolution)
interface SkuPriceAuthority { fun resolve(sku: String): SkuPriceIdentity? }
