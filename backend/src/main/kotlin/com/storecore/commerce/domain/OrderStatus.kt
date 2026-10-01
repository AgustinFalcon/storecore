package com.storecore.commerce.domain

sealed class OrderStatus {
    abstract val wire: String

    data object Created : OrderStatus() {
        override val wire: String = "CREATED"
    }
    data object PendingPayment : OrderStatus() {
        override val wire: String = "PENDING_PAYMENT"
    }
    data object Paid : OrderStatus() {
        override val wire: String = "PAID"
    }
    data object PaidStockReview : OrderStatus() {
        override val wire: String = "PAID_STOCK_REVIEW"
    }
    data object Cancelled : OrderStatus() {
        override val wire: String = "CANCELLED"
    }
    data object Expired : OrderStatus() {
        override val wire: String = "EXPIRED"
    }
    data object Refunded : OrderStatus() {
        override val wire: String = "REFUNDED"
    }
    data object Unknown : OrderStatus() {
        override val wire: String = "unknown"
    }

    companion object {
        fun fromWire(raw: String?): OrderStatus = when (raw?.trim()) {
            "CREATED" -> Created
            "PENDING_PAYMENT" -> PendingPayment
            "PAID" -> Paid
            "PAID_STOCK_REVIEW" -> PaidStockReview
            "CANCELLED" -> Cancelled
            "EXPIRED" -> Expired
            "REFUNDED" -> Refunded
            else -> Unknown
        }
    }
}
