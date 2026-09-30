package com.storecore.commerce.domain

class ChannelAccountPurpose private constructor(val wire: String) {
    override fun equals(other: Any?) = other is ChannelAccountPurpose && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    fun allowsExternalMlSync(): Boolean = this === ExternalMlSync

    companion object {
        val Unclassified = ChannelAccountPurpose("UNCLASSIFIED")
        val ExternalMlSync = ChannelAccountPurpose("EXTERNAL_ML_SYNC")
        val InternalPricePolicy = ChannelAccountPurpose("INTERNAL_PRICE_POLICY")
        val Unknown = ChannelAccountPurpose("unknown")

        private val known = listOf(Unclassified, ExternalMlSync, InternalPricePolicy)

        fun fromWire(raw: String?): ChannelAccountPurpose {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}
