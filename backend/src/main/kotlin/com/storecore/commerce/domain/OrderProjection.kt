package com.storecore.commerce.domain

import java.time.Instant

enum class OrderFactState { KNOWN, UNAVAILABLE, UNKNOWN }
enum class OrderUnavailableReason { SOURCE_MISSING, SOURCE_CONTRADICTORY, EXTERNAL_NOT_AVAILABLE, UNKNOWN }
data class OrderFact<T>(val state: OrderFactState, val value: T?, val reason: OrderUnavailableReason?) {
    companion object {
        fun <T> known(value: T) = OrderFact(OrderFactState.KNOWN, value, null)
        fun <T> unavailable(reason: OrderUnavailableReason) = OrderFact<T>(OrderFactState.UNAVAILABLE, null, reason)
    }
}
enum class OrderTimelineEventKind {
    ORDER_CREATED, PAYMENT_PENDING, PAYMENT_ACCREDITED, PAYMENT_REVERSED, SHIPMENT_PREPARING,
    SHIPMENT_SHIPPED, SHIPMENT_DELIVERED, SHIPMENT_CANCELLED, RETURN_OPENED, RETURN_RESOLVED, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}
data class OrderTimelineEvent(val id: String, val kind: OrderTimelineEventKind, val occurredAt: Instant)
data class DeliverySnapshot(val recipient: String?, val street: String?, val city: String?, val province: String?, val postalCode: String?, val country: String?)
enum class ReturnEligibility {
    ELIGIBLE, NOT_DELIVERED, ALREADY_OPEN, PAYMENT_UNVERIFIED, UNAVAILABLE, UNKNOWN;
    companion object {
        fun evaluate(payment: OrderFact<PaymentStatus>, shipment: ShipmentStatus, returns: RmaStatus): ReturnEligibility = when {
            payment.state != OrderFactState.KNOWN || payment.value != PaymentStatus.APPROVED -> PAYMENT_UNVERIFIED
            shipment != ShipmentStatus.DELIVERED -> NOT_DELIVERED
            returns == RmaStatus.UNKNOWN -> UNAVAILABLE
            returns != RmaStatus.NONE -> ALREADY_OPEN
            else -> ELIGIBLE
        }
    }
}
data class OrderPage<T>(val items: List<T>, val page: Int, val size: Int, val total: Long) {
    val truncated: Boolean get() = total > items.size
}
