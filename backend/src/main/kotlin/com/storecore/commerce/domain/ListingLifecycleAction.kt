package com.storecore.commerce.domain

class ListingLifecycleAction private constructor(val wire: String) {
    override fun equals(other: Any?) = other is ListingLifecycleAction && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    companion object {
        val Activate = ListingLifecycleAction("ACTIVATE")
        val Pause = ListingLifecycleAction("PAUSE")
        val ConfirmMapping = ListingLifecycleAction("CONFIRM_MAPPING")
        val Unknown = ListingLifecycleAction("unknown")
        private val known = listOf(Activate, Pause, ConfirmMapping)
        fun fromWire(raw: String?): ListingLifecycleAction {
            val normalized = raw?.trim()?.uppercase().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}
