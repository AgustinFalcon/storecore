package com.storecore.catalog.domain

import java.math.BigDecimal
import java.time.Instant

enum class ProductStatus { DRAFT, ACTIVE, ARCHIVED, UNKNOWN;
    val active: Boolean get() = this == ACTIVE
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}
enum class VariantStatus { ACTIVE, INACTIVE, UNKNOWN;
    val active: Boolean get() = this == ACTIVE
    companion object { fun fromWire(value: Any?) = when(value) { true -> ACTIVE; false -> INACTIVE; is String -> entries.firstOrNull { it.name == value } ?: UNKNOWN; else -> UNKNOWN } }
}
enum class InventoryState { KNOWN, MISSING, UNKNOWN }
enum class VariantAvailability { UNKNOWN, UNAVAILABLE, AVAILABLE, OUT_OF_STOCK }
data class BoundedPage<T>(val items: List<T>, val total: Long, val page: Int, val size: Int) {
    val truncated: Boolean get() = total > page.toLong() * size.toLong() + items.size.toLong()
}
data class InventoryProjection(val variantId: String, val sku: String, val productName: String, val variantLabel: String,
    val available: Long?, val reserved: Long?, val onHand: Long?, val safety: Long?, val saleable: Long?, val updatedAt: Instant?, val state: InventoryState) {
    fun availability(): VariantAvailability = when(state) {
        InventoryState.MISSING -> VariantAvailability.UNAVAILABLE
        InventoryState.UNKNOWN -> VariantAvailability.UNKNOWN
        InventoryState.KNOWN -> if (saleable != null && saleable > 0) VariantAvailability.AVAILABLE else VariantAvailability.OUT_OF_STOCK
    }
    companion object {
        fun fromBalance(id: String, sku: String, name: String, label: String, present: Boolean, available: Long?, reserved: Long?, safety: Long?, updatedAt: Instant?): InventoryProjection {
            val valid = available != null && reserved != null && safety != null && available >= 0 && reserved >= 0 && safety >= 0 && updatedAt != null
            val state = if (!present) InventoryState.MISSING else if (!valid) InventoryState.UNKNOWN else InventoryState.KNOWN
            return if (state != InventoryState.KNOWN) InventoryProjection(id, sku, name, label, null, null, null, null, null, updatedAt.takeIf { present }, state)
            else InventoryProjection(id, sku, name, label, available, reserved, available!! + reserved!!, safety, (available - safety!!).coerceAtLeast(0), updatedAt, state)
        }
    }
}
data class OfferProjection(val id: String, val name: String)
data class PriceProjection(val base: BigDecimal, val original: BigDecimal, val effective: BigDecimal, val offer: OfferProjection?)
data class CatalogMedia(val id: String, val url: String, val sortOrder: Int, val primary: Boolean)
data class CatalogVariant(val id: String, val sku: String, val name: String, val status: VariantStatus, val attributes: Map<String, Any?>, val availableQuantity: Long?, val inventory: InventoryProjection) {
    val active: Boolean get() = status.active
    val availability: VariantAvailability get() = inventory.availability()
}
data class CatalogProduct(val id: String, val sku: String, val name: String, val description: String, val brand: String, val category: String,
    val status: ProductStatus, val media: List<CatalogMedia>, val variants: List<CatalogVariant>, val price: PriceProjection) {
    val active: Boolean get() = status.active
    val images: List<String> get() = media.map { it.url }
    val offerRef: String? get() = price.offer?.id
}
