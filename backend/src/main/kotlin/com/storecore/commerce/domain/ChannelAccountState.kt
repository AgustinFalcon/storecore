package com.storecore.commerce.domain

sealed class ChannelAccountState {
    abstract val wire: String

    data object Disabled : ChannelAccountState() {
        override val wire: String = "DISABLED"
    }
    data object ReadOnly : ChannelAccountState() {
        override val wire: String = "READ_ONLY"
    }
    data object Active : ChannelAccountState() {
        override val wire: String = "ACTIVE"
    }
    data object Paused : ChannelAccountState() {
        override val wire: String = "PAUSED"
    }
    data object Error : ChannelAccountState() {
        override val wire: String = "ERROR"
    }
    data object Unknown : ChannelAccountState() {
        override val wire: String = "unknown"
    }

    fun isActive(): Boolean = this === Active

    companion object {
        fun fromWire(raw: String?): ChannelAccountState = when (raw?.trim()) {
            "DISABLED" -> Disabled
            "READ_ONLY" -> ReadOnly
            "ACTIVE" -> Active
            "PAUSED" -> Paused
            "ERROR" -> Error
            else -> Unknown
        }
    }
}
