package com.storecore.commerce

import com.storecore.commerce.domain.FulfillmentNextAction
import com.storecore.commerce.domain.OrderStatus
import com.storecore.commerce.domain.RmaStatus
import com.storecore.commerce.domain.RmaTransition
import com.storecore.commerce.domain.ShipmentStatus
import com.storecore.commerce.domain.ShipmentTransition
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

class FulfillmentNextActionTest {
    @Test
    fun `ship advances one stored status at a time`() {
        assertEquals("PACKED", FulfillmentNextAction.ship("PENDING_PAYMENT", "PENDING"))
        assertEquals("SHIPPED", FulfillmentNextAction.ship("PAID", "PREPARING"))
        assertEquals("DELIVERED", FulfillmentNextAction.ship("PAID", "SHIPPED"))
        assertNull(FulfillmentNextAction.ship("PAID", "DELIVERED"))
    }

    @Test
    fun `rma advances from none through inspection`() {
        assertEquals("RECEIVED", FulfillmentNextAction.rma("PAID", null))
        assertEquals("INSPECTED", FulfillmentNextAction.rma("PAID", "RETURN_RECEIVED"))
        assertEquals("ADJUSTED", FulfillmentNextAction.rma("PAID", "INSPECTED"))
        assertNull(FulfillmentNextAction.rma("PAID", "CLOSED"))
    }

    @Test
    fun `paid stock review has no next fulfillment action`() {
        assertNull(FulfillmentNextAction.ship("PAID_STOCK_REVIEW", "PENDING"))
        assertNull(FulfillmentNextAction.rma("PAID_STOCK_REVIEW", null))
        assertNull(FulfillmentNextAction.ship("PAID_STOCK_REVIEW", "PREPARING"))
        assertNull(FulfillmentNextAction.rma("PAID_STOCK_REVIEW", "RETURN_RECEIVED"))
    }

    @Test
    fun `unknown and cancelled wires have no next action`() {
        assertNull(FulfillmentNextAction.ship("PAID", "CANCELLED"))
        assertNull(FulfillmentNextAction.ship("PAID", "IN_TRANSIT"))
        assertNull(FulfillmentNextAction.rma("PAID", "REQUESTED"))
        assertNull(FulfillmentNextAction.rma("PAID", "RESTOCKED"))
        assertSame(OrderStatus.Unknown, OrderStatus.fromWire("FLAG_ON"))
        assertSame(ShipmentStatus.Unknown, ShipmentStatus.fromWire("IN_TRANSIT"))
        assertSame(RmaStatus.Unknown, RmaStatus.fromWire("RESTOCKED"))
        assertSame(ShipmentTransition.Packed, FulfillmentNextAction.ship(OrderStatus.Paid, ShipmentStatus.Pending))
        assertSame(RmaTransition.Received, FulfillmentNextAction.rma(OrderStatus.Paid, null))
    }
}
