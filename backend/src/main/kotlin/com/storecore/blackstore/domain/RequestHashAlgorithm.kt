package com.storecore.blackstore.domain

sealed class RequestHashAlgorithm {
    abstract val wire: String
    val label: String
        get() = when (this) {
            H1 -> "H1"
            H2 -> "H2"
            is Unknown -> "UNKNOWN"
        }

    data object H1 : RequestHashAlgorithm() {
        override val wire: String = "H1"
    }
    data object H2 : RequestHashAlgorithm() {
        override val wire: String = "H2"
    }
    class Unknown internal constructor(raw: String) : RequestHashAlgorithm() {
        override val wire: String = raw
    }

    companion object {
        fun fromWire(raw: String?): RequestHashAlgorithm = when (raw?.trim()) {
            "H1", null, "" -> H1
            "H2" -> H2
            else -> Unknown(raw)
        }
    }
}
