package com.storecore.commerce.domain

class ChannelAccountState private constructor(val wire: String) {
    override fun equals(other: Any?) = other is ChannelAccountState && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    fun isActive(): Boolean = this === Active

    companion object {
        val Disabled = ChannelAccountState("DISABLED")
        val ReadOnly = ChannelAccountState("READ_ONLY")
        val Active = ChannelAccountState("ACTIVE")
        val Paused = ChannelAccountState("PAUSED")
        val Error = ChannelAccountState("ERROR")
        val Unknown = ChannelAccountState("unknown")

        private val known = listOf(Disabled, ReadOnly, Active, Paused, Error)

        fun fromWire(raw: String?): ChannelAccountState {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}
