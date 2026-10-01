package com.storecore.commerce.domain

sealed class ShipmentTransition {
    abstract val wire: String

    data object Packed : ShipmentTransition() {
        override val wire: String = "PACKED"
    }
    data object Shipped : ShipmentTransition() {
        override val wire: String = "SHIPPED"
    }
    data object Delivered : ShipmentTransition() {
        override val wire: String = "DELIVERED"
    }
    data object Unknown : ShipmentTransition() {
        override val wire: String = "unknown"
    }

    companion object {
        fun fromWire(raw: String?): ShipmentTransition = when (raw?.trim()) {
            "PACKED" -> Packed
            "SHIPPED" -> Shipped
            "DELIVERED" -> Delivered
            else -> Unknown
        }
    }
}

sealed class ShipmentStatus {
    abstract val wire: String
    abstract val nextShipAction: ShipmentTransition?

    data object Pending : ShipmentStatus() {
        override val wire: String = "PENDING"
        override val nextShipAction: ShipmentTransition? = ShipmentTransition.Packed
    }
    data object Preparing : ShipmentStatus() {
        override val wire: String = "PREPARING"
        override val nextShipAction: ShipmentTransition? = ShipmentTransition.Shipped
    }
    data object Shipped : ShipmentStatus() {
        override val wire: String = "SHIPPED"
        override val nextShipAction: ShipmentTransition? = ShipmentTransition.Delivered
    }
    data object Delivered : ShipmentStatus() {
        override val wire: String = "DELIVERED"
        override val nextShipAction: ShipmentTransition? = null
    }
    data object Cancelled : ShipmentStatus() {
        override val wire: String = "CANCELLED"
        override val nextShipAction: ShipmentTransition? = null
    }
    data object Unknown : ShipmentStatus() {
        override val wire: String = "unknown"
        override val nextShipAction: ShipmentTransition? = null
    }

    companion object {
        fun fromWire(raw: String?): ShipmentStatus = when (raw?.trim()) {
            "PENDING" -> Pending
            "PREPARING" -> Preparing
            "SHIPPED" -> Shipped
            "DELIVERED" -> Delivered
            "CANCELLED" -> Cancelled
            else -> Unknown
        }
    }
}
