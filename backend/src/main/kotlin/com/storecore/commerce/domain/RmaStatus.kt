package com.storecore.commerce.domain

class RmaTransition private constructor(val wire: String) {
    override fun equals(other: Any?) = other is RmaTransition && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    companion object {
        val Received = RmaTransition("RECEIVED")
        val Inspected = RmaTransition("INSPECTED")
        val Adjusted = RmaTransition("ADJUSTED")
        val Unknown = RmaTransition("unknown")
        private val known = listOf(Received, Inspected, Adjusted)

        fun fromWire(raw: String?): RmaTransition {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}

class RmaStatus private constructor(
    val wire: String,
    val nextRmaAction: RmaTransition?,
) {
    override fun equals(other: Any?) = other is RmaStatus && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    companion object {
        val Requested = RmaStatus("REQUESTED", null)
        val Approved = RmaStatus("APPROVED", null)
        val ReturnReceived = RmaStatus("RETURN_RECEIVED", RmaTransition.Inspected)
        val Inspected = RmaStatus("INSPECTED", RmaTransition.Adjusted)
        val Rejected = RmaStatus("REJECTED", null)
        val Closed = RmaStatus("CLOSED", null)
        val Unknown = RmaStatus("unknown", null)
        private val known = listOf(Requested, Approved, ReturnReceived, Inspected, Rejected, Closed)

        fun fromWire(raw: String?): RmaStatus {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
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
