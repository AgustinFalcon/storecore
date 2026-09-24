package com.storecore.blackstore

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.blackstore.infrastructure.BlackStoreExpiryWorker
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
class BlackStoreHttpContractTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val capabilities: JdbcCapabilityService,
    @Autowired private val worker: BlackStoreExpiryWorker,
    @Autowired private val mapper: ObjectMapper,
) {
    @LocalServerPort
    private var port: Int = 0

    private val client = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    @Test
    fun `cas temporary active proves catalog 200 then disabled returns 403`() {
        assertEquals(403, catalog().statusCode.value())
        seedCatalog()
        activate(CapabilityState.ACTIVE, "testcontainers temporary active")
        val enabled = catalog()
        assertEquals(200, enabled.statusCode.value(), enabled.body)
        assertTrue(enabled.body!!.contains("SKU-HTTP-1"), enabled.body)
        assertTrue(enabled.headers.eTag != null || enabled.body!!.contains("catalogVersion"), enabled.body)
        val stock = http.exchange(
            "/blackstore-integration/v1/stock/variants/${variantId()}",
            HttpMethod.GET,
            HttpEntity<Void>(clientHeaders()),
            String::class.java,
        )
        assertEquals(200, stock.statusCode.value(), stock.body)
        activate(CapabilityState.DISABLED, "restore disabled baseline")
        assertEquals(403, catalog().statusCode.value())
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
    }

    @Test
    fun `cas temporary active proves 304 reserve commit get 409 410 and 429`() {
        seedCatalog()
        assertEnvelope(catalog(), 403, "CAPABILITY_DISABLED", retryable = false)
        activate(CapabilityState.ACTIVE, "testcontainers temporary active matrix")
        try {
            val page = catalog()
            assertEquals(200, page.statusCode.value(), page.body)
            assertSuccessEnvelope(page)
            val data = mapper.readTree(page.body)["data"]
            assertEquals("SKU-HTTP-1", data["items"][0]["sku"].asText())
            assertTrue(data.has("validUntil"))
            assertTrue(data["items"][0].has("barcode"))
            assertTrue(data["items"][0].has("priceVersion"))
            assertTrue(data["items"][0].has("images"))
            assertTrue(data["items"][0].has("active"))
            assertEquals(6, data["items"][0]["availableQuantity"].asInt())
            val catalogVersion = data["catalogVersion"].asText()
            val priceVersion = data["items"][0]["priceVersion"].asText()
            val variant = data["items"][0]["variantId"].asLong()

            val quoted = page.headers.eTag
            require(!quoted.isNullOrBlank()) { "catalog ETag missing: ${page.headers}" }
            val notModified = http.exchange(
                "/blackstore-integration/v1/catalog",
                HttpMethod.GET,
                HttpEntity<Void>(clientHeaders().apply { set("If-None-Match", quoted) }),
                String::class.java,
            )
            assertEquals(304, notModified.statusCode.value(), notModified.body)
            val weak = http.exchange(
                "/blackstore-integration/v1/catalog",
                HttpMethod.GET,
                HttpEntity<Void>(clientHeaders().apply { set("If-None-Match", "W/$quoted") }),
                String::class.java,
            )
            assertEquals(304, weak.statusCode.value(), weak.body)

            val cost = http.exchange(
                "/blackstore-integration/v1/catalog?includeCost=true",
                HttpMethod.GET,
                HttpEntity<Void>(clientHeaders()),
                String::class.java,
            )
            assertEnvelope(cost, 403, "COST_SCOPE_REQUIRED", retryable = false)

            val stale = reserve(UUID.randomUUID(), catalogVersion = "stale-version", variantId = variant, priceVersion = priceVersion)
            assertEnvelope(stale, 422, "CATALOG_VERSION_STALE", retryable = false)

            val short = reserve(UUID.randomUUID(), catalogVersion = catalogVersion, variantId = variant, priceVersion = priceVersion, quantity = 7)
            assertEnvelope(short, 409, "INSUFFICIENT_STOCK", retryable = false)
            assertTrue(short.body!!.contains("\"availableQuantity\":6"), short.body)

            val operationId = UUID.randomUUID()
            val reserved = reserve(operationId, catalogVersion = catalogVersion, variantId = variant, priceVersion = priceVersion)
            assertEquals(200, reserved.statusCode.value(), reserved.body)
            assertSuccessEnvelope(reserved)
            val reservedData = mapper.readTree(reserved.body)["data"]
            assertEquals("RESERVED", reservedData["state"].asText())
            val receipt = reservedData["receipt"].asText()
            val reservationRef = reservedData["reservationRef"].asText()

            val got = operation(operationId)
            assertEquals(200, got.statusCode.value(), got.body)
            assertEquals("RESERVED", mapper.readTree(got.body)["data"]["state"].asText())

            val missing = operation(UUID.randomUUID())
            assertEnvelope(missing, 404, "NOT_FOUND", retryable = false)

            val committed = mutate("commit", operationId, reservationRef)
            assertEquals(200, committed.statusCode.value(), committed.body)
            assertEquals("COMMITTED", mapper.readTree(committed.body)["data"]["state"].asText())
            assertEquals(
                5,
                jdbc.queryForObject("SELECT desired_quantity FROM channel_listings WHERE external_listing_id='ML-HTTP-1'", Int::class.java),
            )
            assertEquals(
                1,
                jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind='LISTING_STOCK'", Int::class.java),
            )
            assertEquals(
                0,
                jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE channel='MERCADO_LIBRE'", Int::class.java),
            )

            val conflict = reserve(operationId, catalogVersion = catalogVersion, variantId = variant, priceVersion = priceVersion)
            assertEnvelope(conflict, 409, "OPERATION_STATE_CONFLICT", retryable = false)
            assertEquals("COMMITTED", mapper.readTree(operation(operationId).body)["data"]["state"].asText())

            val reconciled = http.exchange(
                "/blackstore-integration/v1/operations/reconcile",
                HttpMethod.POST,
                HttpEntity("""{"knownReceipts":["$receipt","unknown-http"]}""", clientHeaders()),
                String::class.java,
            )
            assertEquals(200, reconciled.statusCode.value(), reconciled.body)
            val reconcileData = mapper.readTree(reconciled.body)["data"]
            assertEquals(1, reconcileData["present"].size())
            assertTrue(reconcileData["unknownReceipts"].toString().contains("unknown-http"))

            jdbc.update("UPDATE blackstore_integration_operations SET updated_at = now() - interval '91 days' WHERE operation_id=?", operationId)
            assertEquals(1, worker.purgeTerminal())
            val retiredGet = operation(operationId)
            assertEnvelope(retiredGet, 410, "OPERATION_RETIRED", retryable = false)
            val retiredPost = reserve(operationId, catalogVersion = catalogVersion, variantId = variant, priceVersion = priceVersion)
            assertEnvelope(retiredPost, 410, "OPERATION_RETIRED", retryable = false)

            val concurrentOp = UUID.randomUUID()
            val start = CountDownLatch(1)
            val codes = java.util.concurrent.ConcurrentLinkedQueue<Int>()
            val pool = Executors.newFixedThreadPool(2)
            repeat(2) {
                pool.submit {
                    start.await()
                    codes += reserve(concurrentOp, catalogVersion = catalogVersion, variantId = variant, priceVersion = priceVersion).statusCode.value()
                }
            }
            start.countDown()
            pool.shutdown()
            assertTrue(pool.awaitTermination(20, TimeUnit.SECONDS))
            assertTrue(codes.all { it == 200 || it == 409 }, codes.toString())
            assertTrue(codes.any { it == 200 }, codes.toString())

            var limited: Triple<Int, String, String?>? = null
            repeat(8) { index ->
                val response = rawPost(
                    "/blackstore-integration/v1/operations/reconcile",
                    """{"knownReceipts":["probe-$index"]}""",
                )
                if (response.first == 429) {
                    limited = response
                    return@repeat
                }
            }
            val rate = requireNotNull(limited) { "expected RATE_LIMITED after reconcile burst" }
            assertEquals(429, rate.first, rate.second)
            val node = mapper.readTree(rate.second)
            assertEquals("RATE_LIMITED", node.path("errorCode").asText(), rate.second)
            assertTrue(node.path("retryable").asBoolean(), rate.second)
            assertFalse(rate.third.isNullOrBlank(), "Retry-After missing")
        } finally {
            activate(CapabilityState.DISABLED, "restore disabled baseline")
            assertEquals(403, catalog().statusCode.value())
            assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        }
    }

    private fun rawPost(path: String, body: String): Triple<Int, String, String?> {
        val connection = java.net.URI.create("http://localhost:$port$path").toURL().openConnection() as java.net.HttpURLConnection
        connection.requestMethod = "POST"
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        connection.setRequestProperty("X-Client-Instance-Id", client.toString())
        connection.outputStream.use { it.write(body.toByteArray()) }
        val status = connection.responseCode
        val payload = (if (status >= 400) connection.errorStream else connection.inputStream)
            ?.bufferedReader()?.readText().orEmpty()
        return Triple(status, payload, connection.getHeaderField("Retry-After"))
    }

    private fun catalog() = http.exchange(
        "/blackstore-integration/v1/catalog",
        HttpMethod.GET,
        HttpEntity<Void>(clientHeaders()),
        String::class.java,
    )

    private fun reserve(
        operationId: UUID,
        catalogVersion: String,
        variantId: Long,
        priceVersion: String,
        quantity: Int = 1,
    ) = http.exchange(
        "/blackstore-integration/v1/reservations",
        HttpMethod.POST,
        HttpEntity(
            """{"catalogVersion":"$catalogVersion","priceVersion":"$priceVersion","lines":[{"variantId":$variantId,"sku":"SKU-HTTP-1","quantity":$quantity,"priceVersion":"$priceVersion"}]}""",
            sagaHeaders(operationId),
        ),
        String::class.java,
    )

    private fun operation(operationId: UUID) = http.exchange(
        "/blackstore-integration/v1/operations/$operationId",
        HttpMethod.GET,
        HttpEntity<Void>(sagaHeaders(operationId)),
        String::class.java,
    )

    private fun mutate(action: String, operationId: UUID, reservationRef: String) = http.exchange(
        "/blackstore-integration/v1/reservations/$reservationRef/$action",
        HttpMethod.POST,
        HttpEntity("{}", sagaHeaders(operationId)),
        String::class.java,
    )

    private fun clientHeaders() = HttpHeaders().apply {
        contentType = MediaType.APPLICATION_JSON
        set("X-Client-Instance-Id", client.toString())
    }

    private fun sagaHeaders(operationId: UUID) = clientHeaders().apply {
        set("X-Device-Id", "pos-http-1")
        set("X-Sale-Id", "sale-$operationId")
        set("X-Operation-Id", operationId.toString())
    }

    private fun assertSuccessEnvelope(response: ResponseEntity<String>) {
        val node = mapper.readTree(response.body)
        assertEquals(200, node.path("code").asInt(), response.body)
        assertFalse(node.path("data").isMissingNode || node.path("data").isNull, response.body)
        assertTrue(node.path("errorCode").isMissingNode || node.path("errorCode").isNull, response.body)
        assertTrue(node.path("retryable").isMissingNode || node.path("retryable").isNull, response.body)
        assertTrue(node.path("message").isMissingNode || node.path("message").isNull, response.body)
        assertFalse(node.path("traceId").asText().isBlank(), response.body)
    }

    private fun assertEnvelope(response: ResponseEntity<String>, status: Int, errorCode: String, retryable: Boolean) {
        assertEquals(status, response.statusCode.value(), response.body)
        val node = mapper.readTree(response.body)
        assertEquals(status, node.path("code").asInt(), response.body)
        assertTrue(node.path("data").isMissingNode || node.path("data").isNull, response.body)
        assertEquals(errorCode, node.path("errorCode").asText(), response.body)
        assertEquals(retryable, node.path("retryable").asBoolean(), response.body)
        assertFalse(node.path("message").isMissingNode || node.path("message").asText().isBlank(), response.body)
        assertFalse(node.path("traceId").asText().isBlank(), response.body)
    }

    private fun activate(state: CapabilityState, reason: String) {
        val adminId = jdbc.queryForObject(
            "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('bs-http@example.com', '\$argon2id\$fixture', 'Bs', 'Http') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id",
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

    private fun seedCatalog() {
        jdbc.update("INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Test', 'localhost', 'ARS') ON CONFLICT DO NOTHING")
        jdbc.update("INSERT INTO blackstore_companions(client_instance_id, status) VALUES (?, 'DISABLED') ON CONFLICT (client_instance_id) DO NOTHING", client)
        if (jdbc.queryForObject("SELECT COUNT(*) FROM brands WHERE slug='http-brand'", Int::class.java) == 0) {
            jdbc.update("INSERT INTO brands(name, slug) VALUES ('Http', 'http-brand')")
            jdbc.update("INSERT INTO categories(name, slug) VALUES ('HttpCat', 'http-cat')")
        }
        if (jdbc.queryForObject("SELECT COUNT(*) FROM product_variants WHERE sku='SKU-HTTP-1'", Int::class.java) == 0) {
            val productId = jdbc.queryForObject(
                "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, 'Http', 'http-sku', 10, 'ACTIVE') RETURNING id",
                Long::class.java,
            )!!
            val variant = jdbc.queryForObject(
                "INSERT INTO product_variants(product_id, sku, label) VALUES (?, 'SKU-HTTP-1', 'Default') RETURNING id",
                Long::class.java,
                productId,
            )!!
            jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?, 8, 2)", variant)
        }
        if (jdbc.queryForObject("SELECT COUNT(*) FROM channel_listings WHERE external_listing_id='ML-HTTP-1'", Int::class.java) == 0) {
            val accountId = jdbc.queryForObject(
                """
                INSERT INTO channel_accounts(account_key, channel, oauth_secret_reference, state)
                VALUES ('ml-http-fixture', 'MERCADO_LIBRE', 'opaque-ref-test', 'ACTIVE')
                ON CONFLICT (account_key) DO UPDATE SET account_key = EXCLUDED.account_key
                RETURNING id
                """.trimIndent(),
                Long::class.java,
            )!!
            jdbc.update(
                """
                INSERT INTO channel_listings(account_id, external_listing_id, variant_id, desired_quantity, state)
                VALUES (?, 'ML-HTTP-1', ?, 0, 'ACTIVE')
                """.trimIndent(),
                accountId,
                variantId(),
            )
        }
    }

    private fun variantId() =
        jdbc.queryForObject("SELECT id FROM product_variants WHERE sku='SKU-HTTP-1'", Long::class.java)!!

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
