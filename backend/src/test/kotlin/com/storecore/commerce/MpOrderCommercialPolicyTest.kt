package com.storecore.commerce

import com.storecore.commerce.domain.CommercialEffect
import com.storecore.commerce.domain.MpOrderCommercialPolicy
import com.storecore.commerce.domain.OfficialOrderStatusInput
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class MpOrderCommercialPolicyTest {
    @Test
    fun `processed accredited with matching total accredits`() {
        assertEquals(CommercialEffect.ACCREDIT, classify("processed", "accredited", "100.00", "100.00"))
    }

    @Test
    fun `both official total refund forms map to the same review effect`() {
        assertEquals(CommercialEffect.REFUND_TOTAL, classify("processed", "refunded", "100.00", "100.00"))
        assertEquals(CommercialEffect.REFUND_TOTAL, classify("refunded", "refunded", "100.00", "100.00"))
    }

    @Test
    fun `partial refund and chargeback stay under review effects`() {
        assertEquals(CommercialEffect.REFUND_PARTIAL, classify("processed", "partially_refunded", "40.00", "100.00"))
        assertEquals(CommercialEffect.CHARGEBACK, classify("processed", "charged_back", "100.00", "100.00"))
    }

    @Test
    fun `unknown pairs do not accredit`() {
        assertEquals(CommercialEffect.UNKNOWN, classify("mystery", "unknown", "100.00", "100.00"))
        assertEquals(CommercialEffect.UNKNOWN, classify("processed", "accredited", "80.00", "100.00"))
    }

    private fun classify(status: String, detail: String, paid: String, expected: String) =
        MpOrderCommercialPolicy.classify(
            OfficialOrderStatusInput(status, detail, BigDecimal(paid), BigDecimal(expected)),
        )
}
