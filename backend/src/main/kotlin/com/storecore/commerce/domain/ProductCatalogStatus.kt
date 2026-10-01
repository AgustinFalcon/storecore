package com.storecore.commerce.domain

sealed class ProductCatalogStatus {
    abstract val wire: String

    data object Draft : ProductCatalogStatus() {
        override val wire: String = "DRAFT"
    }
    data object Active : ProductCatalogStatus() {
        override val wire: String = "ACTIVE"
    }
    data object Archived : ProductCatalogStatus() {
        override val wire: String = "ARCHIVED"
    }
    data object Unknown : ProductCatalogStatus() {
        override val wire: String = "unknown"
    }

    fun isActive(): Boolean = this === Active

    companion object {
        fun fromWire(raw: String?): ProductCatalogStatus = when (raw?.trim()) {
            "DRAFT" -> Draft
            "ACTIVE" -> Active
            "ARCHIVED" -> Archived
            else -> Unknown
        }
    }
}
