package com.storecore.commerce.domain

sealed class ReservationStatus {
    abstract val wire: String

    data object Active : ReservationStatus() {
        override val wire: String = "ACTIVE"
    }
    data object Consumed : ReservationStatus() {
        override val wire: String = "CONSUMED"
    }
    data object Released : ReservationStatus() {
        override val wire: String = "RELEASED"
    }
    data object Expired : ReservationStatus() {
        override val wire: String = "EXPIRED"
    }
    data object Unknown : ReservationStatus() {
        override val wire: String = "unknown"
    }

    companion object {
        fun fromWire(raw: String?): ReservationStatus = when (raw?.trim()) {
            "ACTIVE" -> Active
            "CONSUMED" -> Consumed
            "RELEASED" -> Released
            "EXPIRED" -> Expired
            else -> Unknown
        }
    }
}
