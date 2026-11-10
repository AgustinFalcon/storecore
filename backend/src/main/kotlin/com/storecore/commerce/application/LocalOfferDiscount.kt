package com.storecore.commerce.application

import com.storecore.offers.domain.DiscountKind
import java.math.BigDecimal

/** Rejects an unusable stored policy; the closed kind owns all calculation rules. */
class LocalOfferDiscount(private val kind: DiscountKind, private val value: BigDecimal) {
    fun applyTo(base: BigDecimal): BigDecimal = kind.discount(base, value)
        ?: throw CommerceValidation("OFFER_DISCOUNT_KIND_INVALID")
}
