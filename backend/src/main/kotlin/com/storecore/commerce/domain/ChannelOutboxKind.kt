package com.storecore.commerce.domain

class ChannelOutboxKind private constructor(val wire: String) {
    override fun equals(other: Any?) = other is ChannelOutboxKind && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    companion object {
        val SaleApplied = ChannelOutboxKind("SALE_APPLIED")
        val ListingStock = ChannelOutboxKind("LISTING_STOCK")
        val StockDesiredChanged = ChannelOutboxKind("STOCK_DESIRED_CHANGED")
        val Unknown = ChannelOutboxKind("unknown")
        private val known = listOf(SaleApplied, ListingStock, StockDesiredChanged)
        fun fromWire(raw: String?): ChannelOutboxKind {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}

class OutboxDeliveryStatus private constructor(val wire: String) {
    override fun equals(other: Any?) = other is OutboxDeliveryStatus && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    fun isPending(): Boolean = this === Pending

    companion object {
        val Pending = OutboxDeliveryStatus("PENDING")
        val Sent = OutboxDeliveryStatus("SENT")
        val Failed = OutboxDeliveryStatus("FAILED")
        val Dead = OutboxDeliveryStatus("DEAD")
        val Unknown = OutboxDeliveryStatus("unknown")
        private val known = listOf(Pending, Sent, Failed, Dead)
        fun fromWire(raw: String?): OutboxDeliveryStatus {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}
