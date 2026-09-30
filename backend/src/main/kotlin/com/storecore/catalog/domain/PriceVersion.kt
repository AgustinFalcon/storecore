package com.storecore.catalog.domain

sealed class PriceVersion {
    abstract val wire: String

    val label: String
        get() = when (this) {
            is Quoted -> "QUOTED"
            is Unknown -> "UNKNOWN"
        }

    class Quoted internal constructor(override val wire: String) : PriceVersion()
    class Unknown internal constructor(raw: String) : PriceVersion() {
        override val wire: String = raw
    }

    companion object {
        private val QUOTED = Regex("^p1_[A-Za-z0-9_-]{43}$")

        fun fromWire(raw: String?): PriceVersion {
            val value = raw?.trim().orEmpty()
            return if (QUOTED.matches(value)) Quoted(value) else Unknown(value)
        }

        fun quoted(digest43: String): PriceVersion = Quoted("p1_$digest43")
    }
}
