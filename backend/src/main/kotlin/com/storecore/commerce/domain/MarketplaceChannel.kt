package com.storecore.commerce.domain

sealed class MarketplaceChannel {
    abstract val wire: String

    data object MercadoLibre : MarketplaceChannel() {
        override val wire: String = "MERCADO_LIBRE"
    }
    data object Unknown : MarketplaceChannel() {
        override val wire: String = "unknown"
    }

    fun isMercadoLibre(): Boolean = this === MercadoLibre

    companion object {
        fun fromWire(raw: String?): MarketplaceChannel = when (raw?.trim()) {
            "MERCADO_LIBRE" -> MercadoLibre
            else -> Unknown
        }
    }
}
