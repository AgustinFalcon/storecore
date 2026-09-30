package com.storecore.blackstore.domain

class CompanionLifecycleStatus private constructor(val wire: String) {
    override fun equals(other: Any?) = other is CompanionLifecycleStatus && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    companion object {
        val DISABLED = CompanionLifecycleStatus("DISABLED")
        val ACTIVE = CompanionLifecycleStatus("ACTIVE")
        val REVOKED = CompanionLifecycleStatus("REVOKED")
        val Unknown = CompanionLifecycleStatus("unknown")

        fun fromWire(raw: String?): CompanionLifecycleStatus = when (raw?.trim()) {
            DISABLED.wire -> DISABLED
            ACTIVE.wire -> ACTIVE
            REVOKED.wire -> REVOKED
            else -> Unknown
        }
    }
}
