package com.storecore.catalog

import com.storecore.catalog.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class OptionDomainTest {
    private val revision = SchemaRevision.of(1)!!
    private fun code(value: String) = OptionCode.of(value)!!
    private fun label(value: String) = OptionLabel.of(value)!!
    private fun axis(code: String = "a", order: Int = 0, label: String = code, values: List<OptionValue> = listOf(OptionValue(code("v"), label("Value"), 0))) =
        OptionAxis.create(code(code), label(label), OptionPresentation.SELECT, order, values)!!
    private fun schema(vararg axes: OptionAxis) = ProductOptionSchema.Valid.create(revision, axes.toList()) as ProductOptionSchema.Valid
    private fun assignment(id: String, vararg pairs: Pair<String, String>, status: VariantStatus = VariantStatus.ACTIVE) =
        VariantOptionAssignment(id, status, pairs.associate { code(it.first) to code(it.second) })

    @Test fun `closed wire translators accept exact members only`() {
        for (entry in OptionPresentation.entries) assertEquals(entry, OptionWireMapper.presentation(entry.name))
        for (entry in OptionSchemaState.entries) assertEquals(entry, OptionWireMapper.schemaState(entry.name))
        for (entry in OptionSelectionState.entries) assertEquals(entry, OptionWireMapper.selectionState(entry.name))
        for (entry in OptionValueAvailability.entries) assertEquals(entry, OptionWireMapper.availability(entry.name))
        for (entry in OptionResolutionCause.entries) assertEquals(entry, OptionWireMapper.cause(entry.name))
        for (raw in listOf(null, true, 1, "future", "select", " SELECT")) {
            assertEquals(OptionPresentation.UNKNOWN, OptionWireMapper.presentation(raw))
            assertEquals(OptionSchemaState.UNKNOWN, OptionWireMapper.schemaState(raw))
            assertEquals(OptionSelectionState.UNKNOWN, OptionWireMapper.selectionState(raw))
            assertEquals(OptionValueAvailability.UNKNOWN, OptionWireMapper.availability(raw))
            assertEquals(OptionResolutionCause.UNKNOWN, OptionWireMapper.cause(raw))
        }
        assertTrue(OptionSchemaState.ABSENT.allowsGenericSelection)
        assertTrue(OptionSchemaState.entries.filter { it != OptionSchemaState.ABSENT }.none { it.allowsGenericSelection })
        assertFalse(OptionValueAvailability.UNKNOWN.canChoose)
    }

    @Test fun `value objects validate canonical codes labels colors and revisions`() {
        for (raw in listOf("", "A", " a", "a.b", "a".repeat(65), "__proto__")) assertNull(OptionCode.of(raw))
        assertNotNull(OptionCode.of("constructor"))
        assertNotNull(OptionCode.of("a-0_b"))
        assertEquals("Long label", label("  Long\u00a0  label  ").value)
        assertEquals(label("STRASSE").uniquenessKey, label("Straße").uniquenessKey)
        assertEquals(label("Straße").uniquenessKey, label("STRAẞE").uniquenessKey)
        assertEquals(label("σ").uniquenessKey, label("ς").uniquenessKey)
        assertEquals(label("ffi").uniquenessKey, label("ﬃ").uniquenessKey)
        assertNotEquals(label("i").uniquenessKey, label("ı").uniquenessKey)
        for (raw in listOf("", " ", "x\nx", "x\u0000", "x\u200b", "x".repeat(81))) assertNull(OptionLabel.of(raw))
        assertNotNull(OptionLabel.of("😀".repeat(80)))
        for (raw in listOf("#ABCDEF", "red", "url(x)", "#ffffff;", "#fff")) assertNull(SwatchColor.of(raw))
        assertNotNull(SwatchColor.of("#abcdef"))
        assertNull(SchemaRevision.of(0)); assertNull(SchemaRevision.of(-1)); assertNotNull(SchemaRevision.of(Int.MAX_VALUE.toLong()))
        assertNull(SchemaRevision.of(Int.MAX_VALUE.toLong() + 1)); assertNull(SchemaRevision.of(Long.MAX_VALUE))
    }

    @Test fun `schema requires bounded distinct axes values labels and order`() {
        assertTrue(ProductOptionSchema.Valid.create(revision, emptyList()) is ProductOptionSchema.Invalid)
        assertTrue(ProductOptionSchema.Valid.create(revision, (0..4).map { axis("a$it", it) }) is ProductOptionSchema.Invalid)
        assertTrue(ProductOptionSchema.Valid.create(revision, listOf(axis(), axis())) is ProductOptionSchema.Invalid)
        assertTrue(ProductOptionSchema.Valid.create(revision, listOf(axis("a", 0, "Name"), axis("b", 1, " NAME "))) is ProductOptionSchema.Invalid)
        val one = OptionValue(code("v"), label("One"), 0)
        assertNull(OptionAxis.create(code("a"), label("A"), OptionPresentation.UNKNOWN, 0, listOf(one)))
        assertNull(OptionAxis.create(code("a"), label("A"), OptionPresentation.SELECT, 0, emptyList()))
        assertNull(OptionAxis.create(code("a"), label("A"), OptionPresentation.SELECT, 0, listOf(one, one)))
        val maximum = (0 until 50).map { OptionValue(code("v$it"), label("Value $it"), it) }
        assertNotNull(OptionAxis.create(code("a"), label("A"), OptionPresentation.SELECT, 0, maximum))
        assertNull(OptionAxis.create(code("a"), label("A"), OptionPresentation.SELECT, 0, maximum + OptionValue(code("extra"), label("Extra"), 50)))
        assertEquals(listOf(code("a"), code("b")), schema(axis("b", 8), axis("a", 2)).axes.map { it.code })
    }

    @Test fun `schema and assignment snapshots cannot be mutated by their caller`() {
        val values = mutableListOf(OptionValue(code("v"), label("Value"), 0))
        val axis = axis(values = values)
        values.clear()
        assertEquals(1, axis.values.size)
        assertThrows(UnsupportedOperationException::class.java) { (axis.values as MutableList).clear() }
        val map = mutableMapOf(code("a") to code("v"))
        val assignment = VariantOptionAssignment("id", VariantStatus.ACTIVE, map)
        map.clear()
        assertEquals(1, assignment.optionValues.size)
    }

    @Test fun `combinations are ordered structured keys with strict membership`() {
        val schema = schema(axis("b", 1), axis("a", 0))
        val first = OptionCombination.create(schema, linkedMapOf(code("b") to code("v"), code("a") to code("v")))!!
        val second = OptionCombination.create(schema, linkedMapOf(code("a") to code("v"), code("b") to code("v")))!!
        assertEquals(first, second); assertEquals(first.hashCode(), second.hashCode())
        assertEquals(listOf(code("a"), code("b")), first.values.map { it.first })
        assertNull(OptionCombination.create(schema, emptyMap()))
        assertNull(OptionCombination.create(schema, mapOf(code("a") to code("missing"), code("b") to code("v"))))
    }

    @Test fun `active assignments are complete unique and inactive pending creates no vector`() {
        val validate = ValidateVariantAssignmentsStep()
        val schema = schema(axis())
        assertTrue(validate.execute(schema, listOf(assignment("1"))) is OptionAssignmentValidation.Unknown)
        assertTrue(validate.execute(schema, listOf(assignment("1", "a" to "v"), assignment("2", "a" to "v"))) is OptionAssignmentValidation.Unknown)
        assertTrue(validate.execute(schema, listOf(assignment("1", "wrong" to "v", status = VariantStatus.INACTIVE))) is OptionAssignmentValidation.Unknown)
        val valid = validate.execute(schema, listOf(assignment("1", "a" to "v"), assignment("2", status = VariantStatus.INACTIVE))) as OptionAssignmentValidation.Valid
        assertEquals(setOf("1"), valid.combinations.keys)
        assertTrue(validate.execute(schema, listOf(assignment("1", status = VariantStatus.UNKNOWN))) is OptionAssignmentValidation.Unknown)
        assertTrue(validate.execute(schema, List(1001) { assignment("$it", status = VariantStatus.INACTIVE) }) is OptionAssignmentValidation.Unknown)
        val absent = validate.execute(ProductOptionSchema.Absent(revision), listOf(assignment("1"), assignment("2"))) as OptionAssignmentValidation.Valid
        assertTrue(absent.combinations.isEmpty())
        assertTrue(validate.execute(ProductOptionSchema.Absent(revision), listOf(assignment("1", "a" to "v"))) is OptionAssignmentValidation.Unknown)
    }

    private fun wire(state: OptionSchemaState = OptionSchemaState.VALID, axes: List<Any?> = listOf(wireAxis())) =
        mapOf("revision" to 1, "state" to state.name, "cause" to null, "axes" to axes)
    private fun wireAxis(presentation: Any? = OptionPresentation.SELECT.name, values: List<Any?> = listOf(mapOf("code" to "v", "label" to "Value", "order" to 0))) =
        mapOf("code" to "a", "label" to "Axis", "presentation" to presentation, "order" to 0, "values" to values)

    @Test fun `wire invalid unknown malformed and oversized schemas never become absent`() {
        assertTrue(OptionWireMapper.fromWire(wire()) is ProductOptionSchema.Valid)
        assertTrue(OptionWireMapper.fromWire(wire(OptionSchemaState.ABSENT, emptyList())) is ProductOptionSchema.Absent)
        val bad = listOf(null, emptyMap<String, Any>(), wire(axes = emptyList()), wire(OptionSchemaState.ABSENT), wire(OptionSchemaState.INVALID),
            wire(axes = listOf(wireAxis("future"))), wire(axes = List(5) { wireAxis() }), wire() + ("revision" to "1"),
            wire() + ("revision" to 1.0), wire() + ("cause" to OptionResolutionCause.PARTIAL.name),
            wire(axes = listOf(wireAxis(values = List(51) { mapOf("code" to "v$it", "label" to "Value $it", "order" to it) }))),
            wire(axes = listOf(wireAxis(values = listOf(mapOf("code" to "v", "label" to "Value", "order" to 0, "swatchColor" to "url(x)"))))))
        for (raw in bad) {
            val schema = OptionWireMapper.fromWire(raw)
            assertEquals(OptionSchemaState.UNKNOWN, schema.state)
            assertFalse(schema.state.allowsGenericSelection)
        }
    }

    @Test fun `selection cases own their cause and never accept mismatched blocked identity`() {
        assertEquals(OptionResolutionCause.PARTIAL, OptionSelection.Incomplete.cause)
        assertEquals(OptionSelectionState.UNKNOWN, OptionSelection.Unknown().state)
        assertThrows(IllegalArgumentException::class.java) { OptionSelection.Unknown(OptionResolutionCause.PARTIAL) }
        assertThrows(IllegalArgumentException::class.java) { OptionSelection.Unavailable(OptionResolutionCause.OUT_OF_STOCK) }
        val complete = OptionSelection.Complete("id", ProductSku("sku"), OptionCombination.create(schema(axis()), mapOf(code("a") to code("v")))!!)
        assertSame(complete, OptionSelection.Unavailable(OptionResolutionCause.OUT_OF_STOCK, complete).resolved)
        assertThrows(IllegalArgumentException::class.java) { OptionSelection.Unavailable(OptionResolutionCause.NO_COMBINATION, complete) }
    }
}
