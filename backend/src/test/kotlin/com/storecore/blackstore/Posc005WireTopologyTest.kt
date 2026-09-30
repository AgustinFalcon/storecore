package com.storecore.blackstore

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.http.HttpMethod
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping
import org.testcontainers.containers.PostgreSQLContainer
import java.security.MessageDigest

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
class Posc005WireTopologyTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val mapper: ObjectMapper,
    @Autowired @Qualifier("requestMappingHandlerMapping")
    private val handlerMapping: RequestMappingHandlerMapping,
) {
    @Test
    fun offlineWireServesPinnedOpenApiUniqueRoutesAndBaseResponse() {
        val expected = setOf(
            "GET /blackstore-integration/v1/catalog",
            "GET /blackstore-integration/v1/stock/variants/{variantId}",
            "POST /blackstore-integration/v1/reservations",
            "POST /blackstore-integration/v1/reservations/{reservationRef}/commit",
            "POST /blackstore-integration/v1/reservations/{reservationRef}/release",
            "GET /blackstore-integration/v1/operations/{operationId}",
            "POST /blackstore-integration/v1/operations/reconcile",
            "GET /blackstore-integration/v1/openapi.yaml",
        )
        val actual = handlerMapping.handlerMethods.flatMap { (mapping, handler) ->
            val paths = mapping.pathPatternsCondition?.patterns?.map { it.patternString }
                ?: mapping.patternsCondition?.patterns.orEmpty()
            val methods = mapping.methodsCondition.methods.map { it.name }
            paths.filter { it.startsWith("/blackstore-integration/v1") }.flatMap { path ->
                methods.map { method -> "$method $path" to handler.beanType.simpleName }
            }
        }
        val owned = actual.filter { it.first in expected }
        assertEquals(expected, owned.map { it.first }.toSet())
        assertTrue(owned.all { it.second == "BlackStoreIntegrationController" }, owned.toString())
        assertEquals(expected.size, owned.size)

        val openApi = http.getForEntity("/blackstore-integration/v1/openapi.yaml", ByteArray::class.java)
        assertEquals(200, openApi.statusCode.value())
        assertEquals("1.0.0-draft", openApi.headers.getFirst("X-Contract-Version"))
        val contentType = openApi.headers.contentType?.toString().orEmpty()
        assertTrue(contentType.contains("yaml") || contentType.contains("text/plain"), contentType)
        assertEquals(PINNED_OPENAPI_SHA256, sha256(openApi.body!!))
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))

        val unauthorized = http.exchange("/blackstore-integration/v1/catalog", HttpMethod.GET, null, String::class.java)
        assertEquals(401, unauthorized.statusCode.value(), unauthorized.body)
        val node = mapper.readTree(unauthorized.body)
        assertEquals(401, node.path("code").asInt(), unauthorized.body)
        assertTrue(node.path("data").isMissingNode || node.path("data").isNull, unauthorized.body)
        assertEquals("UNAUTHORIZED", node.path("errorCode").asText(), unauthorized.body)
        assertFalse(node.path("retryable").asBoolean(), unauthorized.body)
        assertFalse(node.path("traceId").asText().isBlank(), unauthorized.body)
        assertFalse(node.path("message").asText().isBlank(), unauthorized.body)
    }

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02X".format(it) }

    companion object {
        private const val PINNED_OPENAPI_SHA256 = "7B907A2E11C52A66B7253407FB3F9450CAE7B792BECCF34C1636BE9D3945DE30"
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @DynamicPropertySource
        fun database(registry: DynamicPropertyRegistry) {
            postgres.start()
            registry.add("spring.datasource.url") { postgres.jdbcUrl }
            registry.add("spring.datasource.username") { postgres.username }
            registry.add("spring.datasource.password") { postgres.password }
        }
    }
}
