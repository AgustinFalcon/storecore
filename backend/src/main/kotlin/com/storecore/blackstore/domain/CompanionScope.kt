package com.storecore.blackstore.domain

class CompanionScope private constructor(val wire: String) {
    override fun equals(other: Any?) = other is CompanionScope && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    companion object {
        val CATALOG_READ = CompanionScope("catalog:read")
        val STOCK_RESERVE = CompanionScope("stock:reserve")
        val STOCK_COMMIT = CompanionScope("stock:commit")
        val STOCK_RELEASE = CompanionScope("stock:release")
        val STOCK_READ = CompanionScope("stock:read")
        val COST_READ = CompanionScope("cost:read")
        val PRICE_OVERRIDE = CompanionScope("price:override")
        val Unknown = CompanionScope("unknown")

        private val known = listOf(CATALOG_READ, STOCK_RESERVE, STOCK_COMMIT, STOCK_RELEASE, STOCK_READ, COST_READ, PRICE_OVERRIDE)

        fun fromWire(raw: String?): CompanionScope {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}
