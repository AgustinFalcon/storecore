package com.storecore.commerce.domain

sealed class PaymentStatus {
    abstract val wire: String

    data object Pending : PaymentStatus() {
        override val wire: String = "PENDING"
    }
    data object Approved : PaymentStatus() {
        override val wire: String = "APPROVED"
    }
    data object Rejected : PaymentStatus() {
        override val wire: String = "REJECTED"
    }
    data object Cancelled : PaymentStatus() {
        override val wire: String = "CANCELLED"
    }
    data object Refunded : PaymentStatus() {
        override val wire: String = "REFUNDED"
    }
    data object ChargedBack : PaymentStatus() {
        override val wire: String = "CHARGED_BACK"
    }
    data object Unknown : PaymentStatus() {
        override val wire: String = "unknown"
    }

    fun isApproved(): Boolean = this is Approved

    companion object {
        fun fromWire(raw: String?): PaymentStatus = when (raw?.trim()) {
            "PENDING" -> Pending
            "APPROVED" -> Approved
            "REJECTED" -> Rejected
            "CANCELLED" -> Cancelled
            "REFUNDED" -> Refunded
            "CHARGED_BACK" -> ChargedBack
            else -> Unknown
        }

        fun forUnpaidTermination(effect: CommercialEffect): PaymentStatus =
            if (effect == CommercialEffect.REJECT) Rejected else Cancelled
    }
}
