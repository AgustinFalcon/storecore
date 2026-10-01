package com.storecore.commerce.domain

sealed class InventoryEventType {
    abstract val wire: String

    data object Reservation : InventoryEventType() {
        override val wire: String = "RESERVATION"
    }
    data object Release : InventoryEventType() {
        override val wire: String = "RELEASE"
    }
    data object Sale : InventoryEventType() {
        override val wire: String = "SALE"
    }
    data object Refund : InventoryEventType() {
        override val wire: String = "REFUND"
    }
    data object ReturnReceived : InventoryEventType() {
        override val wire: String = "RETURN_RECEIVED"
    }
    data object Adjustment : InventoryEventType() {
        override val wire: String = "ADJUSTMENT"
    }
    data object Reconciliation : InventoryEventType() {
        override val wire: String = "RECONCILIATION"
    }
    data object StockCommitExternal : InventoryEventType() {
        override val wire: String = "STOCK_COMMIT_EXTERNAL"
    }
    data object Unknown : InventoryEventType() {
        override val wire: String = "unknown"
    }

    fun allowedOn(channel: InventoryChannel): Boolean =
        InventoryLedgerPairing.allowed(this, channel)

    companion object {
        fun fromWire(raw: String?): InventoryEventType = when (raw?.trim()) {
            "RESERVATION" -> Reservation
            "RELEASE" -> Release
            "SALE" -> Sale
            "REFUND" -> Refund
            "RETURN_RECEIVED" -> ReturnReceived
            "ADJUSTMENT" -> Adjustment
            "RECONCILIATION" -> Reconciliation
            "STOCK_COMMIT_EXTERNAL" -> StockCommitExternal
            else -> Unknown
        }
    }
}
