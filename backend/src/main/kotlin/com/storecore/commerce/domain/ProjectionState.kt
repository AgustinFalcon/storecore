package com.storecore.commerce.domain

sealed class ProjectionState {
    abstract val wire: String

    data object Withheld : ProjectionState() {
        override val wire: String = "WITHHELD"
    }
    data object Emitted : ProjectionState() {
        override val wire: String = "EMITTED"
    }
    data object Unknown : ProjectionState() {
        override val wire: String = "unknown"
    }

    fun isWithheld(): Boolean = this === Withheld

    companion object {
        fun fromWire(raw: String?): ProjectionState = when (raw?.trim()) {
            "WITHHELD" -> Withheld
            "EMITTED" -> Emitted
            else -> Unknown
        }
    }
}
