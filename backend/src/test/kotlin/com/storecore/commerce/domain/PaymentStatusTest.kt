package com.storecore.commerce.domain

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PaymentStatusTest {
    @Test
    fun `fromWire maps the closed payment set`() {
        assertSame(PaymentStatus.Pending, PaymentStatus.fromWire("PENDING"))
        assertSame(PaymentStatus.Approved, PaymentStatus.fromWire(" APPROVED "))
        assertSame(PaymentStatus.Rejected, PaymentStatus.fromWire("REJECTED"))
        assertSame(PaymentStatus.Cancelled, PaymentStatus.fromWire("CANCELLED"))
        assertSame(PaymentStatus.Refunded, PaymentStatus.fromWire("REFUNDED"))
        assertSame(PaymentStatus.ChargedBack, PaymentStatus.fromWire("CHARGED_BACK"))
        assertTrue(PaymentStatus.Approved.isApproved())
        assertFalse(PaymentStatus.Pending.isApproved())
    }

    @Test
    fun `unknown payment does not echo the raw wire`() {
        assertSame(PaymentStatus.Unknown, PaymentStatus.fromWire("PAID_OK"))
        assertSame(PaymentStatus.Unknown, PaymentStatus.fromWire(""))
        assertSame(PaymentStatus.Unknown, PaymentStatus.fromWire(null))
        assertSame("unknown", PaymentStatus.Unknown.wire)
        assertFalse(PaymentStatus.Unknown.isApproved())
    }

    @Test
    fun `unpaid termination keeps reject vs cancel`() {
        assertSame(PaymentStatus.Rejected, PaymentStatus.forUnpaidTermination(CommercialEffect.REJECT))
        assertSame(PaymentStatus.Cancelled, PaymentStatus.forUnpaidTermination(CommercialEffect.CANCEL))
        assertSame(PaymentStatus.Cancelled, PaymentStatus.forUnpaidTermination(CommercialEffect.UNKNOWN))
    }
}
