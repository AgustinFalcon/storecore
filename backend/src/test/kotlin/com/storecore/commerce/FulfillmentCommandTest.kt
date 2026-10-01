package com.storecore.commerce

import com.storecore.commerce.domain.FulfillmentCommand
import com.storecore.commerce.domain.OrderStatus
import com.storecore.commerce.domain.RmaStatus
import com.storecore.commerce.domain.RmaTransition
import com.storecore.commerce.domain.ShipmentStatus
import com.storecore.commerce.domain.ShipmentTransition
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

class FulfillmentCommandTest {
    @Test
    fun `ship post maps the hinted transition to the stored status`() {
        assertEquals("PREPARING", FulfillmentCommand.storedShipment("PENDING_PAYMENT", "PENDING", "PACKED"))
        assertEquals("SHIPPED", FulfillmentCommand.storedShipment("PAID", "PREPARING", "SHIPPED"))
        assertEquals("DELIVERED", FulfillmentCommand.storedShipment("PAID", "SHIPPED", "DELIVERED"))
        assertSame(ShipmentStatus.Preparing, FulfillmentCommand.storedShipment(OrderStatus.Paid, ShipmentStatus.Pending, ShipmentTransition.Packed))
    }

    @Test
    fun `ship post rejects skip unknown and paid stock review`() {
        assertNull(FulfillmentCommand.storedShipment("PAID", "PENDING", "DELIVERED"))
        assertNull(FulfillmentCommand.storedShipment("PAID", "DELIVERED", "PACKED"))
        assertNull(FulfillmentCommand.storedShipment("PAID", "PENDING", "IN_TRANSIT"))
        assertNull(FulfillmentCommand.storedShipment("PAID_STOCK_REVIEW", "PENDING", "PACKED"))
        assertNull(FulfillmentCommand.storedShipment("PAID", "CANCELLED", "PACKED"))
    }

    @Test
    fun `rma post maps the hinted transition to the stored status`() {
        assertEquals("RETURN_RECEIVED", FulfillmentCommand.storedRma("PAID", null, "RECEIVED"))
        assertEquals("INSPECTED", FulfillmentCommand.storedRma("PAID", "RETURN_RECEIVED", "INSPECTED"))
        assertEquals("CLOSED", FulfillmentCommand.storedRma("PAID", "INSPECTED", "ADJUSTED"))
        assertSame(RmaStatus.ReturnReceived, FulfillmentCommand.storedRma(OrderStatus.Paid, null, RmaTransition.Received))
    }

    @Test
    fun `rma post rejects skip unknown and paid stock review`() {
        assertNull(FulfillmentCommand.storedRma("PAID", null, "ADJUSTED"))
        assertNull(FulfillmentCommand.storedRma("PAID", "CLOSED", "RECEIVED"))
        assertNull(FulfillmentCommand.storedRma("PAID", null, "RESTOCKED"))
        assertNull(FulfillmentCommand.storedRma("PAID_STOCK_REVIEW", null, "RECEIVED"))
        assertNull(FulfillmentCommand.storedRma("PAID", "REQUESTED", "INSPECTED"))
    }
}
