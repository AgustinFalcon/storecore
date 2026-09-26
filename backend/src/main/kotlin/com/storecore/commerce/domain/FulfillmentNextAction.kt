package com.storecore.commerce.domain

/** Read-model hints for the next admin ship or RMA step. POST transitions stay in the order service. */
object FulfillmentNextAction {
    fun ship(orderStatus: String, shipmentStatus: String): String? {
        if (orderStatus == "PAID_STOCK_REVIEW") return null
        return when (shipmentStatus) {
            "PENDING" -> "PACKED"
            "PREPARING" -> "SHIPPED"
            "SHIPPED" -> "DELIVERED"
            else -> null
        }
    }

    fun rma(orderStatus: String, rmaStatus: String?): String? {
        if (orderStatus == "PAID_STOCK_REVIEW") return null
        return when (rmaStatus) {
            null -> "RECEIVED"
            "RETURN_RECEIVED" -> "INSPECTED"
            "INSPECTED" -> "ADJUSTED"
            else -> null
        }
    }
}
