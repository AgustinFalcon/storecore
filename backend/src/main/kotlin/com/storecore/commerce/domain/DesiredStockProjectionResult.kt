package com.storecore.commerce.domain

class DesiredStockOutcome private constructor(val wire: String) {
    override fun equals(other: Any?) = other is DesiredStockOutcome && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    companion object {
        val SnapshotAdvanced = DesiredStockOutcome("SNAPSHOT_ADVANCED")
        val Projected = DesiredStockOutcome("PROJECTED")
        val Unchanged = DesiredStockOutcome("UNCHANGED")
        val Withheld = DesiredStockOutcome("WITHHELD")
        val NoListing = DesiredStockOutcome("NO_LISTING")
        val Unknown = DesiredStockOutcome("unknown")
        private val known = listOf(SnapshotAdvanced, Projected, Unchanged, Withheld, NoListing)
        fun fromWire(raw: String?): DesiredStockOutcome {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}

data class DesiredStockProjectionResult(
    val variantId: Long,
    val listingId: Long?,
    val outcome: DesiredStockOutcome,
    val projectionVersion: Long?,
    val desiredQuantity: Int?,
)
