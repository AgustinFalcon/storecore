package com.storecore.commerce.domain

sealed class DiscountType {
    abstract val wire: String

    data object Percent : DiscountType() {
        override val wire: String = "PERCENT"
    }
    data object Fixed : DiscountType() {
        override val wire: String = "FIXED"
    }
    data object Unknown : DiscountType() {
        override val wire: String = "unknown"
    }

    companion object {
        fun fromWire(raw: String?): DiscountType = when (raw?.trim()) {
            "PERCENT" -> Percent
            "FIXED" -> Fixed
            else -> Unknown
        }
    }
}
