package com.storecore.commerce.domain

sealed class RmaTransition {
    abstract val wire: String

    data object Received : RmaTransition() {
        override val wire: String = "RECEIVED"
    }
    data object Inspected : RmaTransition() {
        override val wire: String = "INSPECTED"
    }
    data object Adjusted : RmaTransition() {
        override val wire: String = "ADJUSTED"
    }
    data object Unknown : RmaTransition() {
        override val wire: String = "unknown"
    }

    companion object {
        fun fromWire(raw: String?): RmaTransition = when (raw?.trim()) {
            "RECEIVED" -> Received
            "INSPECTED" -> Inspected
            "ADJUSTED" -> Adjusted
            else -> Unknown
        }
    }
}

sealed class RmaStatus {
    abstract val wire: String
    abstract val nextRmaAction: RmaTransition?

    data object Requested : RmaStatus() {
        override val wire: String = "REQUESTED"
        override val nextRmaAction: RmaTransition? = null
    }
    data object Approved : RmaStatus() {
        override val wire: String = "APPROVED"
        override val nextRmaAction: RmaTransition? = null
    }
    data object ReturnReceived : RmaStatus() {
        override val wire: String = "RETURN_RECEIVED"
        override val nextRmaAction: RmaTransition? = RmaTransition.Inspected
    }
    data object Inspected : RmaStatus() {
        override val wire: String = "INSPECTED"
        override val nextRmaAction: RmaTransition? = RmaTransition.Adjusted
    }
    data object Rejected : RmaStatus() {
        override val wire: String = "REJECTED"
        override val nextRmaAction: RmaTransition? = null
    }
    data object Closed : RmaStatus() {
        override val wire: String = "CLOSED"
        override val nextRmaAction: RmaTransition? = null
    }
    data object Unknown : RmaStatus() {
        override val wire: String = "unknown"
        override val nextRmaAction: RmaTransition? = null
    }

    companion object {
        fun fromWire(raw: String?): RmaStatus = when (raw?.trim()) {
            "REQUESTED" -> Requested
            "APPROVED" -> Approved
            "RETURN_RECEIVED" -> ReturnReceived
            "INSPECTED" -> Inspected
            "REJECTED" -> Rejected
            "CLOSED" -> Closed
            else -> Unknown
        }

        fun fromOptionalWire(raw: String?): RmaStatus? {
            val normalized = raw?.trim().orEmpty()
            if (normalized.isEmpty()) {
                return null
            }
            return fromWire(normalized)
        }
    }
}
