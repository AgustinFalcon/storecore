package com.storecore.blackstore

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ArrayNode
import com.fasterxml.jackson.databind.node.ObjectNode
import com.fasterxml.jackson.dataformat.yaml.YAMLFactory
import com.networknt.schema.JsonSchemaFactory
import com.networknt.schema.SpecVersion
import io.swagger.v3.parser.OpenAPIV3Parser
import io.swagger.v3.parser.core.models.ParseOptions
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest

/** Offline contract checks for the adjudicated StoreCore/BlackStore baseline only. */
class BlackStoreOpenApiBaselineContractTest {
    private val jsonMapper = ObjectMapper()
    private val yamlMapper = ObjectMapper(YAMLFactory())
    private val contractPath = repositoryRoot().resolve(CANONICAL_CONTRACT)
    private val contractBytes = Files.readAllBytes(contractPath)
    private val document = yamlMapper.readTree(contractBytes)
    private val schemaFactory = JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012)

    @Test
    fun `canonical and served OpenAPI bytes match the pinned BlackStore digest`() {
        val canonicalDigest = sha256(contractBytes)
        val servedBytes = javaClass.getResourceAsStream(SERVED_RESOURCE)?.use { it.readBytes() }
        assertNotNull(servedBytes, "served OpenAPI resource must be packaged")
        assertEquals(canonicalDigest, sha256(servedBytes!!), "served resource must match canonical bytes")

        val pin = javaClass.getResourceAsStream(BLACKSTORE_PIN_RESOURCE)?.use(yamlMapper::readTree)
        assertNotNull(pin, "BlackStore pin snapshot must be packaged")
        assertEquals("/blackstore-integration/v1", pin!!.path("canonicalPath").asText())
        assertEquals("1.0.0-draft", pin.path("version").asText())
        assertEquals(canonicalDigest, pin.path("sha256").asText().lowercase())

        // When the consumer checkout is mounted beside StoreCore, compare its live pin too.
        val livePinPath = repositoryRoot().parent.resolve("BlackStore/backend/src/test/resources/storecore-fixtures/pin.json")
        if (Files.isRegularFile(livePinPath)) {
            val livePin = jsonMapper.readTree(Files.readAllBytes(livePinPath))
            assertEquals(canonicalDigest, livePin.path("sha256").asText().lowercase(), "local BlackStore pin drift")
        }
    }

    @Test
    fun `baseline parses as OpenAPI 3 point 1 and has seven business operations`() {
        val result = OpenAPIV3Parser().readLocation(contractPath.toUri().toString(), null, ParseOptions())
        assertNotNull(result.openAPI, result.messages.joinToString("\n"))
        assertTrue(result.messages.isNullOrEmpty(), result.messages.joinToString("\n"))
        assertEquals("3.1.0", result.openAPI.openapi)
        val expectedOperations = mapOf(
            "/blackstore-integration/v1/catalog" to setOf("get"),
            "/blackstore-integration/v1/stock/variants/{variantId}" to setOf("get"),
            "/blackstore-integration/v1/reservations" to setOf("post"),
            "/blackstore-integration/v1/reservations/{reservationRef}/commit" to setOf("post"),
            "/blackstore-integration/v1/reservations/{reservationRef}/release" to setOf("post"),
            "/blackstore-integration/v1/operations/{operationId}" to setOf("get"),
            "/blackstore-integration/v1/operations/reconcile" to setOf("post"),
        )
        val parsedOperations = result.openAPI.paths.mapValues { (_, pathItem) ->
            pathItem.readOperationsMap().keys.map { it.name.lowercase() }.toSet()
        }
        assertEquals(expectedOperations, parsedOperations, "baseline business routes and methods must remain exact")
    }

    @Test
    fun `SKU limits accept 64 and reject 65 for each baseline line surface`() {
        val sku64 = "S".repeat(64)
        val sku65 = "S".repeat(65)
        assertSchemaValid("CatalogItem", catalogItem(sku64))
        assertSchemaInvalid("CatalogItem", catalogItem(sku65))
        assertSchemaValid("VariantStock", mapOf("variantId" to 1, "sku" to sku64, "availableQuantity" to 0, "catalogVersion" to "v1"))
        assertSchemaInvalid("VariantStock", mapOf("variantId" to 1, "sku" to sku65, "availableQuantity" to 0, "catalogVersion" to "v1"))
        assertSchemaValid("ReservationLine", mapOf("variantId" to 1, "sku" to sku64, "quantity" to 1))
        assertSchemaInvalid("ReservationLine", mapOf("variantId" to 1, "sku" to sku65, "quantity" to 1))
        assertSchemaValid("LineFailure", mapOf("variantId" to 1, "sku" to sku64, "requested" to 1, "availableQuantity" to 0))
        assertSchemaInvalid("LineFailure", mapOf("variantId" to 1, "sku" to sku65, "requested" to 1, "availableQuantity" to 0))
        assertSchemaValid("OperationReceipt", durableReceipt(sku64))
        assertSchemaInvalid("OperationReceipt", durableReceipt(sku65))
    }

    @Test
    fun `error status schemas bind HTTP status to body code and endpoint-specific 409 codes`() {
        val errorSchemas = listOf(
            400 to ("ErrorResponse400" to "VALIDATION"),
            401 to ("ErrorResponse401" to "UNAUTHORIZED"),
            403 to ("ErrorResponse403" to "FORBIDDEN"),
            404 to ("ErrorResponse404" to "NOT_FOUND"),
            422 to ("ErrorResponse422" to "CATALOG_VERSION_STALE"),
            429 to ("ErrorResponse429" to "RATE_LIMITED"),
            500 to ("ErrorResponse500" to "INTERNAL"),
        )
        errorSchemas.forEach { (status, schemaAndCode) ->
            val (schema, code) = schemaAndCode
            assertSchemaValid(schema, error(status, code))
            assertSchemaInvalid(schema, error(if (status == 500) 400 else status + 1, code))
        }

        val reserveCodes = setOf("INSUFFICIENT_STOCK", "IDEMPOTENCY_PAYLOAD_MISMATCH", "EXPIRED", "CONFLICT", "OPERATION_STATE_CONFLICT")
        val commitReleaseCodes = setOf("IDEMPOTENCY_PAYLOAD_MISMATCH", "EXPIRED", "CONFLICT", "OPERATION_STATE_CONFLICT")
        val reserveSchema = responseSchema("/blackstore-integration/v1/reservations", "post", "409")
        val commitSchema = responseSchema("/blackstore-integration/v1/reservations/{reservationRef}/commit", "post", "409")
        val releaseSchema = responseSchema("/blackstore-integration/v1/reservations/{reservationRef}/release", "post", "409")
        assertEquals("ErrorResponse409Reserve", reserveSchema)
        assertEquals("ErrorResponse409CommitRelease", commitSchema)
        assertEquals(commitSchema, releaseSchema)
        assertEquals(reserveCodes, errorCodes("/blackstore-integration/v1/reservations", "post", "409"))
        assertEquals(commitReleaseCodes, errorCodes("/blackstore-integration/v1/reservations/{reservationRef}/commit", "post", "409"))
        assertEquals(commitReleaseCodes, errorCodes("/blackstore-integration/v1/reservations/{reservationRef}/release", "post", "409"))

        reserveCodes.forEach { code -> assertSchemaValid(reserveSchema, error(409, code)) }
        commitReleaseCodes.forEach { code -> assertSchemaValid(commitSchema, error(409, code)) }
        assertSchemaInvalid(commitSchema, error(409, "INSUFFICIENT_STOCK"))

        val insufficientStock = error(409, "INSUFFICIENT_STOCK") + ("lineFailures" to listOf(
            mapOf("variantId" to 1, "sku" to "SKU-1", "requested" to 2, "availableQuantity" to 1),
        ))
        assertSchemaValid(reserveSchema, insufficientStock)
        assertSchemaInvalid(reserveSchema, insufficientStock + ("lineFailures" to listOf(mapOf("variantId" to 1, "sku" to "x", "requested" to 0, "availableQuantity" to -1))))
    }

    @Test
    fun `GET operation distinguishes pending durable absent and retired responses`() {
        val getResponses = document.at("/paths/~1blackstore-integration~1v1~1operations~1{operationId}/get/responses")
        assertTrue(getResponses.has("200"))
        assertTrue(getResponses.has("404"))
        assertTrue(getResponses.has("410"))

        assertSchemaValid("OperationReceiptResponse", success(pendingReceipt()))
        assertSchemaValid("OperationReceiptResponse", success(durableReceipt("SKU-1")))
        listOf("RESERVED", "COMMITTED", "RELEASED", "EXPIRED").forEach { state ->
            val receipt = durableReceipt("SKU-1").toMutableMap().apply { put("state", state) }
            assertSchemaValid("OperationReceipt", receipt)
        }
        assertSchemaInvalid("OperationReceiptResponse", success(pendingReceipt() + ("receipt" to "must-not-exist")))
        assertSchemaInvalid("OperationReceiptResponse", success(durableReceipt("SKU-1").toMutableMap().apply { remove("acceptedPriceVersions") }))
        assertSchemaInvalid("OperationReceipt", durableReceipt("SKU-1") + ("receipt" to null))
        assertSchemaInvalid("OperationReceipt", durableReceipt("SKU-1") + ("acceptedPriceVersions" to emptyList<Any>()))
        assertSchemaInvalid("OperationReceipt", durableReceipt("SKU-1") + ("state" to "UNKNOWN"))
        assertSchemaInvalid("OperationReceipt", durableReceipt("SKU-1") + ("reservationRef" to null))
        assertSchemaInvalid("OperationReceipt", durableReceipt("SKU-1") + ("acceptedPriceVersions" to null))
        assertSchemaValid("ErrorResponse404", error(404, "NOT_FOUND"))
        assertSchemaValid("OperationRetiredResponse", error(410, "OPERATION_RETIRED", retryable = false))
        assertSchemaInvalid("OperationRetiredResponse", error(410, "OPERATION_RETIRED", retryable = true))
    }

    @Test
    fun `catalog ETag 304 and reconcile schema bounds allow duplicates without testing adapter deduplication`() {
        val catalogResponses = document.at("/paths/~1blackstore-integration~1v1~1catalog/get/responses")
        assertTrue(catalogResponses.has("200"))
        assertTrue(catalogResponses.has("304"))
        assertTrue(catalogResponses.at("/200/headers/ETag/required").asBoolean())
        assertTrue(catalogResponses.at("/304/headers/ETag/required").asBoolean())
        assertNull(catalogResponses.at("/304/content").takeUnless(JsonNode::isMissingNode))
        val etagSchema = catalogResponses.at("/200/headers/ETag/schema")
        val notModifiedEtagSchema = catalogResponses.at("/304/headers/ETag/schema")
        assertEquals(64, etagSchema.path("maxLength").asInt())
        assertEquals(64, notModifiedEtagSchema.path("maxLength").asInt())
        assertSchemaValid(etagSchema, "E".repeat(64))
        assertSchemaInvalid(etagSchema, "E".repeat(65))
        assertSchemaValid(notModifiedEtagSchema, "E".repeat(64))
        assertSchemaInvalid(notModifiedEtagSchema, "E".repeat(65))

        val knownReceipts = document.at("/components/schemas/ReconcileRequest/properties/knownReceipts")
        assertEquals(1, knownReceipts.path("minItems").asInt())
        assertEquals(500, knownReceipts.path("maxItems").asInt())
        assertFalse(knownReceipts.has("uniqueItems"), "baseline permits duplicate caller receipts")
        assertSchemaValid("ReconcileRequest", mapOf("knownReceipts" to listOf("r1")))
        assertSchemaValid("ReconcileRequest", mapOf("knownReceipts" to List(500) { "r${it}" }))
        assertSchemaValid("ReconcileRequest", mapOf("knownReceipts" to listOf("same", "same")))
        assertSchemaInvalid("ReconcileRequest", mapOf("knownReceipts" to emptyList<String>()))
        assertSchemaInvalid("ReconcileRequest", mapOf("knownReceipts" to List(501) { "r${it}" }))
    }

    private fun error(code: Int, errorCode: String, retryable: Boolean = false): Map<String, Any?> = mapOf(
        "code" to code,
        "data" to null,
        "errorCode" to errorCode,
        "retryable" to retryable,
        "message" to "contract fixture",
        "traceId" to "00000000-0000-0000-0000-000000000001",
    )

    private fun success(data: Any): Map<String, Any?> = mapOf(
        "code" to 200,
        "data" to data,
        "errorCode" to null,
        "retryable" to null,
        "message" to null,
        "traceId" to "00000000-0000-0000-0000-000000000001",
    )

    private fun pendingReceipt(): Map<String, Any?> = mapOf("state" to "PENDING", "contractVersion" to "1.0.0-draft")

    private fun durableReceipt(sku: String): Map<String, Any?> = mapOf(
        "state" to "RESERVED",
        "contractVersion" to "1.0.0-draft",
        "receipt" to "receipt-1",
        "reservationRef" to "00000000-0000-0000-0000-000000000002",
        "acceptedPriceVersions" to listOf(mapOf("variantId" to 1, "sku" to sku, "priceVersion" to "p1")),
    )

    private fun catalogItem(sku: String): Map<String, Any?> = mapOf(
        "productId" to 1,
        "variantId" to 1,
        "sku" to sku,
        "barcode" to null,
        "name" to "Fixture",
        "images" to emptyList<String>(),
        "unitPrice" to "1.00",
        "priceVersion" to "p1",
        "currency" to "ARS",
        "availableQuantity" to 0,
        "active" to true,
    )

    private fun errorCodes(path: String, method: String, status: String): Set<String> {
        val responseRef = responseReference(path, method, status)
        val responseName = responseRef.asText().substringAfterLast('/')
        return document.at("/components/responses/$responseName/x-error-codes").map(JsonNode::asText).toSet()
    }

    private fun responseSchema(path: String, method: String, status: String): String {
        val responseName = responseReference(path, method, status).asText().substringAfterLast('/')
        val schemaReference = document.at("/components/responses/$responseName/content/application~1json/schema/\$ref")
        check(schemaReference.isTextual) { "$method $path HTTP $status must reference a JSON schema" }
        return schemaReference.asText().substringAfterLast('/')
    }

    private fun responseReference(path: String, method: String, status: String): JsonNode {
        val operation = document.at("/paths/${path.replace("/", "~1")}/$method")
        return operation.at("/responses/$status/\$ref").also {
            check(it.isTextual) { "$method $path HTTP $status must reference a response" }
        }
    }

    private fun assertSchemaValid(schema: String, value: Any) {
        assertTrue(schemaViolations(schema, value).isEmpty(), "$schema rejected fixture: ${schemaViolations(schema, value)}")
    }

    private fun assertSchemaValid(schema: JsonNode, value: Any) {
        assertTrue(schemaViolations(schema, value).isEmpty(), "inline schema rejected fixture: ${schemaViolations(schema, value)}")
    }

    private fun assertSchemaInvalid(schema: String, value: Any) {
        assertTrue(schemaViolations(schema, value).isNotEmpty(), "$schema unexpectedly accepted fixture: $value")
    }

    private fun assertSchemaInvalid(schema: JsonNode, value: Any) {
        assertTrue(schemaViolations(schema, value).isNotEmpty(), "inline schema unexpectedly accepted fixture: $value")
    }

    private fun schemaViolations(schema: String, value: Any): Set<String> {
        val definitions = document.at("/components/schemas").deepCopy<ObjectNode>()
        rebaseSchemaReferences(definitions)
        val schemaDocument = jsonMapper.createObjectNode()
        schemaDocument.set<ObjectNode>("\$defs", definitions)
        schemaDocument.put("\$ref", "#/\$defs/$schema")
        return schemaViolations(schemaDocument, value)
    }

    private fun schemaViolations(schema: JsonNode, value: Any): Set<String> {
        val schemaValidator = schemaFactory.getSchema(schema)
        val instance = jsonMapper.valueToTree<JsonNode>(value)
        return schemaValidator.validate(instance).map { it.message }.toSet()
    }

    private fun rebaseSchemaReferences(node: JsonNode) {
        when (node) {
            is ObjectNode -> {
                val iterator = node.fields()
                val removals = mutableListOf<String>()
                while (iterator.hasNext()) {
                    val (name, value) = iterator.next()
                    // OpenAPI's discriminator is documentation metadata; oneOf/const carries the JSON Schema rule.
                    if (name == "discriminator") {
                        removals += name
                    } else if (name == "\$ref" && value.isTextual) {
                        node.put(name, value.asText().replace("#/components/schemas/", "#/\$defs/"))
                    } else {
                        rebaseSchemaReferences(value)
                    }
                }
                removals.forEach(node::remove)
            }
            is ArrayNode -> node.forEach(::rebaseSchemaReferences)
        }
    }

    private fun repositoryRoot(): Path {
        var current = Path.of("").toAbsolutePath().normalize()
        while (current.parent != null) {
            if (Files.isRegularFile(current.resolve("backend/pom.xml")) && Files.isRegularFile(current.resolve(CANONICAL_CONTRACT))) return current
            current = current.parent
        }
        error("Could not locate StoreCore repository root from ${Path.of("").toAbsolutePath()}")
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { "%02x".format(it) }

    companion object {
        private const val CANONICAL_CONTRACT = "sdd/wip/20260921-storecore-pos-integration-contract-v1/2-technical/api/blackstore-integration.openapi.yaml"
        private const val SERVED_RESOURCE = "/openapi/blackstore-integration.openapi.yaml"
        private const val BLACKSTORE_PIN_RESOURCE = "/openapi/blackstore-pin.json"
    }
}
