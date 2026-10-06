package com.storecore.commerce.domain

enum class OrderStatus {
    CREATED, PENDING_PAYMENT, PAID, PAID_STOCK_REVIEW, CANCELLED, EXPIRED, REFUNDED, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}

enum class PaymentStatus {
    PENDING, APPROVED, REJECTED, CANCELLED, REFUNDED, CHARGED_BACK, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}

enum class ShipmentStatus {
    NOT_CREATED, PENDING, PREPARING, SHIPPED, DELIVERED, CANCELLED, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value && it != NOT_CREATED } ?: UNKNOWN }
}

enum class RmaStatus {
    NONE, REQUESTED, APPROVED, RETURN_RECEIVED, INSPECTED, REJECTED, CLOSED, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value && it != NONE } ?: UNKNOWN }
}

enum class InspectionOutcome {
    NOT_RECORDED, RESTOCK, DAMAGED, REJECTED, UNKNOWN;
    companion object { fun fromWire(value: String?) = if (value == null) NOT_RECORDED else entries.firstOrNull { it.name == value && it != NOT_RECORDED } ?: UNKNOWN }
}

enum class ShipmentCommand {
    PACKED, SHIPPED, DELIVERED, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}

enum class RmaCommand {
    RECEIVED, INSPECTED, ADJUSTED, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}

enum class ReservationStatus {
    ACTIVE, CONSUMED, RELEASED, EXPIRED, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}
