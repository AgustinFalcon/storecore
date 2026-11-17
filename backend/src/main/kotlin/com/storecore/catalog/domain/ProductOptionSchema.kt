package com.storecore.catalog.domain

import java.util.Collections

internal fun <T> frozenList(values: Collection<T>): List<T> = Collections.unmodifiableList(ArrayList(values))
internal fun <K, V> frozenMap(values: Map<K, V>): Map<K, V> = Collections.unmodifiableMap(LinkedHashMap(values))

data class OptionValue(val code: OptionCode, val label: OptionLabel, val order: Int, val swatchColor: SwatchColor? = null) {
    init { require(order >= 0) }
}

class OptionAxis private constructor(
    val code: OptionCode, val label: OptionLabel, val presentation: OptionPresentation, val order: Int, values: List<OptionValue>
) {
    val values: List<OptionValue> = frozenList(values.sortedBy { it.order })
    companion object {
        fun create(code: OptionCode, label: OptionLabel, presentation: OptionPresentation, order: Int, values: List<OptionValue>): OptionAxis? {
            if (!presentation.supported || order < 0 || values.size !in 1..OptionLimits.MAX_VALUES_PER_AXIS) return null
            if (values.map { it.code }.distinct().size != values.size || values.map { it.order }.distinct().size != values.size ||
                values.map { it.label.uniquenessKey }.distinct().size != values.size) return null
            if (presentation != OptionPresentation.SWATCH && values.any { it.swatchColor != null }) return null
            return OptionAxis(code, label, presentation, order, values)
        }
    }
}

sealed class ProductOptionSchema {
    abstract val revision: SchemaRevision?
    abstract val state: OptionSchemaState
    abstract val cause: OptionResolutionCause?
    open val axes: List<OptionAxis> = emptyList()

    class Absent(override val revision: SchemaRevision) : ProductOptionSchema() {
        override val state = OptionSchemaState.ABSENT
        override val cause: OptionResolutionCause? = null
    }
    class Valid private constructor(override val revision: SchemaRevision, axes: List<OptionAxis>) : ProductOptionSchema() {
        override val state = OptionSchemaState.VALID
        override val cause: OptionResolutionCause? = null
        override val axes = frozenList(axes.sortedBy { it.order })
        companion object {
            fun create(revision: SchemaRevision, axes: List<OptionAxis>): ProductOptionSchema {
                if (axes.size !in 1..OptionLimits.MAX_AXES || axes.map { it.code }.distinct().size != axes.size ||
                    axes.map { it.order }.distinct().size != axes.size || axes.map { it.label.uniquenessKey }.distinct().size != axes.size)
                    return Invalid(revision)
                return Valid(revision, axes)
            }
        }
    }
    class Invalid(override val revision: SchemaRevision?) : ProductOptionSchema() {
        override val state = OptionSchemaState.INVALID
        override val cause = OptionResolutionCause.CORRUPT
    }
    class Unknown(override val revision: SchemaRevision? = null, override val cause: OptionResolutionCause = OptionResolutionCause.UNKNOWN) : ProductOptionSchema() {
        override val state = OptionSchemaState.UNKNOWN
        init { require(cause == OptionResolutionCause.UNKNOWN || cause == OptionResolutionCause.CORRUPT) }
    }
}

/** Ordered structured key; never an ambiguous concatenation or an empty legacy vector. */
class OptionCombination private constructor(values: List<Pair<OptionCode, OptionCode>>) {
    val values: List<Pair<OptionCode, OptionCode>> = frozenList(values)
    override fun equals(other: Any?): Boolean = other is OptionCombination && values == other.values
    override fun hashCode(): Int = values.hashCode()
    companion object {
        fun create(schema: ProductOptionSchema.Valid, values: Map<OptionCode, OptionCode>): OptionCombination? {
            if (values.size != schema.axes.size) return null
            val ordered = schema.axes.map { axis ->
                val value = values[axis.code] ?: return null
                if (axis.values.none { it.code == value }) return null
                axis.code to value
            }
            return OptionCombination(ordered)
        }
    }
}

class VariantOptionAssignment(val variantId: String, val status: VariantStatus, optionValues: Map<OptionCode, OptionCode>) {
    val optionValues = frozenMap(optionValues)
    init { require(variantId.isNotBlank()); require(optionValues.size <= OptionLimits.MAX_AXES) }
}

sealed class OptionAssignmentValidation {
    class Valid(combinations: Map<String, OptionCombination>) : OptionAssignmentValidation() {
        val combinations = frozenMap(combinations)
    }
    data object Unknown : OptionAssignmentValidation() { val cause = OptionResolutionCause.CORRUPT }
}

/** One responsibility: validate membership/completeness and active-vector uniqueness. */
class ValidateVariantAssignmentsStep {
    fun execute(schema: ProductOptionSchema, assignments: List<VariantOptionAssignment>): OptionAssignmentValidation {
        if (assignments.size > OptionLimits.MAX_VARIANTS || assignments.map { it.variantId }.distinct().size != assignments.size ||
            assignments.any { it.status == VariantStatus.UNKNOWN }) return OptionAssignmentValidation.Unknown
        if (schema is ProductOptionSchema.Absent) return if (assignments.all { it.optionValues.isEmpty() })
            OptionAssignmentValidation.Valid(emptyMap()) else OptionAssignmentValidation.Unknown
        if (schema !is ProductOptionSchema.Valid) return OptionAssignmentValidation.Unknown
        val combinations = linkedMapOf<String, OptionCombination>()
        val unique = hashSetOf<OptionCombination>()
        for (assignment in assignments) {
            if (assignment.optionValues.any { (axisCode, valueCode) -> schema.axes.none { axis -> axis.code == axisCode && axis.values.any { it.code == valueCode } } })
                return OptionAssignmentValidation.Unknown
            if (!assignment.status.active) continue
            val combination = OptionCombination.create(schema, assignment.optionValues) ?: return OptionAssignmentValidation.Unknown
            if (!unique.add(combination)) return OptionAssignmentValidation.Unknown
            combinations[assignment.variantId] = combination
        }
        return OptionAssignmentValidation.Valid(combinations)
    }
}
