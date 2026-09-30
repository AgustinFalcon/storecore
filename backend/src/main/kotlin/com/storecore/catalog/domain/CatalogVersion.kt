package com.storecore.catalog.domain

sealed class CatalogVersion {
    abstract val wire: String

    val label: String
        get() = when (this) {
            is Current -> "CURRENT"
            is Unknown -> "UNKNOWN"
        }

    class Current internal constructor(override val wire: String) : CatalogVersion()
    class Unknown internal constructor(raw: String) : CatalogVersion() {
        override val wire: String = raw
    }

    companion object {
        private val CURRENT = Regex("^c1_[A-Za-z0-9_-]{43}$")

        fun fromWire(raw: String?): CatalogVersion {
            val value = raw?.trim().orEmpty()
            return if (CURRENT.matches(value)) Current(value) else Unknown(value)
        }

        fun current(digest43: String): CatalogVersion = Current("c1_$digest43")
    }
}
