package com.storecore.blackstore

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.blackstore.infrastructure.InMemoryCompanionSecretProvider
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import org.junit.jupiter.api.Assertions.assertEquals
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
class Posc002fHttpLoopbackTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val capabilities: JdbcCapabilityService,
    @Autowired private val secrets: InMemoryCompanionSecretProvider,
    @Autowired private val mapper: ObjectMapper,
) {
    private val client = UUID.fromString("ffffffff-ffff-ffff-ffff-ffffffffffff")

    @Test
    fun missingOperationIs404AndUnknownReceiptReconciles() {
        seedCatalog()
        activate(CapabilityState.ACTIVE, "posc002f http temporary active")
        try {
            val page = http.exchange("/blackstore-integration/v1/catalog", HttpMethod.GET, HttpEntity<Void>(headers(bearer)), String::class.java)
            assertEquals(200, page.statusCode.value(), page.body)
            val data = mapper.readTree(page.body)["data"]
            val catalogVersion = data["catalogVersion"].asText()
            val variant = data["items"][0]["variantId"].asLong()
            val priceVersion = data["items"][0]["priceVersion"].asText()
            val operation = UUID.randomUUID()
            val reserved = http.exchange(
                "/blackstore-integration/v1/reservations",
                HttpMethod.POST,
                HttpEntity(
                    """{"catalogVersion":"$catalogVersion","priceVersion":"$priceVersion","lines":[{"variantId":$variant,"sku":"SKU-F-1","quantity":1,"priceVersion":"$priceVersion"}]}""",
                    sagaHeaders(operation),
                ),
                String::class.java,
            )
            assertEquals(200, reserved.statusCode.value(), reserved.body)
            val receipt = mapper.readTree(reserved.body)["data"]["receipt"].asText()
            val missingOperation = UUID.randomUUID()
            val missing = http.exchange(
                "/blackstore-integration/v1/operations/$missingOperation",
                HttpMethod.GET,
                HttpEntity<Void>(sagaHeaders(missingOperation)),
                String::class.java,
            )
            assertEquals(404, missing.statusCode.value(), missing.body)
            assertTrue(missing.body!!.contains("NOT_FOUND"), missing.body)
            val reconcile = http.exchange(
                "/blackstore-integration/v1/operations/reconcile",
                HttpMethod.POST,
                HttpEntity(
                    """{"knownReceipts":["$receipt","unknown-receipt"]}""",
                    HttpHeaders().apply {
                        contentType = MediaType.APPLICATION_JSON
                        set(HttpHeaders.AUTHORIZATION, "Bearer $bearer")
                        set("X-Client-Instance-Id", client.toString())
                    },
                ),
                String::class.java,
            )
            assertEquals(200, reconcile.statusCode.value(), reconcile.body)
            val unknown = mapper.readTree(reconcile.body)["data"]["unknownReceipts"].map { it.asText() }
            assertEquals(listOf("unknown-receipt"), unknown)
        } finally {
            activate(CapabilityState.DISABLED, "posc002f http restore disabled")
        }
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind='LISTING_STOCK'", Int::class.java))
    }

    private lateinit var bearer: String

    private fun seedCatalog() {
        jdbc.update("INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Test', 'localhost', 'ARS') ON CONFLICT DO NOTHING")
        bearer = CompanionAuthTestSupport.seedReadyCompanion(jdbc, secrets, client)
        if (jdbc.queryForObject("SELECT COUNT(*) FROM brands WHERE slug='f-http'", Int::class.java) == 0) {
            jdbc.update("INSERT INTO brands(name, slug) VALUES ('FHttp', 'f-http')")
            jdbc.update("INSERT INTO categories(name, slug) VALUES ('FHttpCat', 'f-http-cat')")
            val productId = jdbc.queryForObject(
                "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, 'FHttp', 'f-http-sku', 10, 'ACTIVE') RETURNING id",
                Long::class.java,
            )!!
            val variant = jdbc.queryForObject(
                "INSERT INTO product_variants(product_id, sku, label) VALUES (?, 'SKU-F-1', 'Default') RETURNING id",
                Long::class.java,
                productId,
            )!!
            jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?, 8, 2)", variant)
        }
    }

    private fun activate(state: CapabilityState, reason: String) {
        val adminId = jdbc.queryForObject(
            "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('f-http@example.com', '\$argon2id\$fixture', 'F', 'Http') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id",
            Long::class.java,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id, role_id) SELECT ?, id FROM roles WHERE code='ADMIN' ON CONFLICT DO NOTHING", adminId)
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", Int::class.java)!!
        capabilities.changeState(
            InternalUserPrincipal(UUID.randomUUID(), adminId, setOf(InternalRole.ADMIN)),
            "BLACKSTORE_INTEGRATION",
            state,
            version,
            reason,
            UUID.randomUUID(),
        )
    }

    private fun headers(token: String) = HttpHeaders().apply {
        set(HttpHeaders.AUTHORIZATION, "Bearer $token")
        set("X-Client-Instance-Id", client.toString())
    }

    private fun sagaHeaders(operationId: UUID) = headers(bearer).apply {
        contentType = MediaType.APPLICATION_JSON
        set("X-Device-Id", "pos-f")
        set("X-Sale-Id", "sale-$operationId")
        set("X-Operation-Id", operationId.toString())
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
