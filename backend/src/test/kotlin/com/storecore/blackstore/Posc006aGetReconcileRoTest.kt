package com.storecore.blackstore

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.blackstore.domain.CompanionServiceRole
import com.storecore.blackstore.domain.VerifiedCompanionPrincipal
import com.storecore.blackstore.infrastructure.BlackStoreExpiryWorker
import com.storecore.blackstore.infrastructure.InMemoryCompanionSecretProvider
import com.storecore.configuration.domain.CapabilityState
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Posc006aGetReconcileRoTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val mapper: ObjectMapper,
    @Autowired private val secrets: InMemoryCompanionSecretProvider,
    @Autowired private val engine: JdbcBlackStoreSagaEngine,
    @Autowired private val worker: BlackStoreExpiryWorker,
) {
    private val client = UUID.fromString("66666666-6666-6666-6666-666666666666")
    private lateinit var bearer: String
    private lateinit var principal: VerifiedCompanionPrincipal

    @BeforeAll
    fun seedAndActivate() {
        jdbc.update("INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Test', 'localhost', 'ARS') ON CONFLICT DO NOTHING")
        bearer = CompanionAuthTestSupport.seedReadyCompanion(jdbc, secrets, client)
        principal = loadPrincipal()
        if (jdbc.queryForObject("SELECT COUNT(*) FROM brands WHERE slug='pic006a-brand'", Int::class.java) == 0) {
            jdbc.update("INSERT INTO brands(name, slug) VALUES ('Pic006a', 'pic006a-brand')")
            jdbc.update("INSERT INTO categories(name, slug) VALUES ('Pic006a', 'pic006a-cat')")
        }
        if (jdbc.queryForObject("SELECT COUNT(*) FROM product_variants WHERE sku='SKU-006A-1'", Int::class.java) == 0) {
            val brandId = jdbc.queryForObject("SELECT id FROM brands WHERE slug='pic006a-brand'", Long::class.java)!!
            val categoryId = jdbc.queryForObject("SELECT id FROM categories WHERE slug='pic006a-cat'", Long::class.java)!!
            val productId = jdbc.queryForObject(
                "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (?, ?, 'Pic006a', 'pic006a-sku', 10, 'ACTIVE') RETURNING id",
                Long::class.java,
                brandId,
                categoryId,
            )!!
            val variant = jdbc.queryForObject(
                "INSERT INTO product_variants(product_id, sku, label) VALUES (?, 'SKU-006A-1', 'Default') RETURNING id",
                Long::class.java,
                productId,
            )!!
            jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?, 20, 0)", variant)
        }
        activate(CapabilityState.ACTIVE)
    }

    @AfterAll
    fun restoreDisabled() {
        activate(CapabilityState.DISABLED)
        assertEquals(
            "DISABLED",
            jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java),
        )
    }

    @Test
    fun springWiredGetAndReconcileStayReadOnlyRepeatableRead() {
        val readTx = JdbcBlackStoreSagaEngine::class.java.getDeclaredField("readTx").apply { isAccessible = true }
            .get(engine) as TransactionTemplate
        assertEquals(TransactionDefinition.ISOLATION_REPEATABLE_READ, readTx.isolationLevel)
        assertTrue(readTx.isReadOnly)

        val catalog = catalog()
        assertEquals(200, catalog.statusCode.value(), catalog.body)
        val catalogData = mapper.readTree(catalog.body)["data"]
        val items = catalogData["items"]
        val item = (0 until items.size()).map { items[it] }.first { it["sku"].asText() == "SKU-006A-1" }
        val catalogVersion = catalogData["catalogVersion"].asText()
        val priceVersion = item["priceVersion"].asText()
        val variantId = item["variantId"].asLong()
        val sku = item["sku"].asText()

        val missingId = UUID.randomUUID()
        val beforeMissing = domainSnapshot()
        val missing = operation(missingId)
        assertEnvelope(missing, 404, "NOT_FOUND", retryable = false)
        assertEquals(beforeMissing, domainSnapshot())

        val pendingId = UUID.randomUUID()
        engine.claimPending(
            principal,
            BlackStoreQuadruple(client, "pos-006a", "sale-$pendingId", pendingId),
            catalogVersion,
            listOf(BlackStoreReserveLine(variantId, sku, 1, priceVersion)),
        )
        val beforePending = domainSnapshot()
        val pending = operation(pendingId)
        assertEquals(200, pending.statusCode.value(), pending.body)
        assertSuccessEnvelope(pending)
        assertEquals("PENDING", mapper.readTree(pending.body)["data"]["state"].asText())
        assertEquals(beforePending, domainSnapshot())

        val reservedId = UUID.randomUUID()
        val reserved = reserve(reservedId, catalogVersion, variantId, priceVersion)
        assertEquals(200, reserved.statusCode.value(), reserved.body)
        assertSuccessEnvelope(reserved)
        val reservedData = mapper.readTree(reserved.body)["data"]
        assertEquals("RESERVED", reservedData["state"].asText())
        val receipt = reservedData["receipt"].asText()
        val reservationRef = reservedData["reservationRef"].asText()
        val beforeDurable = domainSnapshot()
        val durable = operation(reservedId)
        assertEquals(200, durable.statusCode.value(), durable.body)
        assertEquals("RESERVED", mapper.readTree(durable.body)["data"]["state"].asText())
        assertEquals(receipt, mapper.readTree(durable.body)["data"]["receipt"].asText())
        assertEquals(beforeDurable, domainSnapshot())

        val balancesTouchedAt = jdbc.queryForObject(
            "SELECT updated_at FROM inventory_balances WHERE variant_id=?",
            java.sql.Timestamp::class.java,
            variantId,
        )!!
        val firstWrite = CountDownLatch(1)
        val writerRunning = AtomicBoolean(true)
        val pool = Executors.newSingleThreadExecutor()
        pool.submit {
            while (writerRunning.get()) {
                jdbc.update(
                    "UPDATE inventory_balances SET available_quantity = available_quantity, updated_at = clock_timestamp() WHERE variant_id=?",
                    variantId,
                )
                firstWrite.countDown()
            }
        }
        assertTrue(firstWrite.await(5, TimeUnit.SECONDS))
        val beforeConcurrent = domainSnapshot(includeBalances = false)
        val concurrentGet = operation(reservedId)
        writerRunning.set(false)
        pool.shutdown()
        assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS))
        assertEquals(200, concurrentGet.statusCode.value(), concurrentGet.body)
        assertEquals("RESERVED", mapper.readTree(concurrentGet.body)["data"]["state"].asText())
        assertEquals(receipt, mapper.readTree(concurrentGet.body)["data"]["receipt"].asText())
        assertEquals(beforeConcurrent, domainSnapshot(includeBalances = false))
        val balancesTouchedAfter = jdbc.queryForObject(
            "SELECT updated_at FROM inventory_balances WHERE variant_id=?",
            java.sql.Timestamp::class.java,
            variantId,
        )!!
        assertFalse(balancesTouchedAfter.before(balancesTouchedAt))

        val empty = reconcile("""{"knownReceipts":[]}""")
        assertEnvelope(empty, 400, "VALIDATION", retryable = false)
        val tooMany = reconcile("""{"knownReceipts":[${List(501) { "\"r-$it\"" }.joinToString(",")}]}""")
        assertEnvelope(tooMany, 400, "VALIDATION", retryable = false)

        val fiveHundredUnknown = List(500) { "unknown-006a-$it" }
        val beforeFiveHundred = domainSnapshot()
        val fiveHundred = reconcile("""{"knownReceipts":[${fiveHundredUnknown.joinToString(",") { "\"$it\"" }}]}""")
        assertEquals(200, fiveHundred.statusCode.value(), fiveHundred.body)
        assertSuccessEnvelope(fiveHundred)
        val fiveHundredData = mapper.readTree(fiveHundred.body)["data"]
        assertEquals(0, fiveHundredData["present"].size())
        assertEquals(500, fiveHundredData["unknownReceipts"].size())
        assertEquals(beforeFiveHundred, domainSnapshot())

        Thread.sleep(1100)
        val beforeDup = domainSnapshot()
        val duplicated = reconcile("""{"knownReceipts":["$receipt","$receipt","unknown-006a-dup"]}""")
        assertEquals(200, duplicated.statusCode.value(), duplicated.body)
        val dupData = mapper.readTree(duplicated.body)["data"]
        assertEquals(1, dupData["present"].size())
        assertEquals("RESERVED", dupData["present"][0]["state"].asText())
        assertEquals(receipt, dupData["present"][0]["receipt"].asText())
        assertEquals(listOf("unknown-006a-dup"), dupData["unknownReceipts"].map { it.asText() })
        assertEquals(beforeDup, domainSnapshot())

        val committed = mutate("commit", reservedId, reservationRef)
        assertEquals(200, committed.statusCode.value(), committed.body)
        jdbc.update("UPDATE blackstore_integration_operations SET updated_at = now() - interval '91 days' WHERE operation_id=?", reservedId)
        assertEquals(1, worker.purgeTerminal())
        val beforeRetired = domainSnapshot()
        val retired = operation(reservedId)
        assertEnvelope(retired, 410, "OPERATION_RETIRED", retryable = false)
        assertEquals(beforeRetired, domainSnapshot())

        val alien = http.exchange(
            "/blackstore-integration/v1/operations/$pendingId",
            HttpMethod.GET,
            HttpEntity<Void>(sagaHeaders(pendingId).apply { set("X-Client-Instance-Id", UUID.randomUUID().toString()) }),
            String::class.java,
        )
        assertEnvelope(alien, 403, "FORBIDDEN", retryable = false)
        assertEquals(beforeRetired, domainSnapshot())

        jdbc.update(
            "UPDATE blackstore_companions SET status='REVOKED', revoked_at=clock_timestamp() WHERE client_instance_id=?",
            client,
        )
        val beforeRevoked = domainSnapshot()
        val revoked = operation(pendingId)
        assertEnvelope(revoked, 401, "UNAUTHORIZED", retryable = false)
        assertEquals(beforeRevoked, domainSnapshot())
        jdbc.update(
            "UPDATE blackstore_companions SET status='ACTIVE', revoked_at=NULL WHERE client_instance_id=?",
            client,
        )
        assertEquals(200, operation(pendingId).statusCode.value())
    }

    private fun domainSnapshot(includeBalances: Boolean = true): String = jdbc.queryForObject(
        """
        SELECT json_build_object(
          'ops', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY id), '[]'::json) FROM blackstore_integration_operations t),
          'lines', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY id), '[]'::json) FROM blackstore_integration_reservation_lines t),
          'tombstones', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY id), '[]'::json) FROM blackstore_integration_operation_tombstones t),
          'reservations', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY id), '[]'::json) FROM inventory_reservations t),
          'ledger', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY id), '[]'::json) FROM inventory_ledger t),
          'balances', CASE WHEN ? THEN (SELECT coalesce(json_agg(row_to_json(t) ORDER BY variant_id), '[]'::json) FROM inventory_balances t) ELSE '[]'::json END,
          'audit', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY id), '[]'::json) FROM audit_events t),
          'channel_outbox', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY id), '[]'::json) FROM channel_outbox t),
          'channel_delivery', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY outbox_id), '[]'::json) FROM channel_outbox_delivery t),
          'mp_outbox', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY id), '[]'::json) FROM mp_order_outbox t),
          'mp_delivery', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY outbox_id), '[]'::json) FROM mp_order_outbox_delivery t),
          'payment_inbox', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY id), '[]'::json) FROM payment_event_inbox t),
          'payment_processing', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY inbox_id), '[]'::json) FROM payment_event_processing t),
          'ml_inbox', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY id), '[]'::json) FROM ml_notification_inbox t),
          'ml_processing', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY inbox_id), '[]'::json) FROM ml_notification_processing t),
          'integration_outbox', (SELECT coalesce(json_agg(row_to_json(t) ORDER BY id), '[]'::json) FROM integration_outbox t)
        )::text
        """.trimIndent(),
        String::class.java,
        includeBalances,
    )!!

    private fun loadPrincipal(): VerifiedCompanionPrincipal {
        val companionId = jdbc.queryForObject("SELECT id FROM blackstore_companions WHERE client_instance_id=?", Long::class.java, client)!!
        val credentialId = jdbc.queryForObject(
            "SELECT id FROM blackstore_companion_credentials WHERE companion_id=? AND status='ACTIVE'",
            Long::class.java,
            companionId,
        )!!
        val version = jdbc.queryForObject(
            "SELECT credential_version FROM blackstore_companion_credentials WHERE id=?",
            Int::class.java,
            credentialId,
        )!!
        return VerifiedCompanionPrincipal.of(
            client,
            companionId,
            credentialId,
            version,
            CompanionServiceRole.SERVICE,
            setOf(
                CompanionScope.CATALOG_READ,
                CompanionScope.STOCK_READ,
                CompanionScope.STOCK_RESERVE,
                CompanionScope.STOCK_COMMIT,
                CompanionScope.STOCK_RELEASE,
            ),
            CompanionLifecycleStatus.ACTIVE,
        )
    }

    private fun catalog() = http.exchange(
        "/blackstore-integration/v1/catalog",
        HttpMethod.GET,
        HttpEntity<Void>(clientHeaders()),
        String::class.java,
    )

    private fun reserve(operationId: UUID, catalogVersion: String, variantId: Long, priceVersion: String) = http.exchange(
        "/blackstore-integration/v1/reservations",
        HttpMethod.POST,
        HttpEntity(
            """{"catalogVersion":"$catalogVersion","priceVersion":"$priceVersion","lines":[{"variantId":$variantId,"sku":"SKU-006A-1","quantity":1,"priceVersion":"$priceVersion"}]}""",
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

    private fun reconcile(body: String) = http.exchange(
        "/blackstore-integration/v1/operations/reconcile",
        HttpMethod.POST,
        HttpEntity(body, clientHeaders()),
        String::class.java,
    )

    private fun clientHeaders() = HttpHeaders().apply {
        contentType = MediaType.APPLICATION_JSON
        set(HttpHeaders.AUTHORIZATION, "Bearer $bearer")
        set("X-Client-Instance-Id", client.toString())
    }

    private fun sagaHeaders(operationId: UUID) = clientHeaders().apply {
        set("X-Device-Id", "pos-006a")
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

    private fun activate(state: CapabilityState) {
        val adminId = jdbc.queryForObject(
            "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('bs-006a@example.com', '\$argon2id\$fixture', 'Bs', 'Pic') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id",
            Long::class.java,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id, role_id) SELECT ?, id FROM roles WHERE code='ADMIN' ON CONFLICT DO NOTHING", adminId)
        jdbc.update(
            """UPDATE module_configurations
               SET state=?, config_version=config_version+1, updated_by=?, updated_at=clock_timestamp()
               WHERE module_code='BLACKSTORE_INTEGRATION' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'""",
            state.name,
            adminId,
        )
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
