package com.storecore.catalog.domain

import java.text.Normalizer

class CatalogSearchInvalid : RuntimeException("CATALOG_QUERY_INVALID")

/** Normalized, bounded literal search value translated once at the HTTP/application boundary. */
class CatalogSearchTerm private constructor(
    val value: String,
    val literalLikePattern: String,
) {
    val present: Boolean get() = value.isNotEmpty()

    companion object {
        private const val MAX_TRANSPORT_CODE_POINTS = 2_048
        const val MAX_CODE_POINTS = 120

        fun fromWire(raw: String?): CatalogSearchTerm {
            val wire = raw.orEmpty()
            if (wire.codePointCount(0, wire.length) > MAX_TRANSPORT_CODE_POINTS) invalid()
            if (wire.codePoints().anyMatch { Character.isISOControl(it) && !Character.isWhitespace(it) }) invalid()
            val normalized = Normalizer.normalize(wire, Normalizer.Form.NFKC)
                .replace(Regex("[\\p{javaWhitespace}\\p{Zs}]+"), " ")
                .trim()
            if (normalized.codePointCount(0, normalized.length) > MAX_CODE_POINTS) invalid()
            val escaped = normalized.replace("!", "!!").replace("%", "!%").replace("_", "!_")
            return CatalogSearchTerm(normalized, "%$escaped%")
        }

        private fun invalid(): Nothing = throw CatalogSearchInvalid()
    }
}
