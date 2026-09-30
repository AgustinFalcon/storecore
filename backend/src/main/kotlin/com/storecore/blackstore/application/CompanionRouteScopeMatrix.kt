package com.storecore.blackstore.application

import com.storecore.blackstore.domain.CompanionScope
import org.springframework.http.HttpMethod

object CompanionRouteScopeMatrix {
    fun required(method: HttpMethod, path: String): CompanionScope? {
        val normalized = path.removePrefix("/blackstore-integration/v1")
        return when {
            method == HttpMethod.GET && normalized == "/catalog" -> CompanionScope.CATALOG_READ
            method == HttpMethod.GET && normalized.startsWith("/stock/variants/") -> CompanionScope.STOCK_READ
            method == HttpMethod.POST && normalized == "/reservations" -> CompanionScope.STOCK_RESERVE
            method == HttpMethod.POST && normalized.matches(Regex("/reservations/[^/]+/commit")) -> CompanionScope.STOCK_COMMIT
            method == HttpMethod.POST && normalized.matches(Regex("/reservations/[^/]+/release")) -> CompanionScope.STOCK_RELEASE
            method == HttpMethod.GET && normalized.startsWith("/operations/") && normalized != "/operations/reconcile" -> CompanionScope.STOCK_READ
            method == HttpMethod.POST && normalized == "/operations/reconcile" -> CompanionScope.STOCK_READ
            else -> null
        }
    }
}
