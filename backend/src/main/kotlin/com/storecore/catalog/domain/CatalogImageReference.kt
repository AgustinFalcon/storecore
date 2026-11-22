package com.storecore.catalog.domain

import java.net.URI

sealed class CatalogImageReference(open val storedValue: String?) {
    data class SecureRemote(override val storedValue: String) : CatalogImageReference(storedValue)
    data class ApplicationAsset(override val storedValue: String) : CatalogImageReference(storedValue)
    data object Unknown : CatalogImageReference(null)

    companion object {
        private val assetPath = Regex("^/assets/[A-Za-z0-9._/-]+\\.(?:avif|gif|jpe?g|png|svg|webp)$", RegexOption.IGNORE_CASE)

        fun fromWire(raw: String?): CatalogImageReference {
            val value = raw?.trim()?.takeIf(String::isNotEmpty) ?: return Unknown
            val uri = runCatching { URI(value) }.getOrNull() ?: return Unknown
            if (uri.scheme == "https" && !uri.host.isNullOrBlank()) return SecureRemote(value)
            if (uri.scheme == null && uri.rawQuery == null && uri.rawFragment == null && !value.contains("\\")
                && !value.split('/').contains("..") && assetPath.matches(value)) return ApplicationAsset(value)
            return Unknown
        }
    }
}
