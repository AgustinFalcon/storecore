package com.storecore.commerce.domain

sealed class ListingLifecycleAction {
    abstract val wire: String

    data object Activate : ListingLifecycleAction() {
        override val wire: String = "ACTIVATE"
    }
    data object Pause : ListingLifecycleAction() {
        override val wire: String = "PAUSE"
    }
    data object ConfirmMapping : ListingLifecycleAction() {
        override val wire: String = "CONFIRM_MAPPING"
    }
    data object Unknown : ListingLifecycleAction() {
        override val wire: String = "unknown"
    }

    companion object {
        fun fromWire(raw: String?): ListingLifecycleAction = when (raw?.trim()?.uppercase()) {
            "ACTIVATE" -> Activate
            "PAUSE" -> Pause
            "CONFIRM_MAPPING" -> ConfirmMapping
            else -> Unknown
        }
    }
}
