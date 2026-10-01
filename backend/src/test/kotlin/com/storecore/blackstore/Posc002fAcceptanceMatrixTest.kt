package com.storecore.blackstore

import com.storecore.blackstore.application.BlackStoreCapabilityDisabled
import com.storecore.blackstore.application.BlackStoreForbidden
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionBridgePort
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionResult
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.blackstore.domain.CompanionServiceRole
import com.storecore.blackstore.domain.VerifiedCompanionPrincipal
import com.storecore.blackstore.infrastructure.JdbcPosCompanionGuard
import com.storecore.catalog.infrastructure.JdbcPriceQuoteAdapter
import com.storecore.configuration.domain.CapabilityState
import org.flywaydb.core.Flyway
import org.flywaydb.core.api.MigrationVersion
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
import java.sql.DriverManager
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Posc002fAcceptanceMatrixTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var engine: JdbcBlackStoreSagaEngine
    private lateinit var catalog: JdbcBlackStoreCatalogQuery
    private lateinit var principal: VerifiedCompanionPrincipal
    private val client = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    @BeforeAll
    fun start() {
        postgres.start()
        Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        val dataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        jdbc = JdbcTemplate(dataSource)
        val quotes = JdbcPriceQuoteAdapter(jdbc)
        engine = JdbcBlackStoreSagaEngine(
            jdbc,
            DataSourceTransactionManager(dataSource),
            LegacyBlackStoreProjectionBridgePort { _, _ -> LegacyBlackStoreProjectionResult.NOT_ELIGIBLE },
            JdbcPosCompanionGuard(jdbc),
            quotes,
        )
        catalog = JdbcBlackStoreCatalogQuery(jdbc, quotes)
        jdbc.update("INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Test', 'localhost', 'ARS') ON CONFLICT DO NOTHING")
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('F', 'f-brand')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('FCat', 'f-cat')")
        seedCompanionAndActivate()
    }

    @Test
    fun v1ThroughV12ChecksumsAndUpgradeKeepBlackStoreDisabled() {
        val expected = mapOf(
            "V3__capability_administration.sql" to "0D2CEBE1FBA3D43C1C33E2EA216B5D931EA57D510B967D7C471BBB8B87A65DC8",
            "V4__mp_orders_checkout.sql" to "EB677AE41202961AA1527B4AD0539A344A2620E75079241AEE9BA356209A4C5F",
            "V5__blackstore_integration_registry.sql" to "B27C38CCDB6BAAAAB689197A948C96567BB20CC8BFE7E363DD51FF3ADE34220A",
            "V6__blackstore_integration_saga.sql" to "BC06A1F0C1CDB51A6737E972C2FDC0777C9206F624EF73D70C2F0B8CADD9EB6D",
            "V7__blackstore_future_optional_promotion.sql" to "6444ADB440C4B7DC8536F4BA9856AC9C041742CA67EFB91C03EC6409B5398A0C",
            "V8__posc002_shared_capability_cutover.sql" to "359CE72F8A7E8041D65DCC545440ADDE4F2F43D72160C922CD88E40110249E2C",
            "V9__posc002c_companion_admin.sql" to "23615A62517151177ADE5C8E62644EA6540C30CC6D32ADD0A29E95AB8E378F3A",
            "V11__posc003a_catalog_revision.sql" to "39CAEFFD984446407687A2A351A93EB892179DE39C022ABB74DE1302F7287DC1",
            "V12__posc003c_catalog_cursor_snapshot.sql" to "1352667604EFF8279C0759AA02C9A6119C7B7D446A18CE0DC6FC86AF1A60B0A5",
            "V13__posc003e_request_hash_algorithm.sql" to "AA96A42978F81D5F2AAE910C18083C262DE9F5B635BBBF922C35F83BD725ED23",
            "V14__posc004a_worker_purge.sql" to "E8BE7219CC922B8E16C4F76447356161BC3EC1B3CC692A71E5A888E38EFD7647",
        )
        expected.forEach { (script, hash) ->
            assertEquals(hash, lfNormalizedSha256(Files.readAllBytes(Path.of("src/main/resources/db/migration", script))), script)
        }
        val upgraded = "posc002f_" + UUID.randomUUID().toString().replace("-", "")
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.createStatement().use { it.execute("CREATE DATABASE \"$upgraded\"") }
        }
        val url = postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/" + upgraded
        Flyway.configure().dataSource(url, postgres.username, postgres.password).locations("classpath:db/migration").target(MigrationVersion.fromVersion("7")).load().migrate()
        val before = JdbcTemplate(DriverManagerDataSource(url, postgres.username, postgres.password))
        before.update("INSERT INTO brands(name,slug) VALUES ('Upgrade','upgrade-f')")
        Flyway.configure().dataSource(url, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        val after = JdbcTemplate(DriverManagerDataSource(url, postgres.username, postgres.password))
        assertEquals("DISABLED", after.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        assertEquals(listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"), after.queryForList("SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank", String::class.java))
        assertEquals(1, after.queryForObject("SELECT COUNT(*) FROM brands WHERE slug='upgrade-f'", Int::class.java))
        val slices = Files.readString(Path.of("../sdd/wip/20260927-pos-integration-convergence/3-tasks/posc002-implementation-slices.md"))
        assertTrue(slices.contains("ML RR admin-wins se registra como gate separado NO-GO"), slices)
    }

    @Test
    fun revokeBetweenTxAAndTxBLeavesPendingWithoutReserve() {
        val seeded = seedVariant("SKU-REV-${UUID.randomUUID()}")
        val q = BlackStoreQuadruple(client, "POS-1", "sale-${UUID.randomUUID()}", UUID.randomUUID())
        val pending = engine.claimPending(principal, q, seeded.catalogVersion, seeded.line(1))
        assertEquals("PENDING", pending.state)
        jdbc.update("UPDATE blackstore_companions SET status='REVOKED', revoked_at=clock_timestamp() WHERE client_instance_id=?", client)
        assertThrows(BlackStoreForbidden::class.java) {
            engine.finishReserve(principal, q, seeded.catalogVersion, seeded.line(1))
        }
        assertEquals("PENDING", jdbc.queryForObject("SELECT state FROM blackstore_integration_operations WHERE operation_id=?", String::class.java, q.operationId))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_reservations", Int::class.java))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE channel='EXTERNAL_BLACKSTORE' AND variant_id=?", Int::class.java, seeded.variantId))
        assertEquals(4, sellable(seeded.variantId))
        jdbc.update("UPDATE blackstore_companions SET status='ACTIVE', revoked_at=NULL WHERE client_instance_id=?", client)
    }

    @Test
    fun killSwitchDeniesReserveWithoutClaimOrLedger() {
        val seeded = seedVariant("SKU-KILL-${UUID.randomUUID()}")
        val adminId = jdbc.queryForObject("SELECT id FROM users WHERE email='f-admin@example.com'", Long::class.java)!!
        jdbc.query(
            "SELECT capability_admin_create_kill_switch(?,?,?,?,?,?,?,?)",
            { _, _ -> },
            adminId,
            "BLACKSTORE_INTEGRATION",
            "STOCK_RESERVE",
            "qa",
            "posc002f kill reserve",
            java.sql.Timestamp.from(java.time.Instant.now().plusSeconds(3600)),
            "T-002F",
            UUID.randomUUID(),
        )
        val beforeOps = jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operations", Int::class.java)!!
        val beforeLedger = jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE channel='EXTERNAL_BLACKSTORE'", Int::class.java)!!
        assertThrows(BlackStoreCapabilityDisabled::class.java) {
            engine.reserve(principal, BlackStoreQuadruple(client, "POS-1", "sale-${UUID.randomUUID()}", UUID.randomUUID()), seeded.catalogVersion, seeded.line(1))
        }
        assertEquals(beforeOps, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operations", Int::class.java))
        assertEquals(beforeLedger, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE channel='EXTERNAL_BLACKSTORE'", Int::class.java))
        assertEquals(4, sellable(seeded.variantId))
        val killId = jdbc.queryForObject(
            "SELECT id FROM capability_kill_switches WHERE module_code='BLACKSTORE_INTEGRATION' AND action_code='STOCK_RESERVE' AND active ORDER BY id DESC LIMIT 1",
            Long::class.java,
        )!!
        jdbc.query("SELECT capability_admin_remove_kill_switch(?,?,?,?)", { _, _ -> }, adminId, killId, "posc002f remove kill", UUID.randomUUID())
    }

    @Test
    fun killOnCommitAndReleaseLeavesReservedStockUntouched() {
        val seeded = seedVariant("SKU-KCR-${UUID.randomUUID()}")
        val q = BlackStoreQuadruple(client, "POS-1", "sale-${UUID.randomUUID()}", UUID.randomUUID())
        engine.reserve(principal, q, seeded.catalogVersion, seeded.line(1))
        assertEquals(3, sellable(seeded.variantId))
        val killId = createKill("STOCK_COMMIT", "posc002f kill commit")
        try {
            assertThrows(BlackStoreCapabilityDisabled::class.java) { engine.commit(principal, q) }
            assertEquals("RESERVED", engine.get(principal, q).state)
            assertEquals(3, sellable(seeded.variantId))
        } finally {
            removeKill(killId, "posc002f remove commit kill")
        }
        val releaseKill = createKill("STOCK_RELEASE", "posc002f kill release")
        try {
            assertThrows(BlackStoreCapabilityDisabled::class.java) { engine.release(principal, q) }
            assertEquals("RESERVED", engine.get(principal, q).state)
            assertEquals(3, sellable(seeded.variantId))
        } finally {
            removeKill(releaseKill, "posc002f remove release kill")
        }
        assertEquals("COMMITTED", engine.commit(principal, q).state)
        assertEquals(3, sellable(seeded.variantId))
        assertEquals(0, jdbc.queryForObject("SELECT reserved_quantity FROM inventory_balances WHERE variant_id=?", Int::class.java, seeded.variantId))
    }

    @Test
    fun disableBeforeReadGuardDeniesGetAndLeavesNoWrites() {
        val seeded = seedVariant("SKU-RR-${UUID.randomUUID()}")
        val q = BlackStoreQuadruple(client, "POS-1", "sale-${UUID.randomUUID()}", UUID.randomUUID())
        engine.reserve(principal, q, seeded.catalogVersion, seeded.line(1))
        val ledger = jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE channel='EXTERNAL_BLACKSTORE'", Int::class.java)!!
        activate(CapabilityState.DISABLED, "posc002f disable before GET")
        try {
            assertThrows(BlackStoreCapabilityDisabled::class.java) { engine.get(principal, q) }
            assertEquals("RESERVED", jdbc.queryForObject("SELECT state FROM blackstore_integration_operations WHERE operation_id=?", String::class.java, q.operationId))
            assertEquals(ledger, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE channel='EXTERNAL_BLACKSTORE'", Int::class.java))
        } finally {
            activate(CapabilityState.ACTIVE, "posc002f restore after GET deny")
        }
        assertEquals("RESERVED", engine.get(principal, q).state)
    }

    @Test
    fun cursorUpsertAndBalanceInsertPrivilegeHold() {
        seedVariant("SKU-CUR-A-${UUID.randomUUID()}")
        seedVariant("SKU-CUR-B-${UUID.randomUUID()}")
        val first = catalog.readPage(client, cursor = null, pageSize = 1, includeCost = false)
        assertEquals(1, first.items.size)
        assertTrue(first.nextCursor != null)
        val replay = catalog.readPage(client, cursor = null, pageSize = 1, includeCost = false)
        assertEquals(first.nextCursor, replay.nextCursor)
        assertEquals(
            1,
            jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_catalog_cursors WHERE cursor_token=?", Int::class.java, first.nextCursor),
        )
        jdbc.update("UPDATE products SET name = name || 'x', updated_at = now()")
        assertEquals(
            "CURSOR_EXPIRED",
            assertThrows(BlackStoreSagaException::class.java) {
                catalog.readPage(client, cursor = first.nextCursor, pageSize = 1, includeCost = false)
            }.message,
        )
        assertEquals(
            false,
            jdbc.queryForObject("SELECT has_column_privilege('storecore_runtime','public.inventory_balances','variant_id','INSERT')", Boolean::class.java),
            "runtime INSERT(variant_id) remains a recorded 002F residual; grant is not this test-only slice",
        )
        assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','public.blackstore_companions','UPDATE')", Boolean::class.java)!!)
        assertTrue(jdbc.queryForObject("SELECT has_function_privilege('storecore_runtime', p.oid, 'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='pos_companion_effect_guard'", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT rolcanlogin FROM pg_roles WHERE rolname='storecore_pos_guard_owner'", Boolean::class.java)!!)
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind='LISTING_STOCK'", Int::class.java))
    }

    @Test
    fun eightContractRoutesStayPinnedAndCompanionAdminControllerExists() {
        val yaml = Files.readString(Path.of("../sdd/wip/20260921-storecore-pos-integration-contract-v1/2-technical/api/blackstore-integration.openapi.yaml"))
        assertTrue(yaml.contains("/catalog"))
        assertTrue(yaml.contains("/stock/variants/{variantId}"))
        assertTrue(yaml.contains("/reservations"))
        assertTrue(yaml.contains("/reservations/{reservationRef}/commit"))
        assertTrue(yaml.contains("/reservations/{reservationRef}/release"))
        assertTrue(yaml.contains("/operations/{operationId}"))
        assertTrue(yaml.contains("/blackstore-integration/v1/operations/reconcile"))
        assertTrue(Files.isRegularFile(Path.of("src/main/resources/openapi/blackstore-integration.openapi.yaml")))
        val controllers = Files.walk(Path.of("../backend/src/main/kotlin")).use { paths ->
            paths.filter { it.toString().endsWith("Controller.kt") }.map { it.fileName.toString() }.toList()
        }
        assertTrue(controllers.any { it.contains("CompanionAdmin", ignoreCase = true) }, controllers.toString())
        val capability = Files.readString(Path.of("../backend/src/main/kotlin/com/storecore/configuration/infrastructure/JdbcCapabilityService.kt"))
        assertFalse(capability.contains("capability_admin_change_configuration("))
        assertTrue(capability.contains("capability_tx_c_execute("), "002B adapter must call Tx-C")
    }

    private fun createKill(action: String, reason: String): Long {
        val adminId = jdbc.queryForObject("SELECT id FROM users WHERE email='f-admin@example.com'", Long::class.java)!!
        jdbc.query(
            "SELECT capability_admin_create_kill_switch(?,?,?,?,?,?,?,?)",
            { _, _ -> },
            adminId,
            "BLACKSTORE_INTEGRATION",
            action,
            "qa",
            reason,
            java.sql.Timestamp.from(java.time.Instant.now().plusSeconds(3600)),
            "T-002F",
            UUID.randomUUID(),
        )
        return jdbc.queryForObject(
            "SELECT id FROM capability_kill_switches WHERE module_code='BLACKSTORE_INTEGRATION' AND action_code=? AND active ORDER BY id DESC LIMIT 1",
            Long::class.java,
            action,
        )!!
    }

    private fun removeKill(id: Long, reason: String) {
        val adminId = jdbc.queryForObject("SELECT id FROM users WHERE email='f-admin@example.com'", Long::class.java)!!
        jdbc.query("SELECT capability_admin_remove_kill_switch(?,?,?,?)", { _, _ -> }, adminId, id, reason, UUID.randomUUID())
    }

    private fun activate(state: CapabilityState, reason: String) {
        val adminId = jdbc.queryForObject("SELECT id FROM users WHERE email='f-admin@example.com'", Long::class.java)!!
        jdbc.update(
            """UPDATE module_configurations
               SET state=?, config_version=config_version+1, updated_by=?, updated_at=clock_timestamp()
               WHERE module_code='BLACKSTORE_INTEGRATION' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'""",
            state.name,
            adminId,
        )
    }

    private fun seedCompanionAndActivate() {
        val adminId = jdbc.queryForObject(
            "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('f-admin@example.com', '\$argon2id\$fixture', 'F', 'Admin') RETURNING id",
            Long::class.java,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id, role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
        jdbc.update("INSERT INTO blackstore_companions(client_instance_id, status) VALUES (?, 'ACTIVE')", client)
        val companionId = jdbc.queryForObject("SELECT id FROM blackstore_companions WHERE client_instance_id=?", Long::class.java, client)!!
        jdbc.update(
            """
            INSERT INTO blackstore_companion_credentials(
              companion_id, credential_secret_ref, credential_version, status,
              token_fingerprint, scopes, service_role, auth_ready
            ) VALUES (?, 'test-only:f', 1, 'ACTIVE', ?, ?::text[], 'SERVICE', TRUE)
            """.trimIndent(),
            companionId,
            "c".repeat(64),
            "{catalog:read,stock:read,stock:reserve,stock:commit,stock:release}",
        )
        val credentialId = jdbc.queryForObject("SELECT id FROM blackstore_companion_credentials WHERE companion_id=?", Long::class.java, companionId)!!
        principal = VerifiedCompanionPrincipal.of(
            client,
            companionId,
            credentialId,
            1,
            CompanionServiceRole.SERVICE,
            setOf(CompanionScope.CATALOG_READ, CompanionScope.STOCK_READ, CompanionScope.STOCK_RESERVE, CompanionScope.STOCK_COMMIT, CompanionScope.STOCK_RELEASE),
            CompanionLifecycleStatus.ACTIVE,
        )
        activate(CapabilityState.ACTIVE, "posc002f temporary active")
    }

    private fun seedVariant(sku: String): Seeded {
        val productId = jdbc.queryForObject(
            "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, ?, ?, 10, 'ACTIVE') RETURNING id",
            Long::class.java,
            sku,
            sku.lowercase(),
        )!!
        val variantId = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id, sku, label) VALUES (?, ?, 'Default') RETURNING id",
            Long::class.java,
            productId,
            sku,
        )!!
        jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?,?,0)", variantId, 4)
        val priceVersion = JdbcPriceQuoteAdapter(jdbc).quoteByVariantIds(JdbcPriceQuoteAdapter(jdbc).clock(), listOf(variantId)).getValue(variantId).priceVersion.wire
        return Seeded(productId, variantId, sku, catalog.currentCatalogVersion(), priceVersion)
    }

    private fun sellable(variantId: Long): Int =
        jdbc.queryForObject("SELECT GREATEST(0, available_quantity - safety_stock) FROM inventory_balances WHERE variant_id=?", Int::class.java, variantId)!!

    private fun lfNormalizedSha256(bytes: ByteArray): String {
        val normalized = String(bytes, StandardCharsets.UTF_8).replace("\r\n", "\n").replace('\r', '\n')
        return MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02X".format(it) }
    }

    private data class Seeded(val productId: Long, val variantId: Long, val sku: String, val catalogVersion: String, val priceVersion: String) {
        fun line(quantity: Int) = listOf(BlackStoreReserveLine(variantId, sku, quantity, priceVersion))
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @AfterAll
        fun stop() = postgres.stop()
    }
}
