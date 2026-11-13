package com.storecore.commerce.domain

enum class PaymentCurrency {
    ARS,
    UNKNOWN;

    fun matchesVerified(other: PaymentCurrency): Boolean = this == ARS && other == ARS

    companion object {
        fun fromWire(raw: String?): PaymentCurrency = if (raw == ARS.name) ARS else UNKNOWN
    }
}
