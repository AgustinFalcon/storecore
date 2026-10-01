package com.storecore.commerce.domain

sealed class ChannelOutboxKind {
    abstract val wire: String

    data object SaleApplied : ChannelOutboxKind() {
        override val wire: String = "SALE_APPLIED"
    }
    data object ListingStock : ChannelOutboxKind() {
        override val wire: String = "LISTING_STOCK"
    }
    data object StockDesiredChanged : ChannelOutboxKind() {
        override val wire: String = "STOCK_DESIRED_CHANGED"
    }
    data object Unknown : ChannelOutboxKind() {
        override val wire: String = "unknown"
    }

    companion object {
        fun fromWire(raw: String?): ChannelOutboxKind = when (raw?.trim()) {
            "SALE_APPLIED" -> SaleApplied
            "LISTING_STOCK" -> ListingStock
            "STOCK_DESIRED_CHANGED" -> StockDesiredChanged
            else -> Unknown
        }
    }
}

sealed class OutboxDeliveryStatus {
    abstract val wire: String

    data object Pending : OutboxDeliveryStatus() {
        override val wire: String = "PENDING"
    }
    data object Sent : OutboxDeliveryStatus() {
        override val wire: String = "SENT"
    }
    data object Failed : OutboxDeliveryStatus() {
        override val wire: String = "FAILED"
    }
    data object Dead : OutboxDeliveryStatus() {
        override val wire: String = "DEAD"
    }
    data object Unknown : OutboxDeliveryStatus() {
        override val wire: String = "unknown"
    }

    fun isPending(): Boolean = this === Pending

    companion object {
        fun fromWire(raw: String?): OutboxDeliveryStatus = when (raw?.trim()) {
            "PENDING" -> Pending
            "SENT" -> Sent
            "FAILED" -> Failed
            "DEAD" -> Dead
            else -> Unknown
        }
    }
}
