package com.storecore.blackstore.domain

class CompanionServiceRole private constructor(val wire: String) {
    override fun equals(other: Any?) = other is CompanionServiceRole && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    companion object {
        val SERVICE = CompanionServiceRole("SERVICE")
        val Unknown = CompanionServiceRole("unknown")

        fun fromWire(raw: String?): CompanionServiceRole =
            if (raw?.trim() == SERVICE.wire) SERVICE else Unknown
    }
}
