package com.storecore.overview.domain

import java.math.BigDecimal
import java.time.Instant

enum class OverviewPeriod {
    TODAY, LAST_7_DAYS, LAST_30_DAYS, UNKNOWN;

    companion object {
        fun fromWire(value: String?): OverviewPeriod = entries.firstOrNull { it.name == value } ?: UNKNOWN
    }
}

enum class OverviewFactState { KNOWN, UNAVAILABLE, UNKNOWN }

enum class OverviewUnavailableReason {
    PAYMENT_FACTS_INCOMPLETE, SHIPMENT_FACTS_INCOMPLETE, INVENTORY_FACTS_INCOMPLETE, UNKNOWN;

    companion object {
        fun fromWire(value: String?): OverviewUnavailableReason = entries.firstOrNull { it.name == value } ?: UNKNOWN
    }
}

data class OverviewFact<T>(val state: OverviewFactState, val value: T?, val reason: OverviewUnavailableReason?) {
    init {
        require((state == OverviewFactState.KNOWN && value != null && reason == null) ||
            (state == OverviewFactState.UNAVAILABLE && value == null && reason != null))
    }

    companion object {
        fun <T> known(value: T) = OverviewFact(OverviewFactState.KNOWN, value, null)
        fun <T> unavailable(reason: OverviewUnavailableReason) = OverviewFact<T>(OverviewFactState.UNAVAILABLE, null, reason)
    }
}

data class OverviewQueue<T>(
    val state: OverviewFactState,
    val items: List<T>,
    val totalCount: Long?,
    val truncated: Boolean,
    val reason: OverviewUnavailableReason?,
) {
    init {
        require((state == OverviewFactState.KNOWN && totalCount != null && totalCount >= items.size &&
            truncated == (totalCount > items.size) && reason == null) ||
            (state == OverviewFactState.UNAVAILABLE && items.isEmpty() && totalCount == null && !truncated && reason != null))
    }

    companion object {
        fun <T> known(items: List<T>, totalCount: Long = items.size.toLong()) =
            OverviewQueue(OverviewFactState.KNOWN, items, totalCount, totalCount > items.size, null)
        fun <T> unavailable(reason: OverviewUnavailableReason) =
            OverviewQueue<T>(OverviewFactState.UNAVAILABLE, emptyList(), null, false, reason)
    }
}

enum class PendingPaymentReason { NO_PAYMENT, PENDING, REJECTED, UNKNOWN }

enum class OverviewShipmentState { MISSING, PENDING, PREPARING, SHIPPED, UNKNOWN }

data class PendingPaymentItem(
    val orderId: Long,
    val orderNumber: String,
    val total: BigDecimal,
    val createdAt: Instant,
    val reason: PendingPaymentReason,
)

data class FulfillmentItem(
    val orderId: Long,
    val orderNumber: String,
    val total: BigDecimal,
    val paidAt: Instant,
    val shipmentState: OverviewShipmentState,
)

data class LowStockItem(
    val variantId: Long,
    val sku: String,
    val productName: String,
    val variantLabel: String,
    val availableQuantity: Int,
    val safetyStock: Int,
)

data class Overview(
    val period: OverviewPeriod,
    val timezone: String,
    val fromInclusive: Instant,
    val toExclusive: Instant,
    val accreditedRevenue: OverviewFact<BigDecimal>,
    val orderCount: OverviewFact<Long>,
    val activeCustomerCount: OverviewFact<Long>,
    val inventoryAtRiskCount: OverviewFact<Long>,
    val pendingPayments: OverviewQueue<PendingPaymentItem>,
    val fulfillment: OverviewQueue<FulfillmentItem>,
    val lowStock: OverviewQueue<LowStockItem>,
)
