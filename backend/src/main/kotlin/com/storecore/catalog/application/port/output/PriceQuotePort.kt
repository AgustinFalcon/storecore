package com.storecore.catalog.application.port.output

import com.storecore.catalog.domain.CatalogVersion
import com.storecore.catalog.domain.PriceQuote
import java.time.Instant

interface PriceQuotePort {
    fun clock(): Instant
    fun shareRevision(): Long
    fun catalogVersion(asOf: Instant): CatalogVersion
    fun quoteByVariantIds(asOf: Instant, variantIds: Collection<Long>): Map<Long, PriceQuote>
    fun quoteBySkus(asOf: Instant, skus: Collection<String>): Map<String, PriceQuote>
}
