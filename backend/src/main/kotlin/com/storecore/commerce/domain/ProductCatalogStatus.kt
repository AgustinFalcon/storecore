package com.storecore.commerce.domain

class ProductCatalogStatus private constructor(val wire: String) {
    override fun equals(other: Any?) = other is ProductCatalogStatus && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    fun isActive(): Boolean = this === Active

    companion object {
        val Draft = ProductCatalogStatus("DRAFT")
        val Active = ProductCatalogStatus("ACTIVE")
        val Archived = ProductCatalogStatus("ARCHIVED")
        val Unknown = ProductCatalogStatus("unknown")
        private val known = listOf(Draft, Active, Archived)
        fun fromWire(raw: String?): ProductCatalogStatus {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}
