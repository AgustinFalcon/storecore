package com.storecore.catalog.domain

/** Primitive boundary records. Persistence adapters must not normalize or discard values before this step. */
data class OptionValueSource(
    val identity: String,
    val code: String,
    val label: String,
    val swatchColor: String?,
    val order: Int,
)

data class OptionAxisSource(
    val identity: String,
    val code: String,
    val label: String,
    val presentation: Any?,
    val order: Int,
    val values: List<OptionValueSource>,
)

data class VariantOptionSource(
    val variantId: String,
    val variantSku: String,
    val status: VariantStatus,
    val optionValues: List<Pair<String?, String?>>,
)

class ProductOptionProjection private constructor(
    val schema: ProductOptionSchema,
    assignments: Map<String, Map<OptionCode, OptionCode>>,
) {
    val assignments: Map<String, Map<OptionCode, OptionCode>> = frozenMap(assignments.mapValues { frozenMap(it.value) })

    companion object {
        fun unknown(revision: SchemaRevision? = null) = ProductOptionProjection(
            ProductOptionSchema.Unknown(revision, OptionResolutionCause.CORRUPT),
            emptyMap(),
        )

        fun resolved(schema: ProductOptionSchema, assignments: Map<String, Map<OptionCode, OptionCode>>) =
            ProductOptionProjection(schema, assignments)
    }
}

/** One responsibility: turn an untrusted aggregate snapshot into a safe option projection. */
class ProjectProductOptionsStep {
    fun execute(
        present: Boolean,
        rawRevision: Long,
        axes: List<OptionAxisSource>,
        variants: List<VariantOptionSource>,
    ): ProductOptionProjection {
        val revision = SchemaRevision.of(rawRevision) ?: return ProductOptionProjection.unknown()
        if (axes.size > OptionLimits.MAX_AXES || variants.size > OptionLimits.MAX_VARIANTS ||
            variants.sumOf { it.optionValues.size } > OptionLimits.MAX_ASSIGNMENTS ||
            axes.any { it.identity.isBlank() } || axes.map { it.identity }.distinct().size != axes.size ||
            variants.any { it.variantId.isBlank() || it.variantSku.isBlank() || it.optionValues.size > OptionLimits.MAX_AXES } ||
            variants.map { it.variantId }.distinct().size != variants.size ||
            variants.map { it.variantSku }.distinct().size != variants.size) return ProductOptionProjection.unknown(revision)

        val parsedAxes = axes.map { parseAxis(it) ?: return ProductOptionProjection.unknown(revision) }
        val schema = when {
            !present && parsedAxes.isNotEmpty() -> return ProductOptionProjection.unknown(revision)
            !present -> ProductOptionSchema.Absent(revision)
            else -> ProductOptionSchema.Valid.create(revision, parsedAxes).let {
                it as? ProductOptionSchema.Valid ?: return ProductOptionProjection.unknown(revision)
            }
        }
        val parsedAssignments = linkedMapOf<String, Map<OptionCode, OptionCode>>()
        val domainAssignments = variants.map { variant ->
            if (variant.status == VariantStatus.UNKNOWN) return ProductOptionProjection.unknown(revision)
            val values = linkedMapOf<OptionCode, OptionCode>()
            for ((rawAxis, rawValue) in variant.optionValues) {
                val axis = rawAxis?.let(OptionCode::of) ?: return ProductOptionProjection.unknown(revision)
                val value = rawValue?.let(OptionCode::of) ?: return ProductOptionProjection.unknown(revision)
                if (values.put(axis, value) != null) return ProductOptionProjection.unknown(revision)
            }
            parsedAssignments[variant.variantId] = values
            VariantOptionAssignment(variant.variantId, variant.status, values)
        }
        if (ValidateVariantAssignmentsStep().execute(schema, domainAssignments) !is OptionAssignmentValidation.Valid)
            return ProductOptionProjection.unknown(revision)
        return ProductOptionProjection.resolved(schema, parsedAssignments)
    }

    private fun parseAxis(source: OptionAxisSource): OptionAxis? {
        if (source.order < 0 || source.values.size !in 1..OptionLimits.MAX_VALUES_PER_AXIS || source.values.any { it.identity.isBlank() } ||
            source.values.map { it.identity }.distinct().size != source.values.size) return null
        val values = source.values.map { value ->
            if (value.order < 0) return null
            OptionValue(
                OptionCode.of(value.code) ?: return null,
                OptionLabel.of(value.label) ?: return null,
                value.order,
                value.swatchColor?.let { SwatchColor.of(it) ?: return null },
            )
        }
        return OptionAxis.create(
            OptionCode.of(source.code) ?: return null,
            OptionLabel.of(source.label) ?: return null,
            OptionWireMapper.presentation(source.presentation),
            source.order,
            values,
        )
    }
}
