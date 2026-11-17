package com.storecore.catalog

import com.storecore.catalog.domain.CatalogOptionInvalid
import com.storecore.catalog.domain.OptionSchemaWriteOperation
import com.storecore.catalog.domain.VariantOptionReference
import com.storecore.catalog.domain.VariantOptionWriteOperation
import com.storecore.catalog.infrastructure.ProductOptionCommandParser
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream

class ProductOptionCommandParserTest {
    private val parser = ProductOptionCommandParser()

    @Test
    fun `replace parses exact closed wire`() {
        val command = parse(replace())

        assertEquals(1, command.expectedRevision.value)
        assertEquals(OptionSchemaWriteOperation.REPLACE, command.operation)
        assertEquals("color", command.axes.single().code.value)
        assertEquals("red", command.assignments.single().optionValues.values.single().value)
        assertEquals(VariantOptionWriteOperation.KEEP, command.variantOperations.single().operation)
    }

    @Test
    fun `add inactive accepts only documented sku and label shape`() {
        val command = parse(clear("""[{"operation":"AddInactive","sku":"NEW-1","label":"Nueva"}]"""))
        val addition = command.variantOperations.single()

        assertEquals(VariantOptionWriteOperation.ADD_INACTIVE, addition.operation)
        assertEquals("NEW-1", (addition.reference as VariantOptionReference.Sku).value)
        invalid(clear("""[{"operation":"AddInactive","variantSku":"NEW-1","label":"Nueva"}]"""))
        invalid(clear("""[{"operation":"Keep","variantId":"1","label":"No permitido"}]"""))
    }

    @Test
    fun `parser rejects duplicate trailing unknown and malformed references`() {
        invalid(replace().replace("\"expectedRevision\":1", "\"expectedRevision\":1,\"expectedRevision\":1"))
        invalid(replace() + "{}")
        invalid(replace().replace("\"Replace\"", "\"Future\""))
        invalid(replace().replace("\"variantSku\":\"SKU-1\"", "\"variantSku\":\"SKU-1\",\"variantId\":\"1\""))
        invalid(replace().replace("\"optionValues\":{\"color\":\"red\"}", "\"optionValues\":{\"color\":\"red\",\"color\":\"blue\"}"))
    }

    @Test
    fun `clear rejects schema assignment and activation changes`() {
        invalid(clear("""[{"operation":"Activate","variantSku":"SKU-1"}]"""))
        invalid(clear().replace("\"axes\":[]", "\"axes\":[{}]"))
        invalid(clear().replace("\"assignments\":[]", "\"assignments\":[{}]"))
    }

    @Test
    fun `parser enforces bytes depth strings and unicode label uniqueness`() {
        val oversized = ByteArray(ProductOptionCommandParser.MAX_BYTES + 1) { ' '.code.toByte() }
        assertThrows(CatalogOptionInvalid::class.java) { parser.parse(ByteArrayInputStream(oversized)) }
        invalid("[".repeat(ProductOptionCommandParser.MAX_DEPTH + 1) + "]".repeat(ProductOptionCommandParser.MAX_DEPTH + 1))
        invalid(replace().replace("Color", "x".repeat(ProductOptionCommandParser.MAX_STRING_CODE_POINTS + 1)))
        invalid(replace().replace(
            """{"code":"red","label":"Rojo","order":0,"swatchColor":"#ff0000"}""",
            """{"code":"red","label":"Straße","order":0,"swatchColor":"#ff0000"},{"code":"blue","label":"STRASSE","order":1,"swatchColor":"#0000ff"}""",
        ))
    }

    @Test
    fun `validated assignment maps are immutable snapshots`() {
        val command = parse(replace())
        val values = command.assignments.single().optionValues
        assertThrows(UnsupportedOperationException::class.java) {
            @Suppress("UNCHECKED_CAST")
            (values as MutableMap<Any?, Any?>).clear()
        }
        assertTrue(values.isNotEmpty())
    }

    private fun parse(raw: String) = parser.parse(ByteArrayInputStream(raw.toByteArray()))
    private fun invalid(raw: String) = assertThrows(CatalogOptionInvalid::class.java) { parse(raw) }

    private fun clear(operations: String = "[]") =
        """{"expectedRevision":1,"operation":"Clear","axes":[],"assignments":[],"variantOperations":$operations}"""

    private fun replace() = """{
        "expectedRevision":1,
        "operation":"Replace",
        "axes":[{"code":"color","label":"Color","presentation":"SWATCH","order":0,"values":[{"code":"red","label":"Rojo","order":0,"swatchColor":"#ff0000"}]}],
        "assignments":[{"variantSku":"SKU-1","optionValues":{"color":"red"}}],
        "variantOperations":[{"operation":"Keep","variantSku":"SKU-1"}]
    }"""
}
