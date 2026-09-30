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
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Posc003dStockReadTest {
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
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('D', 'd-003d')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('D', 'd-cat')")
        jdbc.update("INSERT INTO blackstore_companions(client_instance_id, status) VALUES (?, 'ACTIVE')", client)
        val companionId = jdbc.queryForObject("SELECT id FROM blackstore_companions WHERE client_instance_id=?", Long::class.java, client)!!
        jdbc.update(
            """
            INSERT INTO blackstore_companion_credentials(
              companion_id, credential_secret_ref, credential_version, status,
              token_fingerprint, scopes, service_role, auth_ready
            ) VALUES (?, 'test-only:003d', 1, 'ACTIVE', ?, ?::text[], 'SERVICE', TRUE)
            """.trimIndent(),
            companionId,
            "d".repeat(64),
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
            "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('d-admin@example.com', '\$argon2id\$fixture', 'D', 'Admin') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id",
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
    fun absentAndOverlongSkuAre404() {
        assertEquals("NOT_FOUND", assertThrows(BlackStoreSagaException::class.java) {
            catalog.readStock(client, 9_999_999)
        }.message)
        val sku64 = seedVariant("S".repeat(64), 5, active = true)
        val sku65 = seedVariant("T".repeat(65), 5, active = true)
        val sku128 = seedVariant("U".repeat(128), 5, active = true)
        val stock = catalog.readStock(client, sku64)
        assertEquals(64, stock.sku.length)
        assertEquals(5, stock.availableQuantity)
        assertEquals(catalog.currentCatalogVersion(), stock.catalogVersion)
        assertEquals("NOT_FOUND", assertThrows(BlackStoreSagaException::class.java) {
            catalog.readStock(client, sku65)
        }.message)
        assertEquals("NOT_FOUND", assertThrows(BlackStoreSagaException::class.java) {
            catalog.readStock(client, sku128)
        }.message)
        val page = catalog.readPage(client, null, 200, false)
        assertTrue(page.items.any { it.variantId == sku64 })
        assertFalse(page.items.any { it.variantId == sku65 || it.variantId == sku128 })
    }

    @Test
    fun inactiveIsVisibleInCatalogAndStockReportsPhysicalSellable() {
        val variantId = seedVariant("SKU-INACTIVE-${UUID.randomUUID()}".take(32), available = 7, active = false)
        val page = catalog.readPage(client, null, 200, false)
        val item = page.items.single { it.variantId == variantId }
        assertFalse(item.active)
        assertEquals(7, item.availableQuantity)
        val stock = catalog.readStock(client, variantId)
        assertEquals(7, stock.availableQuantity)
        assertEquals(item.sku, stock.sku)
    }

    @Test
    fun reserveUsesLiveBalanceNotStaleCatalogQuantity() {
        val sku = "SKU-LIVE-${UUID.randomUUID()}".take(24)
        val variantId = seedVariant(sku, available = 4, active = true)
        val page = catalog.readPage(client, null, 200, false)
        assertEquals(4, page.items.single { it.variantId == variantId }.availableQuantity)
        jdbc.update("UPDATE inventory_balances SET available_quantity=1 WHERE variant_id=?", variantId)
        val quote = JdbcPriceQuoteAdapter(jdbc).quoteByVariantIds(JdbcPriceQuoteAdapter(jdbc).clock(), listOf(variantId)).getValue(variantId)
        val q = BlackStoreQuadruple(client, "POS-D", "sale-${UUID.randomUUID()}", UUID.randomUUID())
        assertEquals("INSUFFICIENT_STOCK", assertThrows(BlackStoreSagaException::class.java) {
            engine.reserve(principal, q, catalog.currentCatalogVersion(), listOf(BlackStoreReserveLine(variantId, sku, 3, quote.priceVersion.wire)))
        }.message)
    }

    private fun seedVariant(sku: String, available: Int, active: Boolean): Long {
        val slug = "d-${UUID.randomUUID()}"
        val productId = jdbc.queryForObject(
            "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, ?, ?, 10, 'ACTIVE') RETURNING id",
            Long::class.java,
            sku.take(40),
            slug,
        )!!
        val variantId = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id, sku, label, active) VALUES (?, ?, 'D', ?) RETURNING id",
            Long::class.java,
            productId,
            sku,
            active,
        )!!
        jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?,?,0)", variantId, available)
        return variantId
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @AfterAll
        fun stop() = postgres.stop()
    }
}
