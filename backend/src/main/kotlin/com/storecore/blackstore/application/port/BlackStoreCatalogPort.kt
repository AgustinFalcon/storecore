package com.storecore.blackstore.application.port

import com.storecore.blackstore.BlackStoreCatalogPage
import com.storecore.blackstore.BlackStoreSagaPolicy
import com.storecore.blackstore.BlackStoreVariantStock
import java.util.UUID

interface BlackStoreCatalogPort {
    fun readPage(
        clientInstanceId: UUID,
        cursor: String?,
        pageSize: Int = BlackStoreSagaPolicy.CATALOG_PAGE_MAX,
        includeCost: Boolean = false,
    ): BlackStoreCatalogPage

    fun readStock(variantId: Long): BlackStoreVariantStock
}
