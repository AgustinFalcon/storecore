package com.storecore.blackstore

import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionBridgePort
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionResult
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.blackstore.domain.CompanionServiceRole
import com.storecore.blackstore.domain.VerifiedCompanionPrincipal
import com.storecore.blackstore.infrastructure.JdbcPosCompanionGuard
import com.storecore.catalog.infrastructure.JdbcPriceQuoteAdapter
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
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
class Posc004aWorkerPurgeTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var catalog: JdbcBlackStoreCatalogQuery
    private lateinit var engine: JdbcBlackStoreSagaEngine
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
            LegacyBlackStoreProjectionBridgePort { _, _ -> LegacyBlackStoreProjectionResult.NOT_ELIGIBLE },
            JdbcPosCompanionGuard(jdbc),
            quotes,
        )
        jdbc.update("INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Test', 'localhost', 'ARS') ON CONFLICT DO NOTHING")
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('G', 'g-004a')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('G', 'g-cat')")
        jdbc.update("INSERT INTO blackstore_companions(client_instance_id, status) VALUES (?, 'ACTIVE')", client)
        val companionId = jdbc.queryForObject("SELECT id FROM blackstore_companions WHERE client_instance_id=?", Long::class.java, client)!!
        jdbc.update(
            """
            INSERT INTO blackstore_companion_credentials(
              companion_id, credential_secret_ref, credential_version, status,
              token_fingerprint, scopes, service_role, auth_ready
            ) VALUES (?, 'test-only:004a', 1, 'ACTIVE', ?, ?::text[], 'SERVICE', TRUE)
            """.trimIndent(),
            companionId,
            "a".repeat(64),
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
            "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('g-admin@example.com', '\$argon2id\$fixture', 'G', 'Admin') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id",
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
    fun v14RevokesRuntimeDeleteAndPendingDrainUsesFunction() {
        assertEquals(V14_SHA, lfNormalizedSha256(Files.readAllBytes(Path.of("src/main/resources/db/migration", "V14__posc004a_worker_purge.sql"))))
        assertFalse(jdbc.queryForObject("SELECT rolcanlogin FROM pg_roles WHERE rolname='storecore_blackstore_worker_owner'", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','public.blackstore_integration_operations','DELETE')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','public.blackstore_integration_reservation_lines','DELETE')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','public.blackstore_integration_operation_tombstones','INSERT')", Boolean::class.java)!!)
        assertTrue(jdbc.queryForObject("SELECT has_function_privilege('storecore_runtime', p.oid, 'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='storecore_blackstore_delete_stale_pending'", Boolean::class.java)!!)
        assertTrue(jdbc.queryForObject("SELECT has_function_privilege('storecore_runtime', p.oid, 'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='storecore_blackstore_purge_terminal'", Boolean::class.java)!!)
        val sku = "SKU-004A-${UUID.randomUUID()}".take(24)
        val variantId = seedVariant(sku, 4)
        val quote = JdbcPriceQuoteAdapter(jdbc).quoteByVariantIds(JdbcPriceQuoteAdapter(jdbc).clock(), listOf(variantId)).getValue(variantId)
        val pending = BlackStoreQuadruple(client, "POS-A", "sale-pend", UUID.randomUUID())
        engine.claimPending(principal, pending, catalog.currentCatalogVersion(), listOf(BlackStoreReserveLine(variantId, sku, 1, quote.priceVersion.wire)))
        jdbc.update("UPDATE blackstore_integration_operations SET created_at = now() - interval '61 seconds' WHERE operation_id=?", pending.operationId)
        assertEquals(1, engine.deleteStalePending())
        assertEquals("NOT_FOUND", assertThrows(BlackStoreSagaException::class.java) { engine.get(principal, pending) }.message)
        val q = BlackStoreQuadruple(client, "POS-A", "sale-purge", UUID.randomUUID())
        engine.reserve(principal, q, catalog.currentCatalogVersion(), listOf(BlackStoreReserveLine(variantId, sku, 1, quote.priceVersion.wire)))
        engine.commit(principal, q)
        val ledger = jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE variant_id=?", Int::class.java, variantId)!!
        assertEquals("RETENTION_ACTIVE", assertThrows(BlackStoreSagaException::class.java) { engine.purge(q) }.message)
        jdbc.update("UPDATE blackstore_integration_operations SET updated_at = now() - interval '91 days' WHERE operation_id=?", q.operationId)
        engine.purge(q)
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operations WHERE operation_id=?", Int::class.java, q.operationId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operation_tombstones WHERE operation_id=?", Int::class.java, q.operationId))
        assertEquals(ledger, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE variant_id=?", Int::class.java, variantId))
        assertEquals("OPERATION_RETIRED", assertThrows(BlackStoreSagaException::class.java) { engine.get(principal, q) }.message)
        assertTrue(jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE success", String::class.java).contains("14"))
    }

    companion object {
        const val V14_SHA = "E8BE7219CC922B8E16C4F76447356161BC3EC1B3CC692A71E5A888E38EFD7647"
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @AfterAll
        fun stop() = postgres.stop()
    }

    private fun seedVariant(sku: String, available: Int): Long {
        val slug = "g-${UUID.randomUUID()}"
        val productId = jdbc.queryForObject(
            "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, ?, ?, 10, 'ACTIVE') RETURNING id",
            Long::class.java,
            sku.take(40),
            slug,
        )!!
        val variantId = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id, sku, label) VALUES (?, ?, 'G') RETURNING id",
            Long::class.java,
            productId,
            sku,
        )!!
        jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?,?,0)", variantId, available)
        return variantId
    }

    private fun lfNormalizedSha256(bytes: ByteArray): String {
        val normalized = String(bytes, StandardCharsets.UTF_8).replace("\r\n", "\n").replace('\r', '\n')
        return MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02X".format(it) }
    }
}
