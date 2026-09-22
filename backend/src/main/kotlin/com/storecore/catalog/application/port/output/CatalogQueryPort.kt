package com.storecore.catalog.application.port.output

import com.storecore.catalog.application.port.input.CatalogSearchResult

/** Infrastructure implements this port; application code does not know Spring or persistence. */
interface CatalogQueryPort {
    fun searchActive(query: String): List<CatalogSearchResult>
}
