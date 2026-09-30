package com.storecore.blackstore

import com.storecore.blackstore.application.BlackStoreIntegrationService
import com.storecore.blackstore.application.BlackStoreNotModified
import com.storecore.blackstore.application.port.BlackStoreCompanionGuard
import com.storecore.blackstore.application.port.BlackStoreRateLimitPort
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionBridgePort
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionResult
import com.storecore.blackstore.infrastructure.JdbcPosCompanionGuard
import com.storecore.catalog.domain.CatalogCursorFormat
import com.storecore.catalog.infrastructure.JdbcPriceQuoteAdapter
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
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
class Posc003cCursorEtagTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var catalog: JdbcBlackStoreCatalogQuery
    private lateinit var service: BlackStoreIntegrationService
    private val client = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    @BeforeAll
    fun start() {
        postgres.start()
        Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        val dataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        jdbc = JdbcTemplate(dataSource)
        val quotes = JdbcPriceQuoteAdapter(jdbc)
        catalog = JdbcBlackStoreCatalogQuery(jdbc, quotes)
        service = BlackStoreIntegrationService(
            object : CapabilityDecisionPort {
                override fun decide(module: String, action: String, actor: CapabilityActor) = Unit
            },
            object : BlackStoreCompanionGuard {
                override fun assertNoLiveTraffic() = Unit
                override fun assertBound(clientInstanceId: UUID) = Unit
            },
            BlackStoreRateLimitPort { _, _ -> },
            JdbcBlackStoreSagaEngine(
                jdbc,
                DataSourceTransactionManager(dataSource),
                LegacyBlackStoreProjectionBridgePort { _, _ -> LegacyBlackStoreProjectionResult.NOT_ELIGIBLE },
                JdbcPosCompanionGuard(jdbc),
                quotes,
            ),
            catalog,
        )
        jdbc.update("INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Test', 'localhost', 'ARS') ON CONFLICT DO NOTHING")
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('C', 'c-003c')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('C', 'c-cat')")
        jdbc.update("INSERT INTO blackstore_companions(client_instance_id, status) VALUES (?, 'ACTIVE')", client)
        repeat(3) { index ->
            val sku = "SKU-C$index-${UUID.randomUUID()}".take(20)
            val productId = jdbc.queryForObject(
                "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, ?, ?, 10, 'ACTIVE') RETURNING id",
                Long::class.java,
                sku,
                sku.lowercase(),
            )!!
            val variantId = jdbc.queryForObject(
                "INSERT INTO product_variants(product_id, sku, label) VALUES (?, ?, 'D') RETURNING id",
                Long::class.java,
                productId,
                sku,
            )!!
            jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?,?,0)", variantId, 4)
        }
    }

    @Test
    fun v12ChecksumAndCursorFormatAreClosed() {
        assertEquals(V12_SHA, lfNormalizedSha256(Files.readAllBytes(Path.of("src/main/resources/db/migration", "V12__posc003c_catalog_cursor_snapshot.sql"))))
        assertEquals(CatalogCursorFormat.C1, CatalogCursorFormat.fromWire("C1"))
        assertEquals(CatalogCursorFormat.Legacy, CatalogCursorFormat.fromWire("LEGACY"))
        assertEquals(CatalogCursorFormat.Legacy, CatalogCursorFormat.fromWire(null))
        assertTrue(CatalogCursorFormat.fromWire("V6") is CatalogCursorFormat.Unknown)
        assertEquals("UNKNOWN", CatalogCursorFormat.fromWire("V6").label)
        assertTrue(jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE success", String::class.java).contains("12"))
    }

    @Test
    fun opaqueCursorRejectsLegacyAndBadPageSize() {
        val first = catalog.readPage(client, null, 1, false)
        assertTrue(first.nextCursor != null)
        assertTrue(first.etag.startsWith("\"e1_"))
        assertEquals(48, first.etag.length)
        assertEquals(43, first.nextCursor!!.length)
        assertEquals(
            CatalogCursorFormat.C1.wire,
            jdbc.queryForObject("SELECT format_version FROM blackstore_catalog_cursors WHERE cursor_token=?", String::class.java, first.nextCursor),
        )
        assertEquals(
            64,
            jdbc.queryForObject("SELECT char_length(visibility_digest) FROM blackstore_catalog_cursors WHERE cursor_token=?", Int::class.java, first.nextCursor),
        )
        assertEquals("CURSOR_EXPIRED", assertThrows(BlackStoreSagaException::class.java) {
            catalog.readPage(client, "1.${UUID.randomUUID()}", 1, false)
        }.message)
        jdbc.update(
            "UPDATE blackstore_catalog_cursors SET format_version='LEGACY', last_variant_id=NULL WHERE cursor_token=?",
            first.nextCursor,
        )
        assertEquals("CURSOR_EXPIRED", assertThrows(BlackStoreSagaException::class.java) {
            catalog.readPage(client, first.nextCursor, 1, false)
        }.message)
        assertEquals("VALIDATION", assertThrows(BlackStoreSagaException::class.java) {
            service.catalog(client.toString(), null, 0, false)
        }.message)
        assertEquals("VALIDATION", assertThrows(BlackStoreSagaException::class.java) {
            service.catalog(client.toString(), null, 201, false)
        }.message)
        assertEquals("VALIDATION", assertThrows(BlackStoreSagaException::class.java) {
            service.catalog(client.toString(), null, 20, false, "E".repeat(65))
        }.message)
    }

    @Test
    fun stockChangeUpdatesEtagWithoutCatalogVersionAndLiveSnapshotIs304() {
        val before = catalog.readPage(client, null, 200, false)
        val again = catalog.readPage(client, null, 200, false)
        assertEquals(before.etag, again.etag)
        assertEquals(before.generatedAt, again.generatedAt)
        assertEquals(before.nextCursor, again.nextCursor)
        assertEquals("NOT_MODIFIED", assertThrows(BlackStoreNotModified::class.java) {
            service.catalog(client.toString(), null, 200, false, before.etag)
        }.message)
        assertEquals("NOT_MODIFIED", assertThrows(BlackStoreNotModified::class.java) {
            service.catalog(client.toString(), null, 200, false, "*")
        }.message)
        jdbc.update("UPDATE inventory_balances SET available_quantity=available_quantity+1")
        val after = catalog.readPage(client, null, 200, false)
        assertEquals(before.catalogVersion, after.catalogVersion)
        assertNotEquals(before.etag, after.etag)
    }

    companion object {
        const val V12_SHA = "1352667604EFF8279C0759AA02C9A6119C7B7D446A18CE0DC6FC86AF1A60B0A5"
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
