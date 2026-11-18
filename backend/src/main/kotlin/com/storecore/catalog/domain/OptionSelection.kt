package com.storecore.catalog.domain

/** Identity only exists for an exact resolution; a partial choice cannot retain a previous SKU. */
sealed class OptionSelection {
    abstract val state: OptionSelectionState
    abstract val cause: OptionResolutionCause?
    class Complete(val variantId: String, val sku: ProductSku, val combination: OptionCombination) : OptionSelection() {
        init { require(variantId.isNotBlank()) }
        override val state = OptionSelectionState.COMPLETE
        override val cause: OptionResolutionCause? = null
    }
    data object Incomplete : OptionSelection() {
        override val state = OptionSelectionState.INCOMPLETE
        override val cause = OptionResolutionCause.PARTIAL
    }
    class Unavailable(override val cause: OptionResolutionCause, val resolved: Complete? = null) : OptionSelection() {
        init {
            require(cause in setOf(OptionResolutionCause.NO_COMBINATION, OptionResolutionCause.OUT_OF_STOCK, OptionResolutionCause.PRICE_UNAVAILABLE))
            require((cause == OptionResolutionCause.NO_COMBINATION) == (resolved == null))
        }
        override val state = OptionSelectionState.UNAVAILABLE
    }
    class Unknown(override val cause: OptionResolutionCause = OptionResolutionCause.UNKNOWN) : OptionSelection() {
        init { require(cause == OptionResolutionCause.UNKNOWN || cause == OptionResolutionCause.CORRUPT) }
        override val state = OptionSelectionState.UNKNOWN
    }
}

/** Contracts only: the selection algorithm and purchase-intent lifecycle belong to TASK-006. */
fun interface NormalizeOptionSchemaStep {
    fun execute(revision: SchemaRevision, axes: List<OptionAxis>): ProductOptionSchema
}

fun interface ResolveInitialOptionSelectionStep {
    fun execute(schema: ProductOptionSchema, assignments: List<VariantOptionAssignment>, exactVariantId: String): OptionSelection
}

fun interface ApplyOptionChoiceStep {
    fun execute(schema: ProductOptionSchema.Valid, previous: Map<OptionCode, OptionCode>, axis: OptionCode, value: OptionCode): Map<OptionCode, OptionCode>
}

fun interface ResolveVariantFromSelectionStep {
    fun execute(schema: ProductOptionSchema, assignments: List<VariantOptionAssignment>, values: Map<OptionCode, OptionCode>): OptionSelection
}
