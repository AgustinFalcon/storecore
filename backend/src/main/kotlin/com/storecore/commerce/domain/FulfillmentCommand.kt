package com.storecore.commerce.domain

/** POST ship/RMA: accept only the hinted next transition and persist the stored status. */
object FulfillmentCommand {
    fun storedShipment(orderStatus: String, shipmentStatus: String, requested: String): String? =
        storedShipment(
            OrderStatus.fromWire(orderStatus),
            ShipmentStatus.fromWire(shipmentStatus),
            ShipmentTransition.fromWire(requested),
        )?.wire

    fun storedRma(orderStatus: String, rmaStatus: String?, requested: String): String? =
        storedRma(
            OrderStatus.fromWire(orderStatus),
            RmaStatus.fromOptionalWire(rmaStatus),
            RmaTransition.fromWire(requested),
        )?.wire

    fun storedShipment(
        orderStatus: OrderStatus,
        shipmentStatus: ShipmentStatus,
        requested: ShipmentTransition,
    ): ShipmentStatus? {
        if (FulfillmentNextAction.ship(orderStatus, shipmentStatus) != requested) {
            return null
        }
        return when (requested) {
            is ShipmentTransition.Packed -> ShipmentStatus.Preparing
            is ShipmentTransition.Shipped -> ShipmentStatus.Shipped
            is ShipmentTransition.Delivered -> ShipmentStatus.Delivered
            is ShipmentTransition.Unknown -> null
        }
    }

    fun storedRma(
        orderStatus: OrderStatus,
        rmaStatus: RmaStatus?,
        requested: RmaTransition,
    ): RmaStatus? {
        if (FulfillmentNextAction.rma(orderStatus, rmaStatus) != requested) {
            return null
        }
        return when (requested) {
            is RmaTransition.Received -> RmaStatus.ReturnReceived
            is RmaTransition.Inspected -> RmaStatus.Inspected
            is RmaTransition.Adjusted -> RmaStatus.Closed
            is RmaTransition.Unknown -> null
        }
    }
}
