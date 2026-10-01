package com.storecore.commerce.domain

sealed class OfferStatus {
    abstract val wire: String
    abstract val writableOnCreate: Boolean

    data object Draft : OfferStatus() {
        override val wire: String = "DRAFT"
        override val writableOnCreate: Boolean = true
    }
    data object Active : OfferStatus() {
        override val wire: String = "ACTIVE"
        override val writableOnCreate: Boolean = true
    }
    data object Paused : OfferStatus() {
        override val wire: String = "PAUSED"
        override val writableOnCreate: Boolean = false
    }
    data object Ended : OfferStatus() {
        override val wire: String = "ENDED"
        override val writableOnCreate: Boolean = false
    }
    data object Unknown : OfferStatus() {
        override val wire: String = "unknown"
        override val writableOnCreate: Boolean = false
    }

    companion object {
        fun fromWire(raw: String?): OfferStatus = when (raw?.trim()) {
            "DRAFT" -> Draft
            "ACTIVE" -> Active
            "PAUSED" -> Paused
            "ENDED" -> Ended
            else -> Unknown
        }
    }
}
