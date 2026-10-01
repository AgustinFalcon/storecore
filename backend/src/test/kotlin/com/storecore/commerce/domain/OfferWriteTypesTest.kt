package com.storecore.commerce.domain

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class OfferWriteTypesTest {
    @Test
    fun `offer status create accepts only draft and active`() {
        assertSame(OfferStatus.Draft, OfferStatus.fromWire("DRAFT"))
        assertSame(OfferStatus.Active, OfferStatus.fromWire(" ACTIVE "))
        assertTrue(OfferStatus.Draft.writableOnCreate)
        assertTrue(OfferStatus.Active.writableOnCreate)
        assertFalse(OfferStatus.Paused.writableOnCreate)
        assertFalse(OfferStatus.Ended.writableOnCreate)
        assertFalse(OfferStatus.Unknown.writableOnCreate)
    }

    @Test
    fun `unknown offer status does not echo the raw wire`() {
        assertSame(OfferStatus.Unknown, OfferStatus.fromWire("SCHEDULED"))
        assertSame(OfferStatus.Unknown, OfferStatus.fromWire(""))
        assertSame(OfferStatus.Unknown, OfferStatus.fromWire(null))
        assertSame("unknown", OfferStatus.Unknown.wire)
    }

    @Test
    fun `discount type maps percent and fixed once`() {
        assertSame(DiscountType.Percent, DiscountType.fromWire("PERCENT"))
        assertSame(DiscountType.Fixed, DiscountType.fromWire("FIXED"))
        assertSame(DiscountType.Unknown, DiscountType.fromWire("percent"))
        assertSame(DiscountType.Unknown, DiscountType.fromWire("BOGO"))
        assertSame(DiscountType.Unknown, DiscountType.fromWire(null))
        assertSame("unknown", DiscountType.Unknown.wire)
    }
}
