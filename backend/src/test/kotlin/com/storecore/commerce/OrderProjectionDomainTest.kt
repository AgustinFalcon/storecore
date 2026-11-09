package com.storecore.commerce

import com.storecore.commerce.domain.*
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class OrderProjectionDomainTest {
    @Test fun `return information uses payment then delivery then persisted return precedence`() {
        val paid = OrderFact.known(PaymentStatus.APPROVED)
        for (payment in listOf(OrderFact.unavailable<PaymentStatus>(OrderUnavailableReason.SOURCE_MISSING), OrderFact.known(PaymentStatus.REFUNDED), OrderFact.known(PaymentStatus.CHARGED_BACK), OrderFact.known(PaymentStatus.UNKNOWN))) {
            assertEquals(ReturnEligibility.PAYMENT_UNVERIFIED, ReturnEligibility.evaluate(payment, ShipmentStatus.DELIVERED, RmaStatus.NONE))
            assertEquals(ReturnEligibility.PAYMENT_UNVERIFIED, ReturnEligibility.evaluate(payment, ShipmentStatus.PENDING, RmaStatus.REQUESTED))
        }
        assertEquals(ReturnEligibility.NOT_DELIVERED, ReturnEligibility.evaluate(paid, ShipmentStatus.UNKNOWN, RmaStatus.UNKNOWN))
        assertEquals(ReturnEligibility.NOT_DELIVERED, ReturnEligibility.evaluate(paid, ShipmentStatus.SHIPPED, RmaStatus.REQUESTED))
        assertEquals(ReturnEligibility.UNAVAILABLE, ReturnEligibility.evaluate(paid, ShipmentStatus.DELIVERED, RmaStatus.UNKNOWN))
        for (status in RmaStatus.entries.filter { it != RmaStatus.NONE && it != RmaStatus.UNKNOWN }) {
            assertEquals(ReturnEligibility.ALREADY_OPEN, ReturnEligibility.evaluate(paid, ShipmentStatus.DELIVERED, status))
        }
        assertEquals(ReturnEligibility.ELIGIBLE, ReturnEligibility.evaluate(paid, ShipmentStatus.DELIVERED, RmaStatus.NONE))
    }

    @Test fun `unknown timeline values stay closed and last pages are complete`() {
        assertEquals(OrderTimelineEventKind.UNKNOWN, OrderTimelineEventKind.fromWire("provider-internal-event"))
        for (kind in OrderTimelineEventKind.entries) assertEquals(kind, OrderTimelineEventKind.fromWire(kind.name))
        assertEquals(false, OrderPage(listOf(1), 1, 1, 2).truncated)
        assertEquals(false, OrderPage(emptyList<Int>(), 0, 25, 0).truncated)
    }

    @Test fun `unavailable payment preserves closed blocking reason without enabling fulfillment`() {
        val unavailable = OrderFact.unavailable<PaymentStatus>(OrderUnavailableReason.SOURCE_CONTRADICTORY)
        assertEquals(FulfillmentEligibility.REVERSAL_OR_INCIDENT, FulfillmentEligibility.REVERSAL_OR_INCIDENT.withPayment(unavailable))
        assertEquals(FulfillmentEligibility.ORDER_NOT_PAID, FulfillmentEligibility.ORDER_NOT_PAID.withPayment(unavailable))
        assertEquals(FulfillmentEligibility.PAYMENT_NOT_VERIFIED, FulfillmentEligibility.ELIGIBLE.withPayment(unavailable))
        assertEquals(ReturnEligibility.PAYMENT_UNVERIFIED, ReturnEligibility.evaluate(unavailable, ShipmentStatus.DELIVERED, RmaStatus.NONE))
    }
}
