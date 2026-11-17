package com.storecore.catalog.infrastructure

import com.fasterxml.jackson.core.JsonFactory
import com.fasterxml.jackson.core.StreamReadConstraints
import com.fasterxml.jackson.core.StreamReadFeature
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.catalog.domain.*
import org.springframework.stereotype.Component
import java.io.InputStream

@Component
class ProductOptionCommandParser {
    fun parse(input: InputStream): ProductOptionSchemaCommand {
        val bytes = input.readNBytes(MAX_BYTES + 1)
        if (bytes.size > MAX_BYTES) invalid("CATALOG_OPTION_COMMAND_TOO_LARGE")
        val root: JsonNode = try { mapper.readTree(bytes) } catch (_: Exception) { invalid() }
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
            code(node, "code"), label(node, "label"), OptionPresentation.fromWire(text(node, "presentation")),
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
