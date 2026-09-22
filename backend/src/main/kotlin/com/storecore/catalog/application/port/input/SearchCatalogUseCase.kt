package com.storecore.catalog.application.port.input

import com.storecore.catalog.domain.ProductSku

interface SearchCatalogUseCase {
    fun search(query: String): List<CatalogSearchResult>
}

data class CatalogSearchResult(
    val sku: ProductSku,
    val name: String,
)
