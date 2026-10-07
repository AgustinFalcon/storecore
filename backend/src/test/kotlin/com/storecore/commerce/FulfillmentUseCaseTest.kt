package com.storecore.commerce

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.storecore.commerce.application.*
import com.storecore.commerce.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class FulfillmentUseCaseTest {
    private val total = BigDecimal("100.00")
    private val snapshot = FulfillmentSnapshot(OrderStatus.PAID, total, "ARS", listOf(PaymentAccreditation(PaymentStatus.APPROVED, true, true, true, total, total, total, "ARS", "ARS", "ARS")), false, listOf(SoldItem(10, 1)), listOf(StockConsumption(1, 10, 1, 10, 1, true, 1)))
    private class Records : FulfillmentRecordPort {
        var shipment = ShipmentStatus.NOT_CREATED
        var rma = RmaStatus.NONE
        var shipmentsSaved = 0
        var returnsSaved = 0
        override fun shipmentStatus(orderId: Long) = shipment
        override fun rmaStatus(orderId: Long) = rma
        override fun saveShipment(orderId: Long, step: ShipmentStep, tracking: String?, actorId: Long) { shipmentsSaved++; shipment = step.target }
        override fun receiveReturn(orderId: Long) { returnsSaved++; rma = RmaStatus.RETURN_RECEIVED }
    }
    private fun evidence(value: FulfillmentSnapshot) = object : FulfillmentEvidencePort { override fun load(orderId: Long) = value }
    @Test fun `rejected payment or transition never invokes a persistence port`() {
        val records = Records()
        val unpaid = FulfillmentUseCase(evidence(snapshot.copy(orderStatus = OrderStatus.PENDING_PAYMENT)), records)
        assertThrows(FulfillmentRejected::class.java) { unpaid.shipment(1, ShipmentCommand.PACKED, null, 1) }
        assertThrows(FulfillmentRejected::class.java) { unpaid.receive(1, RmaCommand.RECEIVED) }
        val paid = FulfillmentUseCase(evidence(snapshot), records)
        assertThrows(FulfillmentRejected::class.java) { paid.shipment(1, ShipmentCommand.DELIVERED, null, 1) }
        assertThrows(FulfillmentRejected::class.java) { paid.receive(1, RmaCommand.RECEIVED) }
        assertEquals(0, records.shipmentsSaved); assertEquals(0, records.returnsSaved)
    }
    @Test fun `ordered steps and a single reception cannot call deferred stock effects`() {
        val records = Records()
        val useCase = FulfillmentUseCase(evidence(snapshot), records)
        listOf(ShipmentCommand.PACKED, ShipmentCommand.SHIPPED, ShipmentCommand.DELIVERED).forEach { useCase.shipment(1, it, null, 1) }
        useCase.receive(1, RmaCommand.RECEIVED)
        listOf(RmaCommand.RECEIVED, RmaCommand.INSPECTED, RmaCommand.ADJUSTED, RmaCommand.UNKNOWN).forEach { command -> assertThrows(FulfillmentRejected::class.java) { useCase.receive(1, command) } }
        assertEquals(3, records.shipmentsSaved); assertEquals(1, records.returnsSaved)
    }
    @Test fun `ambiguous historical return suppresses every persistence action`() {
        val records = Records().apply { rma = RmaStatus.UNKNOWN }
        val useCase = FulfillmentUseCase(evidence(snapshot), records)
        ShipmentCommand.entries.forEach { command -> assertThrows(FulfillmentRejected::class.java) { useCase.shipment(1, command, null, 1) } }
        records.shipment = ShipmentStatus.DELIVERED
        RmaCommand.entries.forEach { command -> assertThrows(FulfillmentRejected::class.java) { useCase.receive(1, command) } }
        assertEquals(0, records.shipmentsSaved); assertEquals(0, records.returnsSaved)
    }
    @Test fun `closed dto serializes compatible known wires and safe absence unknown sentinels`() {
        val mapper = jacksonObjectMapper()
        val receipt = mapper.readTree(mapper.writeValueAsString(CheckoutReceipt("1", PaymentStatus.PENDING, OrderStatus.PENDING_PAYMENT)))
        assertEquals(PaymentStatus.PENDING.name, receipt.path("paymentStatus").asText())
        assertEquals(OrderStatus.PENDING_PAYMENT.name, receipt.path("orderStatus").asText())
        val unknown = mapper.readTree(mapper.writeValueAsString(OrderView("1", OrderStatus.fromWire("UNTRUSTED"), PaymentStatus.UNKNOWN, ShipmentStatus.NOT_CREATED, null, total, emptyList())))
        assertEquals(OrderStatus.UNKNOWN.name, unknown.path("orderStatus").asText())
        assertEquals(ShipmentStatus.NOT_CREATED.name, unknown.path("shipmentStatus").asText())
        assertEquals(RmaStatus.NONE.name, unknown.path("rmaStatus").asText())
        assertTrue(unknown.path("shipmentAction").isNull)
        assertFalse(unknown.toString().contains("UNTRUSTED"))
    }
}
