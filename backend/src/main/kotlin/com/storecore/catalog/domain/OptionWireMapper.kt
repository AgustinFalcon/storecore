package com.storecore.catalog.domain

/** The sole untrusted option-wire translator. HTTP/persistence adapters can reuse this pure boundary. */
object OptionWireMapper {
    fun presentation(raw: Any?): OptionPresentation = enumValue(raw, OptionPresentation.UNKNOWN)
    fun schemaState(raw: Any?): OptionSchemaState = enumValue(raw, OptionSchemaState.UNKNOWN)
    fun selectionState(raw: Any?): OptionSelectionState = enumValue(raw, OptionSelectionState.UNKNOWN)
    fun availability(raw: Any?): OptionValueAvailability = enumValue(raw, OptionValueAvailability.UNKNOWN)
    fun cause(raw: Any?): OptionResolutionCause = enumValue(raw, OptionResolutionCause.UNKNOWN)

    private inline fun <reified T : Enum<T>> enumValue(raw: Any?, unknown: T): T =
        enumValues<T>().firstOrNull { it.name == raw } ?: unknown

    fun fromWire(raw: Any?): ProductOptionSchema {
        val row = raw as? Map<*, *> ?: return ProductOptionSchema.Unknown()
        val revision = positiveLong(row["revision"])?.let(SchemaRevision::of)
        fun corrupt() = ProductOptionSchema.Unknown(revision, OptionResolutionCause.CORRUPT)
        if (revision == null || row.keys.any { it !in setOf("revision", "state", "cause", "axes") }) return corrupt()
        val axes = row["axes"] as? List<*> ?: return corrupt()
        if (axes.size > OptionLimits.MAX_AXES) return corrupt()
        return when (schemaState(row["state"])) {
            OptionSchemaState.ABSENT -> if (row.containsKey("cause") && row["cause"] == null && axes.isEmpty()) ProductOptionSchema.Absent(revision) else corrupt()
            OptionSchemaState.VALID -> {
                if (!row.containsKey("cause") || row["cause"] != null || axes.isEmpty()) return corrupt()
                val parsed = axes.map { axis(it) ?: return corrupt() }
                when (val schema = ProductOptionSchema.Valid.create(revision, parsed)) {
                    is ProductOptionSchema.Valid -> schema
                    else -> corrupt()
                }
            }
            OptionSchemaState.INVALID -> corrupt()
            OptionSchemaState.UNKNOWN -> when (val reason = cause(row["cause"])) {
                OptionResolutionCause.CORRUPT, OptionResolutionCause.UNKNOWN -> ProductOptionSchema.Unknown(revision, reason)
                else -> corrupt()
            }
        }
    }

    private fun axis(raw: Any?): OptionAxis? {
        val row = raw as? Map<*, *> ?: return null
        if (row.keys.any { it !in setOf("code", "label", "presentation", "order", "values") }) return null
        val code = (row["code"] as? String)?.let(OptionCode::of) ?: return null
        val label = (row["label"] as? String)?.let(OptionLabel::of) ?: return null
        val order = nonNegativeInt(row["order"]) ?: return null
        val values = row["values"] as? List<*> ?: return null
        if (values.size !in 1..OptionLimits.MAX_VALUES_PER_AXIS) return null
        val parsed = values.map { value(it) ?: return null }
        return OptionAxis.create(code, label, presentation(row["presentation"]), order, parsed)
    }

    private fun value(raw: Any?): OptionValue? {
        val row = raw as? Map<*, *> ?: return null
        if (row.keys.any { it !in setOf("code", "label", "order", "swatchColor") }) return null
        val code = (row["code"] as? String)?.let(OptionCode::of) ?: return null
        val label = (row["label"] as? String)?.let(OptionLabel::of) ?: return null
        val order = nonNegativeInt(row["order"]) ?: return null
        val color = if (row["swatchColor"] == null) null else (row["swatchColor"] as? String)?.let(SwatchColor::of) ?: return null
        return OptionValue(code, label, order, color)
    }

    private fun positiveLong(raw: Any?): Long? = when (raw) {
        is Byte -> raw.toLong(); is Short -> raw.toLong(); is Int -> raw.toLong(); is Long -> raw
        else -> null
    }?.takeIf { it > 0 }
    private fun nonNegativeInt(raw: Any?): Int? = when (raw) {
        is Byte -> raw.toInt(); is Short -> raw.toInt(); is Int -> raw
        is Long -> raw.takeIf { it in 0..Int.MAX_VALUE.toLong() }?.toInt()
        else -> null
    }?.takeIf { it >= 0 }
}
