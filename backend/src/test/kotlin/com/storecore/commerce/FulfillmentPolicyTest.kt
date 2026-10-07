package com.storecore.commerce

import com.storecore.commerce.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class FulfillmentPolicyTest {
    private val total = BigDecimal("100.00")
    private val payment = PaymentAccreditation(PaymentStatus.APPROVED, true, true, true, total, total, total, "ARS", "ARS", "ARS")
    private val sale = StockConsumption(1, 10, 2, 10, 2, true, 1)
    private val eligible = FulfillmentSnapshot(OrderStatus.PAID, total, "ARS", listOf(payment), false, listOf(SoldItem(10, 2)), listOf(sale))

    @Test fun `closed boundaries reject unknown and preserve absence semantics`() {
        OrderStatus.entries.forEach { assertEquals(it, OrderStatus.fromWire(it.name)) }
        PaymentStatus.entries.forEach { assertEquals(it, PaymentStatus.fromWire(it.name)) }
        ShipmentStatus.entries.filter { it != ShipmentStatus.NOT_CREATED }.forEach { assertEquals(it, ShipmentStatus.fromWire(it.name)) }
        RmaStatus.entries.filter { it != RmaStatus.NONE }.forEach { assertEquals(it, RmaStatus.fromWire(it.name)) }
        ShipmentCommand.entries.forEach { assertEquals(it, ShipmentCommand.fromWire(it.name)) }
        RmaCommand.entries.forEach { assertEquals(it, RmaCommand.fromWire(it.name)) }
        InspectionOutcome.entries.filter { it != InspectionOutcome.NOT_RECORDED }.forEach { assertEquals(it, InspectionOutcome.fromWire(it.name)) }
        listOf(null, "", " PAID", "paid", "CORRUPT").forEach {
            assertEquals(OrderStatus.UNKNOWN, OrderStatus.fromWire(it)); assertEquals(PaymentStatus.UNKNOWN, PaymentStatus.fromWire(it))
            assertEquals(ShipmentStatus.UNKNOWN, ShipmentStatus.fromWire(it)); assertEquals(RmaStatus.UNKNOWN, RmaStatus.fromWire(it))
            assertEquals(ShipmentCommand.UNKNOWN, ShipmentCommand.fromWire(it)); assertEquals(RmaCommand.UNKNOWN, RmaCommand.fromWire(it))
        }
        assertEquals(InspectionOutcome.NOT_RECORDED, InspectionOutcome.fromWire(null))
    }
    @Test fun `every nonpaid order and nonapproved payment blocks fulfillment`() {
        assertEquals(FulfillmentEligibility.ELIGIBLE, FulfillmentPolicy.evaluate(eligible))
        OrderStatus.entries.filter { it != OrderStatus.PAID }.forEach { assertEquals(FulfillmentEligibility.ORDER_NOT_PAID, FulfillmentPolicy.evaluate(eligible.copy(orderStatus = it))) }
        PaymentStatus.entries.filter { it != PaymentStatus.APPROVED }.forEach { assertEquals(FulfillmentEligibility.PAYMENT_NOT_VERIFIED, FulfillmentPolicy.evaluate(eligible.copy(accreditations = listOf(payment.copy(paymentStatus = it))))) }
    }
    @Test fun `unique durable accreditation and exact monetary binding are mandatory`() {
        for (payments in listOf(emptyList(), listOf(payment, payment), listOf(payment.copy(sameOrder = false)), listOf(payment.copy(sameProvider = false)), listOf(payment.copy(attemptAccredited = false)), listOf(payment.copy(paymentAmount = BigDecimal.ONE)), listOf(payment.copy(attemptAmount = BigDecimal.ONE)), listOf(payment.copy(confirmedAmount = BigDecimal.ONE)), listOf(payment.copy(paymentCurrency = "USD")), listOf(payment.copy(attemptCurrency = "USD")), listOf(payment.copy(confirmedCurrency = "USD")))) assertEquals(FulfillmentEligibility.PAYMENT_NOT_VERIFIED, FulfillmentPolicy.evaluate(eligible.copy(accreditations = payments)))
        assertEquals(FulfillmentEligibility.REVERSAL_OR_INCIDENT, FulfillmentPolicy.evaluate(eligible.copy(blockedByReview = true)))
    }
    @Test fun `counts and partial sums never substitute exact reservation sale proof`() {
        for (sales in listOf(emptyList(), listOf(sale, sale), listOf(sale.copy(reservationId = null)), listOf(sale.copy(variantId = 20)), listOf(sale.copy(quantity = 1)), listOf(sale.copy(quantity = 3)), listOf(sale.copy(consumedVariantId = 20)), listOf(sale.copy(consumedQuantity = 1)), listOf(sale.copy(reservationConsumed = false)), listOf(sale.copy(saleCount = 2)))) assertEquals(FulfillmentEligibility.STOCK_NOT_VERIFIED, FulfillmentPolicy.evaluate(eligible.copy(consumptions = sales)))
        assertEquals(FulfillmentEligibility.STOCK_NOT_VERIFIED, FulfillmentPolicy.evaluate(eligible.copy(items = emptyList())))
        assertEquals(FulfillmentEligibility.STOCK_NOT_VERIFIED, FulfillmentPolicy.evaluate(eligible.copy(items = listOf(SoldItem(10, 0)))))
    }
    @Test fun `journey cannot skip replay regress or reopen a return`() {
        assertSame(PackShipment, ShipmentJourney.transition(ShipmentStatus.NOT_CREATED, ShipmentCommand.PACKED))
        assertSame(PackShipment, ShipmentJourney.transition(ShipmentStatus.PENDING, ShipmentCommand.PACKED))
        assertSame(ShipShipment, ShipmentJourney.transition(ShipmentStatus.PREPARING, ShipmentCommand.SHIPPED))
        assertSame(DeliverShipment, ShipmentJourney.transition(ShipmentStatus.SHIPPED, ShipmentCommand.DELIVERED))
        assertNull(ShipmentJourney.transition(ShipmentStatus.PENDING, ShipmentCommand.DELIVERED))
        assertNull(ShipmentJourney.transition(ShipmentStatus.PREPARING, ShipmentCommand.PACKED))
        listOf(ShipmentStatus.UNKNOWN, ShipmentStatus.CANCELLED, ShipmentStatus.DELIVERED).forEach { assertNull(ShipmentJourney.next(it)) }
        assertTrue(ReceiveReturn.accepts(ShipmentStatus.DELIVERED, RmaStatus.NONE, RmaCommand.RECEIVED))
        RmaCommand.entries.filter { it != RmaCommand.RECEIVED }.forEach { assertFalse(ReceiveReturn.accepts(ShipmentStatus.DELIVERED, RmaStatus.NONE, it)) }
        RmaStatus.entries.filter { it != RmaStatus.NONE }.forEach { assertFalse(ReceiveReturn.accepts(ShipmentStatus.DELIVERED, it, RmaCommand.RECEIVED)) }
    }
}
