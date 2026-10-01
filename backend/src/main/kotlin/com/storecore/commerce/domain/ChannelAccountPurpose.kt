package com.storecore.commerce.domain

sealed class ChannelAccountPurpose {
    abstract val wire: String

    data object Unclassified : ChannelAccountPurpose() {
        override val wire: String = "UNCLASSIFIED"
    }
    data object ExternalMlSync : ChannelAccountPurpose() {
        override val wire: String = "EXTERNAL_ML_SYNC"
    }
    data object InternalPricePolicy : ChannelAccountPurpose() {
        override val wire: String = "INTERNAL_PRICE_POLICY"
    }
    data object Unknown : ChannelAccountPurpose() {
        override val wire: String = "unknown"
    }

    fun allowsExternalMlSync(): Boolean = this === ExternalMlSync

    companion object {
        fun fromWire(raw: String?): ChannelAccountPurpose = when (raw?.trim()) {
            "UNCLASSIFIED" -> Unclassified
            "EXTERNAL_ML_SYNC" -> ExternalMlSync
            "INTERNAL_PRICE_POLICY" -> InternalPricePolicy
            else -> Unknown
        }
    }
}
