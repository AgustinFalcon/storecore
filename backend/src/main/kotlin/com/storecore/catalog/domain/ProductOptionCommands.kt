package com.storecore.catalog.domain

class CatalogOptionInvalid(val code: String = "CATALOG_OPTION_COMMAND_INVALID") : RuntimeException(code)
class CatalogOptionNotFound : RuntimeException("CATALOG_OPTION_REFERENCE_NOT_FOUND")
class CatalogOptionRevisionConflict(val code: String = "CATALOG_OPTION_REVISION_CONFLICT") : RuntimeException(code)

enum class OptionSchemaWriteOperation {
    REPLACE, CLEAR, UNKNOWN;

    companion object {
        fun fromWire(value: String?): OptionSchemaWriteOperation = when (value) {
            "Replace" -> REPLACE
            "Clear" -> CLEAR
            else -> UNKNOWN
        }
    }
}
enum class VariantOptionWriteOperation {
    KEEP, ADD_INACTIVE, ACTIVATE, DEACTIVATE, UNKNOWN;

    val activates: Boolean get() = this == ACTIVATE
    companion object {
        fun fromWire(value: String?): VariantOptionWriteOperation = when (value) {
            "Keep" -> KEEP
            "AddInactive" -> ADD_INACTIVE
            "Activate" -> ACTIVATE
            "Deactivate" -> DEACTIVATE
            else -> UNKNOWN
        }
    }
}

sealed class VariantOptionReference {
    abstract val key: String

    class Id private constructor(val value: Long) : VariantOptionReference() {
        override val key = "id:$value"
        companion object { fun of(value: Long): Id? = value.takeIf { it > 0 }?.let(::Id) }
    }

    class Sku private constructor(val value: String) : VariantOptionReference() {
        override val key = "sku:$value"
        companion object {
            fun of(value: String): Sku? = value.trim().takeIf {
                it.length in 1..128 && it.none(Char::isISOControl)
            }?.let(::Sku)
        }
    }
}

class VariantOptionLabel private constructor(val value: String) {
    companion object {
        fun of(raw: String): VariantOptionLabel? {
            if (raw.any { it.isISOControl() || Character.getType(it) == Character.FORMAT.toInt() }) return null
            val normalized = raw.replace(Regex("[\\p{Z}\\s]+"), " ").trim()
            return normalized.takeIf { it.codePointCount(0, it.length) in 1..200 }?.let(::VariantOptionLabel)
        }
    }
}

data class VariantOptionWrite(
    val operation: VariantOptionWriteOperation,
    val reference: VariantOptionReference,
    val label: VariantOptionLabel? = null,
)

class VariantOptionAssignmentCommand(
    val reference: VariantOptionReference,
    optionValues: Map<OptionCode, OptionCode>,
) {
    val optionValues: Map<OptionCode, OptionCode> = frozenMap(optionValues)
}

class ProductOptionSchemaCommand private constructor(
    val expectedRevision: SchemaRevision,
    val operation: OptionSchemaWriteOperation,
    axes: List<OptionAxis>,
    assignments: List<VariantOptionAssignmentCommand>,
    variantOperations: List<VariantOptionWrite>,
) {
    val axes = frozenList(axes)
    val assignments = frozenList(assignments)
    val variantOperations = frozenList(variantOperations)

    companion object {
        fun create(
            expectedRevision: SchemaRevision?,
            operation: OptionSchemaWriteOperation,
            axes: List<OptionAxis>,
            assignments: List<VariantOptionAssignmentCommand>,
            variantOperations: List<VariantOptionWrite>,
        ): ProductOptionSchemaCommand? {
            if (expectedRevision == null || operation == OptionSchemaWriteOperation.UNKNOWN) return null
            if (axes.size > OptionLimits.MAX_AXES || assignments.size > OptionLimits.MAX_ASSIGNMENTS ||
                variantOperations.size > OptionLimits.MAX_VARIANTS) return null
            if (variantOperations.any { it.operation == VariantOptionWriteOperation.UNKNOWN }) return null
            if (variantOperations.map { it.reference.key }.distinct().size != variantOperations.size ||
                assignments.map { it.reference.key }.distinct().size != assignments.size) return null
            if (variantOperations.any {
                    if (it.operation == VariantOptionWriteOperation.ADD_INACTIVE)
                        it.reference !is VariantOptionReference.Sku || it.label == null
                    else it.label != null
                }) return null
            val additions = variantOperations.filter { it.operation == VariantOptionWriteOperation.ADD_INACTIVE }
                .map { it.reference.key }.toSet()
            if (assignments.any { it.reference.key in additions }) return null
            if (assignments.any { it.optionValues.size > OptionLimits.MAX_AXES }) return null
            when (operation) {
                OptionSchemaWriteOperation.REPLACE ->
                    if (ProductOptionSchema.Valid.create(expectedRevision, axes) !is ProductOptionSchema.Valid) return null
                OptionSchemaWriteOperation.CLEAR ->
                    if (axes.isNotEmpty() || assignments.isNotEmpty() || variantOperations.any { it.operation.activates }) return null
                OptionSchemaWriteOperation.UNKNOWN -> return null
            }
            return ProductOptionSchemaCommand(expectedRevision, operation, axes, assignments, variantOperations)
        }
    }
}
