package com.storecore.blackstore

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.blackstore.infrastructure.InMemoryCompanionSecretProvider
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
class Posc002dCompanionAuthHttpTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val secrets: InMemoryCompanionSecretProvider,
    @Autowired private val mapper: ObjectMapper,
) {
    private val client = UUID.fromString("dddddddd-dddd-dddd-dddd-dddddddddddd")

    @Test
    fun bearerMatrixKeepsOpenApiPublicAndHidesSecrets() {
        secrets.clear()
        val bearer = CompanionAuthTestSupport.seedReadyCompanion(jdbc, secrets, client)
        fun exchange(path: String, headers: HttpHeaders, method: HttpMethod = HttpMethod.GET) =
            http.exchange(path, method, HttpEntity<Void>(headers), String::class.java)

        val missing = exchange("/blackstore-integration/v1/catalog", HttpHeaders())
        assertEnvelope(missing, 401, "UNAUTHORIZED", retryable = false)

        val headerOnly = HttpHeaders().apply { set("X-Client-Instance-Id", client.toString()) }
        val headerWithoutBearer = exchange("/blackstore-integration/v1/catalog", headerOnly)
        assertEnvelope(headerWithoutBearer, 401, "UNAUTHORIZED", retryable = false)

        val malformed = exchange("/blackstore-integration/v1/catalog", headers("not-a-hex-token", client))
        assertEnvelope(malformed, 401, "UNAUTHORIZED", retryable = false)
        val shortBearer = exchange("/blackstore-integration/v1/catalog", headers("ab".repeat(8), client))
        assertEnvelope(shortBearer, 401, "UNAUTHORIZED", retryable = false)

        val bad = exchange("/blackstore-integration/v1/catalog", headers("ab".repeat(32), client))
        assertEnvelope(bad, 401, "UNAUTHORIZED", retryable = false)

        val bound = exchange("/blackstore-integration/v1/catalog", headers(bearer, UUID.randomUUID()))
        assertEnvelope(bound, 403, "FORBIDDEN", retryable = false)

        val disabledCompanion = CompanionAuthTestSupport.seedReadyCompanion(jdbc, secrets, client, companionStatus = "DISABLED")
        val forbidden = exchange("/blackstore-integration/v1/catalog", headers(disabledCompanion, client))
        assertEnvelope(forbidden, 403, "FORBIDDEN", retryable = false)

        val catalogOnly = CompanionAuthTestSupport.seedReadyCompanion(jdbc, secrets, client, scopes = arrayOf("catalog:read"))
        val missingScope = exchange("/blackstore-integration/v1/stock/variants/1", headers(catalogOnly, client))
        assertEnvelope(missingScope, 403, "FORBIDDEN", retryable = false)

        val ready = CompanionAuthTestSupport.seedReadyCompanion(jdbc, secrets, client)
        jdbc.update("UPDATE blackstore_companion_credentials SET status='REVOKED', revoked_at=clock_timestamp() WHERE token_fingerprint=pg_catalog.btrim(?)", com.storecore.blackstore.application.CompanionTokenGenerator.fingerprint(com.storecore.blackstore.application.CompanionTokenGenerator.fromHex(ready)!!))
        val revoked = exchange("/blackstore-integration/v1/catalog", headers(ready, client))
        assertEnvelope(revoked, 401, "UNAUTHORIZED", retryable = false)

        val live = CompanionAuthTestSupport.seedReadyCompanion(jdbc, secrets, client)
        val capability = exchange("/blackstore-integration/v1/catalog", headers(live, client))
        assertEnvelope(capability, 403, "CAPABILITY_DISABLED", retryable = false)

        val cost = exchange("/blackstore-integration/v1/catalog?includeCost=true", headers(live, client))
        assertEnvelope(cost, 403, "FORBIDDEN", retryable = false)

        secrets.unavailable = true
        val outage = exchange("/blackstore-integration/v1/catalog", headers(live, client))
        assertEnvelope(outage, 500, "INTERNAL", retryable = true)
        secrets.unavailable = false

        val invalidRole = http.exchange(
            "/blackstore-integration/v1/reservations",
            HttpMethod.POST,
            HttpEntity("{}", headers(live, client).apply { set("X-Actor-Role", "CASHIER") }),
            String::class.java,
        )
        assertEnvelope(invalidRole, 400, "VALIDATION", retryable = false)

        val openapi = http.getForEntity("/blackstore-integration/v1/openapi.yaml", String::class.java)
        assertEquals(200, openapi.statusCode.value())
        assertTrue(openapi.body!!.contains("1.0.0-draft"))
        listOf(live, "test-only:", "Authorization").forEach { secret ->
            assertFalse(capability.body!!.contains(secret), "leaked $secret")
        }
    }

    private fun headers(bearer: String, instance: UUID) = HttpHeaders().apply {
        contentType = MediaType.APPLICATION_JSON
        set(HttpHeaders.AUTHORIZATION, "Bearer $bearer")
        set("X-Client-Instance-Id", instance.toString())
        set("X-Device-Id", "pos-d")
        set("X-Sale-Id", "sale-d")
        set("X-Operation-Id", UUID.randomUUID().toString())
    }

    private fun assertEnvelope(response: org.springframework.http.ResponseEntity<String>, status: Int, errorCode: String, retryable: Boolean) {
        assertEquals(status, response.statusCode.value(), response.body)
        val node = mapper.readTree(response.body)
        assertEquals(status, node.path("code").asInt(), response.body)
        assertTrue(node.path("data").isMissingNode || node.path("data").isNull, response.body)
        assertEquals(errorCode, node.path("errorCode").asText(), response.body)
        assertEquals(retryable, node.path("retryable").asBoolean(), response.body)
        assertFalse(node.path("traceId").asText().isBlank(), response.body)
    }

    companion object {
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
