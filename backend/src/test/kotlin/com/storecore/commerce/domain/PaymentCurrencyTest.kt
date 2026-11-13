package com.storecore.commerce.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class PaymentCurrencyTest {
    @Test
    fun `wire translator accepts only exact ARS`() {
        assertEquals(PaymentCurrency.ARS, PaymentCurrency.fromWire("ARS"))
        listOf(null, "", "ars", "USD", " ARS ").forEach { raw ->
            assertEquals(PaymentCurrency.UNKNOWN, PaymentCurrency.fromWire(raw), "raw=$raw")
        }
    }

    @Test
    fun `verified match accepts only ARS against ARS`() {
        assertTrue(PaymentCurrency.ARS.matchesVerified(PaymentCurrency.ARS))
        assertFalse(PaymentCurrency.ARS.matchesVerified(PaymentCurrency.UNKNOWN))
        assertFalse(PaymentCurrency.UNKNOWN.matchesVerified(PaymentCurrency.ARS))
        assertFalse(PaymentCurrency.UNKNOWN.matchesVerified(PaymentCurrency.UNKNOWN))
    }
}
