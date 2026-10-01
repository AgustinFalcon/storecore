package com.storecore.commerce.domain

class OrderStatus private constructor(val wire: String) {
    override fun equals(other: Any?) = other is OrderStatus && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    companion object {
        val Created = OrderStatus("CREATED")
        val PendingPayment = OrderStatus("PENDING_PAYMENT")
        val Paid = OrderStatus("PAID")
        val PaidStockReview = OrderStatus("PAID_STOCK_REVIEW")
        val Cancelled = OrderStatus("CANCELLED")
        val Expired = OrderStatus("EXPIRED")
        val Refunded = OrderStatus("REFUNDED")
        val Unknown = OrderStatus("unknown")
        private val known = listOf(Created, PendingPayment, Paid, PaidStockReview, Cancelled, Expired, Refunded)

        fun fromWire(raw: String?): OrderStatus {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}
