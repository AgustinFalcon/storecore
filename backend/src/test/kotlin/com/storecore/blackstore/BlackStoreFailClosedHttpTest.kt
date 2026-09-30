package com.storecore.blackstore

import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionBridgePort
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionResult
import com.storecore.blackstore.infrastructure.BlackStoreExpiryWorker
import com.storecore.blackstore.infrastructure.InMemoryCompanionSecretProvider
import com.storecore.commerce.domain.ProjectionSourceCause
import java.util.UUID
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

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
class BlackStoreFailClosedHttpTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val worker: BlackStoreExpiryWorker,
    @Autowired private val projectionBridge: LegacyBlackStoreProjectionBridgePort,
    @Autowired private val secrets: InMemoryCompanionSecretProvider,
) {
    @Test
    fun `mutating and read routes stay 403 while capability is disabled`() {
        val client = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        val bearer = CompanionAuthTestSupport.seedReadyCompanion(jdbc, secrets, client)
        listOf(
            "/blackstore-integration/v1/catalog" to HttpMethod.GET,
            "/blackstore-integration/v1/stock/variants/1" to HttpMethod.GET,
            "/blackstore-integration/v1/reservations" to HttpMethod.POST,
            "/blackstore-integration/v1/reservations/00000000-0000-0000-0000-000000000001/commit" to HttpMethod.POST,
            "/blackstore-integration/v1/reservations/00000000-0000-0000-0000-000000000001/release" to HttpMethod.POST,
            "/blackstore-integration/v1/operations/00000000-0000-0000-0000-000000000002" to HttpMethod.GET,
            "/blackstore-integration/v1/operations/reconcile" to HttpMethod.POST,
        ).forEach { (path, method) ->
            val headers = HttpHeaders().apply {
                contentType = MediaType.APPLICATION_JSON
                set(HttpHeaders.AUTHORIZATION, "Bearer $bearer")
                set("X-Client-Instance-Id", client.toString())
                set("X-Device-Id", "pos-fail")
                set("X-Sale-Id", "sale-fail")
                set("X-Operation-Id", "00000000-0000-0000-0000-000000000002")
            }
            val response = http.exchange(path, method, HttpEntity("{}", headers), String::class.java)
            assertEquals(403, response.statusCode.value(), path)
            assertTrue(response.body!!.contains("CAPABILITY_DISABLED"), path)
            assertTrue(response.body!!.contains("\"code\":403"), path)
            assertFalse(response.headers.containsKey("Retry-After"), path)
            listOf("4111111111111111", "sk_live_", "cvv", "password=").forEach { secret ->
                assertFalse(response.body!!.contains(secret), "$path leaked $secret")
            }
        }
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operations", Int::class.java))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE channel='EXTERNAL_BLACKSTORE'", Int::class.java))
        assertEquals(0, worker.expireReserved())
        assertEquals(0, worker.purgeTerminal())
        assertEquals(
            LegacyBlackStoreProjectionResult.NOT_ELIGIBLE,
            projectionBridge.requestProjection(emptyList(), ProjectionSourceCause.Unknown),
        )
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind='LISTING_STOCK'", Int::class.java))
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        assertEquals(false, jdbc.queryForObject("SELECT future_optional FROM capability_modules WHERE module_code='BLACKSTORE_INTEGRATION'", Boolean::class.java))
    }

    @Test
    fun `openapi draft is served without activating the module`() {
        val response = http.getForEntity("/blackstore-integration/v1/openapi.yaml", String::class.java)
        assertEquals(200, response.statusCode.value())
        assertTrue(response.body!!.contains("1.0.0-draft"))
        assertTrue(response.body!!.contains("OperationRetired"))
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
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
