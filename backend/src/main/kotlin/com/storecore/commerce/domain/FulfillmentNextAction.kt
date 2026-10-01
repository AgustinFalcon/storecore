package com.storecore.commerce.domain

/** Read-model hints for the next admin ship or RMA step. POST transitions stay in the order service. */
object FulfillmentNextAction {
    fun ship(orderStatus: String, shipmentStatus: String): String? =
        ship(OrderStatus.fromWire(orderStatus), ShipmentStatus.fromWire(shipmentStatus))?.wire

    fun rma(orderStatus: String, rmaStatus: String?): String? =
        rma(OrderStatus.fromWire(orderStatus), RmaStatus.fromOptionalWire(rmaStatus))?.wire

    fun ship(orderStatus: OrderStatus, shipmentStatus: ShipmentStatus): ShipmentTransition? {
        if (orderStatus === OrderStatus.PaidStockReview) {
            return null
        }
        return shipmentStatus.nextShipAction
    }

    fun rma(orderStatus: OrderStatus, rmaStatus: RmaStatus?): RmaTransition? {
        if (orderStatus === OrderStatus.PaidStockReview) {
            return null
        }
        if (rmaStatus == null) {
            return RmaTransition.Received
        }
        return rmaStatus.nextRmaAction
    }
}
