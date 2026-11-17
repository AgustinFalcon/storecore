package com.storecore.catalog.infrastructure

import com.fasterxml.jackson.core.JsonFactory
import com.fasterxml.jackson.core.JsonToken
import com.fasterxml.jackson.core.StreamReadConstraints
import com.fasterxml.jackson.core.StreamReadFeature
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.catalog.domain.*
import org.springframework.stereotype.Component
import java.io.InputStream

@Component
class ProductOptionCommandParser internal constructor(
    private val treeDecoder: (ByteArray) -> JsonNode,
) {
    constructor() : this({ bytes -> mapper.readTree(bytes) })

    fun parse(input: InputStream): ProductOptionSchemaCommand {
        val bytes = input.readNBytes(MAX_BYTES + 1)
        if (bytes.size > MAX_BYTES) invalid("CATALOG_OPTION_COMMAND_TOO_LARGE")
        try { preflight(bytes) } catch (error: CatalogOptionInvalid) { throw error } catch (_: Exception) { invalid() }
        val root: JsonNode = try { treeDecoder(bytes) } catch (error: CatalogOptionInvalid) { throw error } catch (_: Exception) { invalid() }
        if (!root.isObject || root.fieldNames().asSequence().toSet() != ROOT_FIELDS) invalid()
        val revisionNode = root.get("expectedRevision")
        val revision = revisionNode?.takeIf { it.isIntegralNumber && it.canConvertToLong() }
            ?.longValue()?.let(SchemaRevision::of) ?: invalid()
        val operation = OptionSchemaWriteOperation.fromWire(text(root, "operation"))
        val axes = array(root, "axes", OptionLimits.MAX_AXES).map(::axis)
        val assignments = array(root, "assignments", OptionLimits.MAX_ASSIGNMENTS).map(::assignment)
        val variantOperations = array(root, "variantOperations", OptionLimits.MAX_VARIANTS).map(::variantOperation)
        return ProductOptionSchemaCommand.create(revision, operation, axes, assignments, variantOperations) ?: invalid()
    }

    private fun axis(node: JsonNode): OptionAxis {
        fields(node, AXIS_FIELDS)
        val values = array(node, "values", OptionLimits.MAX_VALUES_PER_AXIS).map(::value)
        return OptionAxis.create(
            code(node, "code"), label(node, "label"), OptionWireMapper.presentation(text(node, "presentation")),
            integer(node, "order"), values,
        ) ?: invalid()
    }

    private fun value(node: JsonNode): OptionValue {
        fields(node, VALUE_FIELDS)
        val swatchNode = node.get("swatchColor")
        val swatch = when {
            swatchNode == null || swatchNode.isNull -> null
            swatchNode.isTextual -> SwatchColor.of(transport(swatchNode.textValue())) ?: invalid()
            else -> invalid()
        }
        return try { OptionValue(code(node, "code"), label(node, "label"), integer(node, "order"), swatch) }
        catch (_: IllegalArgumentException) { invalid() }
    }

    private fun assignment(node: JsonNode): VariantOptionAssignmentCommand {
        fields(node, ASSIGNMENT_FIELDS, optional = REFERENCE_FIELDS)
        val valuesNode = node.get("optionValues")?.takeIf(JsonNode::isObject) ?: invalid()
        if (valuesNode.size() > OptionLimits.MAX_AXES) invalid()
        val values = linkedMapOf<OptionCode, OptionCode>()
        valuesNode.fields().forEach { (rawAxis, rawValue) ->
            val axis = OptionCode.of(transport(rawAxis)) ?: invalid()
            val value = rawValue.takeIf(JsonNode::isTextual)?.textValue()?.let(::transport)?.let(OptionCode::of) ?: invalid()
            if (values.put(axis, value) != null) invalid()
        }
        return VariantOptionAssignmentCommand(reference(node), values)
    }

    private fun variantOperation(node: JsonNode): VariantOptionWrite {
        val operation = VariantOptionWriteOperation.fromWire(text(node, "operation"))
        if (operation == VariantOptionWriteOperation.ADD_INACTIVE) {
            fields(node, ADD_INACTIVE_FIELDS)
            val sku = VariantOptionReference.Sku.of(text(node, "sku")) ?: invalid()
            val label = VariantOptionLabel.of(text(node, "label")) ?: invalid()
            return VariantOptionWrite(operation, sku, label)
        }
        fields(node, VARIANT_OPERATION_FIELDS, optional = REFERENCE_FIELDS)
        return VariantOptionWrite(operation, reference(node))
    }

    private fun reference(node: JsonNode): VariantOptionReference {
        val id = node.get("variantId")
        val sku = node.get("variantSku")
        if ((id == null) == (sku == null)) invalid()
        return if (id != null) {
            val value = id.takeIf(JsonNode::isTextual)?.textValue()?.let(::transport)
                ?.takeIf { it.matches(Regex("[1-9][0-9]{0,18}")) }?.toLongOrNull() ?: invalid()
            VariantOptionReference.Id.of(value) ?: invalid()
        } else {
            val value = sku!!.takeIf(JsonNode::isTextual)?.textValue()?.let(::transport) ?: invalid()
            VariantOptionReference.Sku.of(value) ?: invalid()
        }
    }

    private fun code(node: JsonNode, field: String) = OptionCode.of(text(node, field)) ?: invalid()
    private fun label(node: JsonNode, field: String) = OptionLabel.of(text(node, field)) ?: invalid()
    private fun text(node: JsonNode, field: String): String =
        node.get(field)?.takeIf(JsonNode::isTextual)?.textValue()?.let(::transport) ?: invalid()
    private fun integer(node: JsonNode, field: String): Int =
        node.get(field)?.takeIf { it.isIntegralNumber && it.canConvertToInt() }?.intValue() ?: invalid()
    private fun array(node: JsonNode, field: String, maximum: Int): List<JsonNode> {
        val value = node.get(field)?.takeIf(JsonNode::isArray) ?: invalid()
        if (value.size() > maximum) invalid()
        return value.toList()
    }
    private fun fields(node: JsonNode, required: Set<String>, optional: Set<String> = emptySet()) {
        if (!node.isObject) invalid()
        val actual = node.fieldNames().asSequence().toSet()
        if (!actual.containsAll(required) || actual.any { it !in required && it !in optional }) invalid()
    }
    private fun transport(value: String): String = value.takeIf { it.codePointCount(0, it.length) <= MAX_STRING_CODE_POINTS } ?: invalid()
    private fun invalid(code: String = "CATALOG_OPTION_COMMAND_INVALID"): Nothing = throw CatalogOptionInvalid(code)

    /**
     * Rejects bounded collections while the document is still a token stream. The
     * domain decoder remains the only wire translator; this pass only protects its
     * materialization boundary.
     */
    private fun preflight(bytes: ByteArray) {
        mapper.factory.createParser(bytes).use { parser ->
            if (parser.nextToken() != JsonToken.START_OBJECT) invalid()
            scanObject(parser, StreamContext.ROOT)
            if (parser.nextToken() != null) invalid()
        }
    }

    private fun scanObject(parser: com.fasterxml.jackson.core.JsonParser, context: StreamContext) {
        var fields = 0
        while (parser.nextToken() != JsonToken.END_OBJECT) {
            if (parser.currentToken != JsonToken.FIELD_NAME) invalid()
            val field = parser.currentName
            fields++
            if (context == StreamContext.OPTION_VALUES) {
                if (fields > OptionLimits.MAX_AXES) invalid()
                validateTransport(field)
            }
            val valueToken = parser.nextToken() ?: invalid()
            val arrayContext = context.arrayContext(field)
            val objectContext = context.objectContext(field)
            when {
                arrayContext != null -> {
                    if (valueToken != JsonToken.START_ARRAY) invalid()
                    scanArray(parser, arrayContext)
                }
                objectContext != null -> {
                    if (valueToken != JsonToken.START_OBJECT) invalid()
                    scanObject(parser, objectContext)
                }
                else -> validateScalar(parser, context, field, valueToken)
            }
        }
    }

    private fun scanArray(parser: com.fasterxml.jackson.core.JsonParser, context: StreamContext) {
        var elements = 0
        while (parser.nextToken() != JsonToken.END_ARRAY) {
            elements++
            if (elements > context.maximum) invalid()
            if (parser.currentToken != JsonToken.START_OBJECT) invalid()
            scanObject(parser, context.elementContext)
        }
    }

    private fun validateScalar(parser: com.fasterxml.jackson.core.JsonParser, context: StreamContext, field: String, token: JsonToken) {
        val textual = when (context) {
            StreamContext.ROOT -> field == "operation"
            StreamContext.AXIS -> field in setOf("code", "label", "presentation")
            StreamContext.VALUE -> field in setOf("code", "label") || (field == "swatchColor" && token != JsonToken.VALUE_NULL)
            StreamContext.ASSIGNMENT -> field in REFERENCE_FIELDS
            StreamContext.VARIANT_OPERATION -> field in setOf("operation", "variantId", "variantSku", "sku", "label")
            StreamContext.OPTION_VALUES -> true
            else -> false
        }
        val integral = (context == StreamContext.ROOT && field == "expectedRevision") ||
            ((context == StreamContext.AXIS || context == StreamContext.VALUE) && field == "order")
        val nullableSwatch = context == StreamContext.VALUE && field == "swatchColor" && token == JsonToken.VALUE_NULL
        if (textual) {
            if (token != JsonToken.VALUE_STRING) invalid()
            validateTransport(parser.text)
        } else if (integral) {
            if (token != JsonToken.VALUE_NUMBER_INT) invalid()
        } else if (!nullableSwatch) invalid()
    }

    private fun validateTransport(value: String) {
        if (value.codePointCount(0, value.length) > MAX_STRING_CODE_POINTS) invalid()
    }

    private enum class StreamContext(val maximum: Int = Int.MAX_VALUE) {
        ROOT,
        AXES(OptionLimits.MAX_AXES),
        AXIS,
        VALUES(OptionLimits.MAX_VALUES_PER_AXIS),
        VALUE,
        ASSIGNMENTS(OptionLimits.MAX_ASSIGNMENTS),
        ASSIGNMENT,
        OPTION_VALUES,
        VARIANT_OPERATIONS(OptionLimits.MAX_VARIANTS),
        VARIANT_OPERATION,
        OTHER;

        val elementContext: StreamContext
            get() = when (this) {
                AXES -> AXIS
                VALUES -> VALUE
                ASSIGNMENTS -> ASSIGNMENT
                VARIANT_OPERATIONS -> VARIANT_OPERATION
                else -> OTHER
            }

        fun arrayContext(field: String): StreamContext? = when (this) {
            ROOT -> when (field) {
                "axes" -> AXES
                "assignments" -> ASSIGNMENTS
                "variantOperations" -> VARIANT_OPERATIONS
                else -> null
            }
            AXIS -> if (field == "values") VALUES else null
            else -> null
        }

        fun objectContext(field: String): StreamContext? = when (this) {
            ASSIGNMENT -> if (field == "optionValues") OPTION_VALUES else null
            else -> null
        }
    }

    companion object {
        const val MAX_BYTES = 2 * 1024 * 1024
        const val MAX_DEPTH = 12
        const val MAX_STRING_CODE_POINTS = 2_048
        private val ROOT_FIELDS = setOf("expectedRevision", "operation", "axes", "assignments", "variantOperations")
        private val AXIS_FIELDS = setOf("code", "label", "presentation", "order", "values")
        private val VALUE_FIELDS = setOf("code", "label", "order", "swatchColor")
        private val REFERENCE_FIELDS = setOf("variantId", "variantSku")
        private val ASSIGNMENT_FIELDS = setOf("optionValues")
        private val VARIANT_OPERATION_FIELDS = setOf("operation")
        private val ADD_INACTIVE_FIELDS = setOf("operation", "sku", "label")
        private val mapper = ObjectMapper(
            JsonFactory.builder()
                .streamReadConstraints(StreamReadConstraints.builder()
                    .maxNestingDepth(MAX_DEPTH).maxStringLength(MAX_STRING_CODE_POINTS * 4).maxNumberLength(19).build())
                .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .build(),
        ).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
    }
}
