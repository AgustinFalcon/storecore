package com.storecore.catalog.domain

import java.util.Locale
import java.text.Normalizer

enum class OptionPresentation(val label: String) {
    SELECT("Lista"), SWATCH("Muestras"), UNKNOWN("Presentación desconocida");
    val supported: Boolean get() = this != UNKNOWN
}

enum class OptionSchemaState(val label: String) {
    ABSENT("Sin opciones"), VALID("Opciones válidas"), INVALID("Opciones inválidas"), UNKNOWN("Opciones desconocidas");
    val allowsGenericSelection: Boolean get() = this == ABSENT
}

enum class OptionSelectionState(val label: String) {
    COMPLETE("Selección completa"), INCOMPLETE("Elegí las opciones"), UNAVAILABLE("Selección no disponible"), UNKNOWN("Selección desconocida")
}

enum class OptionValueAvailability(val label: String) {
    SELECTABLE("Disponible"), SELECTED("Seleccionado"), DISABLED("No disponible"), UNKNOWN("Disponibilidad desconocida");
    val canChoose: Boolean get() = this == SELECTABLE || this == SELECTED
}

enum class OptionResolutionCause(val label: String) {
    PARTIAL("Faltan opciones"), NO_COMBINATION("La combinación no existe"), OUT_OF_STOCK("Sin stock"),
    PRICE_UNAVAILABLE("Precio no disponible"), CORRUPT("Opciones inconsistentes"), UNKNOWN("Opciones desconocidas")
}

@JvmInline
value class OptionCode private constructor(val value: String) {
    companion object {
        private val canonical = Regex("[a-z0-9][a-z0-9_-]{0,63}")
        fun of(value: String): OptionCode? = value.takeIf(canonical::matches)?.let(::OptionCode)
    }
}

@JvmInline
value class OptionLabel private constructor(val value: String) {
    // Shared with the TypeScript boundary: normalize compatibility forms, expand folds,
    // and retain dotless i, which is distinct under default (non-Turkic) case folding.
    val uniquenessKey: String get() = Normalizer.normalize(value, Normalizer.Form.NFKC).codePoints().toArray().joinToString("") {
        val character = String(Character.toChars(it))
        when (it) {
            0x00DF, 0x1E9E -> "ss"
            0x0131 -> character
            else -> character.uppercase(Locale.ROOT).lowercase(Locale.ROOT)
        }
    }
    companion object {
        fun of(value: String): OptionLabel? {
            if (value.codePoints().anyMatch { Character.isISOControl(it) || Character.getType(it) == Character.FORMAT.toInt() }) return null
            val normalized = value.replace(Regex("[\\p{Z}\\s]+"), " ").trim()
            return normalized.takeIf { it.codePointCount(0, it.length) in 1..80 }?.let(::OptionLabel)
        }
    }
}

@JvmInline
value class SwatchColor private constructor(val value: String) {
    companion object {
        private val canonical = Regex("#[0-9a-f]{6}")
        fun of(value: String): SwatchColor? = value.takeIf(canonical::matches)?.let(::SwatchColor)
    }
}

@JvmInline
value class SchemaRevision private constructor(val value: Long) {
    companion object { fun of(value: Long): SchemaRevision? = value.takeIf { it in 1..OptionLimits.MAX_WIRE_INTEGER.toLong() }?.let(::SchemaRevision) }
}

object OptionLimits {
    const val MAX_WIRE_INTEGER = Int.MAX_VALUE
    const val MAX_AXES = 4
    const val MAX_VALUES_PER_AXIS = 50
    const val MAX_VARIANTS = 1_000
    const val MAX_ASSIGNMENTS = MAX_AXES * MAX_VARIANTS
}
