package com.storecore.blackstore

import com.storecore.blackstore.application.BlackStoreForbidden
import com.storecore.blackstore.application.BlackStoreIntegrationService
import com.storecore.blackstore.application.dto.BlackStoreReservationLineRequest
import com.storecore.blackstore.application.dto.BlackStoreReservationRequest
import com.storecore.blackstore.application.port.BlackStoreCompanionGuard
import com.storecore.blackstore.application.port.BlackStoreRateLimitPort
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionBridgePort
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionResult
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.blackstore.domain.CompanionServiceRole
import com.storecore.blackstore.domain.RequestHashAlgorithm
import com.storecore.blackstore.domain.VerifiedCompanionPrincipal
import com.storecore.blackstore.infrastructure.JdbcPosCompanionGuard
import com.storecore.catalog.infrastructure.JdbcPriceQuoteAdapter
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Posc003eReserveH2Test {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var catalog: JdbcBlackStoreCatalogQuery
    private lateinit var engine: JdbcBlackStoreSagaEngine
    private lateinit var service: BlackStoreIntegrationService
    private lateinit var principal: VerifiedCompanionPrincipal
    private val client = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    @BeforeAll
    fun start() {
        postgres.start()
        Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        val dataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        jdbc = JdbcTemplate(dataSource)
        val quotes = JdbcPriceQuoteAdapter(jdbc)
        catalog = JdbcBlackStoreCatalogQuery(jdbc, quotes)
        engine = JdbcBlackStoreSagaEngine(
            jdbc,
            DataSourceTransactionManager(dataSource),
            LegacyBlackStoreProjectionBridgePort { LegacyBlackStoreProjectionResult.NOT_ELIGIBLE },
            JdbcPosCompanionGuard(jdbc),
            quotes,
        )
        service = BlackStoreIntegrationService(
            object : CapabilityDecisionPort {
                override fun decide(module: String, action: String, actor: CapabilityActor) = Unit
            },
            object : BlackStoreCompanionGuard {
                override fun assertNoLiveTraffic() = Unit
                override fun assertBound(clientInstanceId: UUID) = Unit
            },
            BlackStoreRateLimitPort { _, _ -> },
            engine,
            catalog,
        )
        jdbc.update("INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Test', 'localhost', 'ARS') ON CONFLICT DO NOTHING")
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('E', 'e-003e')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('E', 'e-cat')")
        jdbc.update("INSERT INTO blackstore_companions(client_instance_id, status) VALUES (?, 'ACTIVE')", client)
        val companionId = jdbc.queryForObject("SELECT id FROM blackstore_companions WHERE client_instance_id=?", Long::class.java, client)!!
        jdbc.update(
            """
            INSERT INTO blackstore_companion_credentials(
              companion_id, credential_secret_ref, credential_version, status,
              token_fingerprint, scopes, service_role, auth_ready
            ) VALUES (?, 'test-only:003e', 1, 'ACTIVE', ?, ?::text[], 'SERVICE', TRUE)
            """.trimIndent(),
            companionId,
            "e".repeat(64),
            "{catalog:read,stock:read,stock:reserve,stock:commit,stock:release}",
        )
        val credentialId = jdbc.queryForObject(
            "SELECT id FROM blackstore_companion_credentials WHERE companion_id=? AND credential_version=1",
            Long::class.java,
            companionId,
        )!!
        principal = VerifiedCompanionPrincipal.of(
            client,
            companionId,
            credentialId,
            1,
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
        val adminId = jdbc.queryForObject(
            "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('e-admin@example.com', '\$argon2id\$fixture', 'E', 'Admin') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id",
            Long::class.java,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id, role_id) SELECT ?, id FROM roles WHERE code='ADMIN' ON CONFLICT DO NOTHING", adminId)
        jdbc.update(
            """UPDATE module_configurations
               SET state='ACTIVE', config_version=config_version+1, updated_by=?, updated_at=clock_timestamp()
               WHERE module_code='BLACKSTORE_INTEGRATION' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'""",
            adminId,
        )
    }

    @Test
    fun v13AndNewReservePersistH2() {
        assertEquals(V13_SHA, lfNormalizedSha256(Files.readAllBytes(Path.of("src/main/resources/db/migration", "V13__posc003e_request_hash_algorithm.sql"))))
        assertEquals(RequestHashAlgorithm.H1, RequestHashAlgorithm.fromWire("H1"))
        assertEquals(RequestHashAlgorithm.H2, RequestHashAlgorithm.fromWire("H2"))
        assertTrue(RequestHashAlgorithm.fromWire("H0") is RequestHashAlgorithm.Unknown)
        val sku = "SKU-H2-${UUID.randomUUID()}".take(24)
        val variantId = seedVariant(sku, 5)
        val quote = JdbcPriceQuoteAdapter(jdbc).quoteByVariantIds(JdbcPriceQuoteAdapter(jdbc).clock(), listOf(variantId)).getValue(variantId)
        val q = BlackStoreQuadruple(client, "POS-E", "sale-${UUID.randomUUID()}", UUID.randomUUID())
        val reserved = engine.reserve(principal, q, catalog.currentCatalogVersion(), listOf(BlackStoreReserveLine(variantId, sku, 1, quote.priceVersion.wire)))
        assertEquals("RESERVED", reserved.state)
        assertEquals(
            RequestHashAlgorithm.H2.wire,
            jdbc.queryForObject("SELECT request_hash_algorithm FROM blackstore_integration_operations WHERE operation_id=?", String::class.java, q.operationId),
        )
        assertTrue(jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE success", String::class.java).contains("13"))
    }

    @Test
    fun yamlTaxonomyRejectsEmptyPriceDuplicateAndLongSku() {
        val sku = "SKU-VAL-${UUID.randomUUID()}".take(24)
        val variantId = seedVariant(sku, 4)
        val quote = JdbcPriceQuoteAdapter(jdbc).quoteByVariantIds(JdbcPriceQuoteAdapter(jdbc).clock(), listOf(variantId)).getValue(variantId)
        assertEquals("VALIDATION", assertThrows(BlackStoreSagaException::class.java) {
            service.reserve(
                principal,
                client.toString(),
                "POS-E",
                "sale-empty",
                UUID.randomUUID().toString(),
                BlackStoreReservationRequest(catalog.currentCatalogVersion(), "", listOf(BlackStoreReservationLineRequest(variantId, sku, 1, null))),
            )
        }.message)
        assertEquals("VALIDATION", assertThrows(BlackStoreSagaException::class.java) {
            engine.reserve(principal, BlackStoreQuadruple(client, "POS-E", "sale-dup", UUID.randomUUID()), catalog.currentCatalogVersion(), listOf(
                BlackStoreReserveLine(variantId, sku, 1, quote.priceVersion.wire),
                BlackStoreReserveLine(variantId, sku, 1, quote.priceVersion.wire),
            ))
        }.message)
        val longSku = "L".repeat(65)
        val longId = seedVariant(longSku, 3)
        val longQuote = JdbcPriceQuoteAdapter(jdbc).quoteByVariantIds(JdbcPriceQuoteAdapter(jdbc).clock(), listOf(longId)).getValue(longId)
        assertEquals("VALIDATION", assertThrows(BlackStoreSagaException::class.java) {
            engine.reserve(principal, BlackStoreQuadruple(client, "POS-E", "sale-long", UUID.randomUUID()), catalog.currentCatalogVersion(), listOf(BlackStoreReserveLine(longId, longSku, 1, longQuote.priceVersion.wire)))
        }.message)
        assertEquals("CATALOG_VERSION_STALE", assertThrows(BlackStoreSagaException::class.java) {
            engine.reserve(principal, BlackStoreQuadruple(client, "POS-E", "sale-stale", UUID.randomUUID()), "c1_" + "A".repeat(43), listOf(BlackStoreReserveLine(variantId, sku, 1, quote.priceVersion.wire)))
        }.message)
        val deniedOp = UUID.randomUUID()
        assertThrows(BlackStoreForbidden::class.java) {
            engine.reserve(
                principal,
                BlackStoreQuadruple(client, "POS-E", "sale-ov", deniedOp),
                "c1_" + "B".repeat(43),
                listOf(BlackStoreReserveLine(variantId, sku, 1, quote.priceVersion.wire)),
                PriceOverrideAttempt("need override now", "SUPERVISOR"),
            )
        }
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM audit_events WHERE event_type='BLACKSTORE_PRICE_OVERRIDE' AND reason_code='SCOPE_DENIED' AND correlation_id=?",
                Int::class.java,
                deniedOp,
            ),
        )
        assertEquals(
            "PENDING",
            jdbc.queryForObject("SELECT state FROM blackstore_integration_operations WHERE operation_id=?", String::class.java, deniedOp),
        )
        val badReasonOp = UUID.randomUUID()
        assertEquals("VALIDATION", assertThrows(BlackStoreSagaException::class.java) {
            engine.reserve(
                principal,
                BlackStoreQuadruple(client, "POS-E", "sale-reason", badReasonOp),
                "c1_" + "C".repeat(43),
                listOf(BlackStoreReserveLine(variantId, sku, 1, quote.priceVersion.wire)),
                PriceOverrideAttempt("no", "SUPERVISOR"),
            )
        }.message)
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM audit_events WHERE event_type='BLACKSTORE_PRICE_OVERRIDE' AND reason_code='REASON_INVALID' AND correlation_id=?",
                Int::class.java,
                badReasonOp,
            ),
        )
        assertEquals(
            0,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM blackstore_integration_operations WHERE operation_id=?",
                Int::class.java,
                badReasonOp,
            ),
        )
    }

    @Test
    fun catalogStaleWithLivePricesRequiresOverride() {
        val sku = "SKU-STALE-${UUID.randomUUID()}".take(24)
        val variantId = seedVariant(sku, 6)
        val page = catalog.readPage(client, null, 200, false)
        val item = page.items.single { it.variantId == variantId }
        jdbc.update("UPDATE products SET name = name || 'x' WHERE id=(SELECT product_id FROM product_variants WHERE id=?)", variantId)
        assertEquals("CATALOG_VERSION_STALE", assertThrows(BlackStoreSagaException::class.java) {
            engine.reserve(
                principal,
                BlackStoreQuadruple(client, "POS-E", "sale-stale-live", UUID.randomUUID()),
                page.catalogVersion,
                listOf(BlackStoreReserveLine(variantId, sku, 1, item.priceVersion)),
            )
        }.message)
    }

    @Test
    fun allowedOverrideUsesIssuedCatalogAndPersistsAudit() {
        val sku = "SKU-ALW-${UUID.randomUUID()}".take(24)
        val variantId = seedVariant(sku, 6)
        val page = catalog.readPage(client, null, 200, false)
        val item = page.items.single { it.variantId == variantId }
        jdbc.update("UPDATE products SET name = name || 'x' WHERE id=(SELECT product_id FROM product_variants WHERE id=?)", variantId)
        val withOverride = VerifiedCompanionPrincipal.of(
            client,
            principal.companionId,
            principal.credentialId,
            principal.credentialVersion,
            CompanionServiceRole.SERVICE,
            principal.scopes + CompanionScope.PRICE_OVERRIDE,
            CompanionLifecycleStatus.ACTIVE,
        )
        try {
            jdbc.update(
                "UPDATE blackstore_companion_credentials SET scopes = array_append(scopes, 'price:override') WHERE token_fingerprint=?",
                "e".repeat(64),
            )
            val q = BlackStoreQuadruple(client, "POS-E", "sale-allow", UUID.randomUUID())
            val reserved = engine.reserve(
                withOverride,
                q,
                page.catalogVersion,
                listOf(BlackStoreReserveLine(variantId, sku, 1, item.priceVersion)),
                PriceOverrideAttempt("supervisor matches issued quote", "SUPERVISOR"),
            )
            assertEquals("RESERVED", reserved.state)
            assertEquals(
                1,
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM audit_events WHERE event_type='BLACKSTORE_PRICE_OVERRIDE' AND reason_code='OVERRIDE_ACCEPTED' AND correlation_id=?",
                    Int::class.java,
                    q.operationId,
                ),
            )
            val payload = jdbc.queryForObject(
                "SELECT payload_redacted::text FROM audit_events WHERE correlation_id=? AND reason_code='OVERRIDE_ACCEPTED'",
                String::class.java,
                q.operationId,
            )!!
            assertTrue(payload.contains("SUPERVISOR"), payload)
            assertTrue(payload.contains(page.catalogVersion), payload)
            assertTrue(payload.contains("supervisor matches issued quote"), payload)
            val unissuedOp = UUID.randomUUID()
            assertEquals("CATALOG_VERSION_STALE", assertThrows(BlackStoreSagaException::class.java) {
                engine.reserve(
                    withOverride,
                    BlackStoreQuadruple(client, "POS-E", "sale-unissued", unissuedOp),
                    "c1_" + "D".repeat(43),
                    listOf(BlackStoreReserveLine(variantId, sku, 1, item.priceVersion)),
                    PriceOverrideAttempt("override without issued catalog", "OWNER"),
                )
            }.message)
            assertEquals(
                1,
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM audit_events WHERE event_type='BLACKSTORE_PRICE_OVERRIDE' AND reason_code='CATALOG_NOT_ISSUED' AND correlation_id=?",
                    Int::class.java,
                    unissuedOp,
                ),
            )
            assertEquals(
                0,
                jdbc.queryForObject(
                    "SELECT COUNT(*) FROM blackstore_integration_operations WHERE operation_id=?",
                    Int::class.java,
                    unissuedOp,
                ),
            )
        } finally {
            jdbc.update(
                "UPDATE blackstore_companion_credentials SET scopes = ?::text[] WHERE token_fingerprint=?",
                "{catalog:read,stock:read,stock:reserve,stock:commit,stock:release}",
                "e".repeat(64),
            )
        }
    }

    private fun seedVariant(sku: String, available: Int): Long {
        val slug = "e-${UUID.randomUUID()}"
        val productId = jdbc.queryForObject(
            "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, ?, ?, 10, 'ACTIVE') RETURNING id",
            Long::class.java,
            sku.take(40),
            slug,
        )!!
        val variantId = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id, sku, label) VALUES (?, ?, 'E') RETURNING id",
            Long::class.java,
            productId,
            sku,
        )!!
        jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?,?,0)", variantId, available)
        return variantId
    }

    companion object {
        const val V13_SHA = "AA96A42978F81D5F2AAE910C18083C262DE9F5B635BBBF922C35F83BD725ED23"
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @AfterAll
        fun stop() = postgres.stop()
    }

    private fun lfNormalizedSha256(bytes: ByteArray): String {
        val normalized = String(bytes, StandardCharsets.UTF_8).replace("\r\n", "\n").replace('\r', '\n')
        return MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02X".format(it) }
    }
}
