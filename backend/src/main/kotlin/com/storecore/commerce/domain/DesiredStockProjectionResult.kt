package com.storecore.commerce.domain

sealed class DesiredStockOutcome {
    abstract val wire: String

    data object SnapshotAdvanced : DesiredStockOutcome() {
        override val wire: String = "SNAPSHOT_ADVANCED"
    }
    data object Projected : DesiredStockOutcome() {
        override val wire: String = "PROJECTED"
    }
    data object Unchanged : DesiredStockOutcome() {
        override val wire: String = "UNCHANGED"
    }
    data object Withheld : DesiredStockOutcome() {
        override val wire: String = "WITHHELD"
    }
    data object NoListing : DesiredStockOutcome() {
        override val wire: String = "NO_LISTING"
    }
    data object Unknown : DesiredStockOutcome() {
        override val wire: String = "unknown"
    }

    companion object {
        fun fromWire(raw: String?): DesiredStockOutcome = when (raw?.trim()) {
            "SNAPSHOT_ADVANCED" -> SnapshotAdvanced
            "PROJECTED" -> Projected
            "UNCHANGED" -> Unchanged
            "WITHHELD" -> Withheld
            "NO_LISTING" -> NoListing
            else -> Unknown
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
