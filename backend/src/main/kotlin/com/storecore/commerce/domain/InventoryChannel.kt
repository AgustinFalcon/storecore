package com.storecore.commerce.domain

sealed class InventoryChannel {
    abstract val wire: String

    data object Web : InventoryChannel() {
        override val wire: String = "WEB"
    }
    data object MercadoLibre : InventoryChannel() {
        override val wire: String = "MERCADO_LIBRE"
    }
    data object Internal : InventoryChannel() {
        override val wire: String = "INTERNAL"
    }
    data object ExternalCompanion : InventoryChannel() {
        override val wire: String = "EXTERNAL_BLACKSTORE"
    }
    data object Unknown : InventoryChannel() {
        override val wire: String = "unknown"
    }

    companion object {
        fun fromWire(raw: String?): InventoryChannel = when (raw?.trim()) {
            "WEB" -> Web
            "MERCADO_LIBRE" -> MercadoLibre
            "INTERNAL" -> Internal
            "EXTERNAL_BLACKSTORE" -> ExternalCompanion
            else -> Unknown
        }
    }
}
