package com.storecore.commerce.domain

class MarketplaceChannel private constructor(val wire: String) {
    override fun equals(other: Any?) = other is MarketplaceChannel && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    fun isMercadoLibre(): Boolean = this === MercadoLibre

    companion object {
        val MercadoLibre = MarketplaceChannel("MERCADO_LIBRE")
        val Unknown = MarketplaceChannel("unknown")

        private val known = listOf(MercadoLibre)

        fun fromWire(raw: String?): MarketplaceChannel {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}
