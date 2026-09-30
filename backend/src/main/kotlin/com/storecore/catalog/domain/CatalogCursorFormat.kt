package com.storecore.catalog.domain

sealed class CatalogCursorFormat {
    abstract val wire: String
    val label: String
        get() = when (this) {
            C1 -> "C1"
            Legacy -> "LEGACY"
            is Unknown -> "UNKNOWN"
        }

    data object C1 : CatalogCursorFormat() {
        override val wire: String = "C1"
    }
    data object Legacy : CatalogCursorFormat() {
        override val wire: String = "LEGACY"
    }
    class Unknown internal constructor(raw: String) : CatalogCursorFormat() {
        override val wire: String = raw
    }

    companion object {
        fun fromWire(raw: String?): CatalogCursorFormat = when (raw?.trim()) {
            "C1" -> C1
            "LEGACY", null, "" -> Legacy
            else -> Unknown(raw)
        }
    }
}
