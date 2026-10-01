package com.storecore.commerce.domain

class ShipmentTransition private constructor(val wire: String) {
    override fun equals(other: Any?) = other is ShipmentTransition && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    companion object {
        val Packed = ShipmentTransition("PACKED")
        val Shipped = ShipmentTransition("SHIPPED")
        val Delivered = ShipmentTransition("DELIVERED")
        val Unknown = ShipmentTransition("unknown")
        private val known = listOf(Packed, Shipped, Delivered)

        fun fromWire(raw: String?): ShipmentTransition {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}

class ShipmentStatus private constructor(
    val wire: String,
    val nextShipAction: ShipmentTransition?,
) {
    override fun equals(other: Any?) = other is ShipmentStatus && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    companion object {
        val Pending = ShipmentStatus("PENDING", ShipmentTransition.Packed)
        val Preparing = ShipmentStatus("PREPARING", ShipmentTransition.Shipped)
        val Shipped = ShipmentStatus("SHIPPED", ShipmentTransition.Delivered)
        val Delivered = ShipmentStatus("DELIVERED", null)
        val Cancelled = ShipmentStatus("CANCELLED", null)
        val Unknown = ShipmentStatus("unknown", null)
        private val known = listOf(Pending, Preparing, Shipped, Delivered, Cancelled)

        fun fromWire(raw: String?): ShipmentStatus {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}
