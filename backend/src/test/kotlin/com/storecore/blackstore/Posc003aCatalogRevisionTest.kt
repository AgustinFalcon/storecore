package com.storecore.blackstore

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
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.sql.DriverManager
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Posc003aCatalogRevisionTest {
    private lateinit var jdbc: JdbcTemplate

    @BeforeAll
    fun start() {
        postgres.start()
        Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        jdbc = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
        jdbc.update("INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Test', 'localhost', 'ARS') ON CONFLICT DO NOTHING")
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('A', 'a-brand')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('ACat', 'a-cat')")
        provisionRuntimeLogin()
    }

    @Test
    fun v11ChecksumPinnedAndUpgradeKeepsBlackStoreDisabled() {
        assertEquals(V11_SHA, lfNormalizedSha256(Files.readAllBytes(Path.of("src/main/resources/db/migration", "V11__posc003a_catalog_revision.sql"))))
        val upgraded = "posc003a_" + UUID.randomUUID().toString().replace("-", "")
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.createStatement().use { it.execute("CREATE DATABASE \"$upgraded\"") }
        }
        val url = postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/" + upgraded
        Flyway.configure().dataSource(url, postgres.username, postgres.password).locations("classpath:db/migration").target(MigrationVersion.fromVersion("10")).load().migrate()
        val before = JdbcTemplate(DriverManagerDataSource(url, postgres.username, postgres.password))
        before.update("INSERT INTO brands(name,slug) VALUES ('Upgrade','upgrade-003a')")
        Flyway.configure().dataSource(url, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        val after = JdbcTemplate(DriverManagerDataSource(url, postgres.username, postgres.password))
        assertEquals("DISABLED", after.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        assertTrue(after.queryForList("SELECT version FROM flyway_schema_history WHERE success", String::class.java).contains("11"))
        assertEquals(1, after.queryForObject("SELECT COUNT(*) FROM blackstore_catalog_revision WHERE id=1 AND revision=1", Int::class.java))
        assertEquals(1, after.queryForObject("SELECT COUNT(*) FROM brands WHERE slug='upgrade-003a'", Int::class.java))
    }

    @Test
    fun staticWritersBumpRevisionAndStockDoesNot() {
        val start = revision()
        val productId = jdbc.queryForObject(
            "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, 'P', ?, 10, 'ACTIVE') RETURNING id",
            Long::class.java,
            "p-${UUID.randomUUID()}",
        )!!
        assertEquals(start + 1, revision())
        val variantId = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id, sku, label) VALUES (?, ?, 'Default') RETURNING id",
            Long::class.java,
            productId,
            "SKU-${UUID.randomUUID()}",
        )!!
        assertEquals(start + 2, revision())
        jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?,?,0)", variantId, 4)
        assertEquals(start + 2, revision())
        jdbc.update("UPDATE inventory_balances SET available_quantity=3 WHERE variant_id=?", variantId)
        assertEquals(start + 2, revision())
    }

    @Test
    fun rollbackDoesNotLeaveSpuriousRevision() {
        val start = revision()
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.autoCommit = false
            connection.createStatement().use { statement ->
                statement.execute("INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, 'R', 'r-${UUID.randomUUID()}', 10, 'ACTIVE')")
            }
            val mid = connection.prepareStatement("SELECT revision FROM blackstore_catalog_revision WHERE id=1").use { ps ->
                ps.executeQuery().use { rs ->
                    assertTrue(rs.next())
                    rs.getLong(1)
                }
            }
            assertEquals(start + 1, mid)
            connection.rollback()
        }
        assertEquals(start, revision())
    }

    @Test
    fun runtimeSelectsRevisionButCannotMutateOrInsertAuditDirectly() {
        val runtime = runtimeJdbc()
        assertTrue(runtime.queryForObject("SELECT blackstore_catalog_revision_share()", Long::class.java)!! > 0)
        assertEquals(revision(), runtime.queryForObject("SELECT revision FROM blackstore_catalog_revision WHERE id=1", Long::class.java))
        assertThrows(Exception::class.java) {
            runtime.update("UPDATE blackstore_catalog_revision SET revision=revision+1 WHERE id=1")
        }
        assertThrows(Exception::class.java) {
            runtime.update("INSERT INTO audit_events(actor_type,event_type,aggregate_type,payload_redacted) VALUES ('SYSTEM','TEST','ACL','{}'::jsonb)")
        }
        val eventId = runtime.queryForObject(
            "SELECT storecore_blackstore_audit_override(?,?,?,?,?,?,?,?::jsonb)",
            Long::class.java,
            "BLACKSTORE_CATALOG_SKU_EXCLUDED",
            "SYSTEM",
            null,
            "CATALOG_REVISION",
            revision(),
            UUID.randomUUID(),
            "SKU_LENGTH",
            """{"skuLength":65,"count":1}""",
        )
        assertTrue(eventId!! > 0)
        assertEquals(
            1,
            jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE id=? AND event_type='BLACKSTORE_CATALOG_SKU_EXCLUDED'", Int::class.java, eventId),
        )
        assertThrows(Exception::class.java) {
            runtime.queryForObject(
                "SELECT storecore_blackstore_audit_override(?,?,?,?,?,?,?,?::jsonb)",
                Long::class.java,
                "OTHER_EVENT",
                "SYSTEM",
                null,
                "CATALOG_REVISION",
                1L,
                UUID.randomUUID(),
                "NOPE",
                "{}",
            )
        }
        assertThrows(Exception::class.java) {
            runtime.queryForObject(
                "SELECT storecore_blackstore_audit_override(?,?,?,?,?,?,?,?::jsonb)",
                Long::class.java,
                "BLACKSTORE_PRICE_OVERRIDE",
                "SERVICE",
                "companion-1",
                "RESERVATION",
                1L,
                UUID.randomUUID(),
                "DENIED",
                """{"bearer":"x"}""",
            )
        }
    }

    @Test
    fun shareThenBalanceUpdateDoesNotInvertAgainstWriter() {
        val productId = jdbc.queryForObject(
            "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, 'L', ?, 10, 'ACTIVE') RETURNING id",
            Long::class.java,
            "l-${UUID.randomUUID()}",
        )!!
        val variantId = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id, sku, label) VALUES (?, ?, 'Default') RETURNING id",
            Long::class.java,
            productId,
            "SKU-L-${UUID.randomUUID()}",
        )!!
        jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?,?,0)", variantId, 4)
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { reader ->
            reader.autoCommit = false
            reader.createStatement().use { it.execute("SELECT id FROM blackstore_catalog_revision WHERE id=1 FOR SHARE") }
            val writer = Thread {
                jdbc.update("UPDATE products SET name='L2' WHERE id=?", productId)
            }
            writer.start()
            Thread.sleep(200)
            reader.createStatement().use { it.execute("UPDATE inventory_balances SET available_quantity=3 WHERE variant_id=$variantId") }
            reader.commit()
            writer.join(5_000)
            assertFalse(writer.isAlive)
        }
    }

    private fun revision(): Long =
        jdbc.queryForObject("SELECT revision FROM blackstore_catalog_revision WHERE id=1", Long::class.java)!!

    private fun runtimeJdbc(): JdbcTemplate =
        JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, RUNTIME_LOGIN, RUNTIME_PASSWORD))

    private fun provisionRuntimeLogin() {
        jdbc.execute(
            """
            DO ${'$'}${'$'}
            BEGIN
              CREATE ROLE $RUNTIME_LOGIN LOGIN PASSWORD '$RUNTIME_PASSWORD';
            EXCEPTION WHEN duplicate_object THEN
              NULL;
            END
            ${'$'}${'$'};
            """.trimIndent(),
        )
        jdbc.execute("GRANT storecore_runtime TO $RUNTIME_LOGIN")
        jdbc.execute("GRANT CONNECT ON DATABASE ${postgres.databaseName} TO $RUNTIME_LOGIN")
        jdbc.execute("GRANT USAGE ON SCHEMA public TO $RUNTIME_LOGIN")
    }

    private fun lfNormalizedSha256(bytes: ByteArray): String {
        val normalized = String(bytes, StandardCharsets.UTF_8).replace("\r\n", "\n").replace('\r', '\n')
        return MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02X".format(it) }
    }

    companion object {
        private const val RUNTIME_LOGIN = "storecore_003a_runtime"
        private const val RUNTIME_PASSWORD = "runtime-003a-test"
        const val V11_SHA = "39CAEFFD984446407687A2A351A93EB892179DE39C022ABB74DE1302F7287DC1"

        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @AfterAll
        fun stop() = postgres.stop()
    }
}
