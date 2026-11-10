package com.storecore.commerce

import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.application.LocalOfferDiscount
import com.storecore.offers.domain.DiscountKind
import java.math.BigDecimal
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class LocalOfferDiscountTest {
    @Test fun `unknown stored discount rejects instead of silently charging base price`() {
        val failure = assertFailsWith<CommerceValidation> {
            LocalOfferDiscount(DiscountKind.fromWire("FUTURE_KIND"), BigDecimal.TEN).applyTo(BigDecimal("100.00"))
        }
        assertEquals("OFFER_DISCOUNT_KIND_INVALID", failure.message)
    }

    @Test fun `local checkout uses closed discount rules including rounding and cap`() {
        assertEquals(BigDecimal("0.33"), LocalOfferDiscount(DiscountKind.PERCENT, BigDecimal("33.33")).applyTo(BigDecimal.ONE))
        assertEquals(BigDecimal("100.00"), LocalOfferDiscount(DiscountKind.FIXED, BigDecimal("150.00")).applyTo(BigDecimal("100.00")))
    }
}
