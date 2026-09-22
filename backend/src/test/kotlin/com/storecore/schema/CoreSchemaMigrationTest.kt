package com.storecore.schema

import com.storecore.platform.infrastructure.installation.InstallationPresenceGuard
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.postgresql.util.PSQLException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.DriverManager

class CoreSchemaMigrationTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @BeforeAll
        fun migrateApprovedBaseline() {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        }

        @JvmStatic
        @AfterAll
        fun stopContainer() = postgres.stop()
    }

    @BeforeEach
    fun resetInstallationFixture() {
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement.executeUpdate("DELETE FROM installation_settings")
                statement.executeUpdate("INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('schema-fixture@example.com', '\$argon2id\$fixture', 'Schema', 'Fixture') ON CONFLICT (email) DO NOTHING")
                statement.executeUpdate(
                    """UPDATE module_configurations
                       SET state = 'DISABLED', config_version = config_version + 1, updated_by = (SELECT id FROM users WHERE email='schema-fixture@example.com')
                       WHERE module_code = 'CATALOG' AND state <> 'DISABLED'""",
                )
            }
        }
    }

    @Test
    fun `migration installs core tables and enforces single installation identity`() {
        connection().use { connection ->
            assertEquals(1, scalar(connection, "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'inventory_ledger'"))
            connection.createStatement().use { it.executeUpdate("INSERT INTO installation_settings(installation_id, business_name, allowed_host) VALUES (1, 'Demo', 'demo.local')") }
            assertThrows(PSQLException::class.java) { connection.createStatement().use { it.executeUpdate("INSERT INTO installation_settings(installation_id, business_name, allowed_host) VALUES (2, 'Other', 'other.local')") } }
        }
    }

    @Test
    fun `startup guard fails closed until the sole installation is provisioned`() {
        val guard = InstallationPresenceGuard(JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)))
        val exception = assertThrows(IllegalStateException::class.java) { guard.verifyInstallationIsProvisioned() }
        assertEquals("INSTALLATION_NOT_PROVISIONED", exception.message)
        connection().use { it.createStatement().use { statement -> statement.executeUpdate("INSERT INTO installation_settings(installation_id, business_name, allowed_host) VALUES (1, 'Demo', 'demo.local')") } }
        assertDoesNotThrow { guard.verifyInstallationIsProvisioned() }
    }

    @Test
    fun `future optional module remains disabled while core modules can change state`() {
        connection().use { connection ->
            assertThrows(PSQLException::class.java) { connection.createStatement().use { it.executeUpdate("UPDATE module_configurations SET state = 'ACTIVE' WHERE module_code = 'FAVORITES'") } }
            connection.createStatement().use {
                it.executeUpdate("INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('schema-fixture@example.com', '\$argon2id\$fixture', 'Schema', 'Fixture') ON CONFLICT (email) DO NOTHING")
                assertEquals(
                    1,
                    it.executeUpdate(
                        """UPDATE module_configurations
                           SET state = 'ACTIVE', config_version = config_version + 1, updated_by = (SELECT id FROM users WHERE email='schema-fixture@example.com')
                           WHERE module_code = 'CATALOG'""",
                    ),
                )
            }
        }
    }

    @Test
    fun `checkout claim and order preserve a customer scoped composite identity`() {
        connection().use { connection ->
            assertTrue(scalar(connection, "SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_name = 'orders' AND constraint_type = 'FOREIGN KEY'") >= 2)
            assertEquals(1, scalar(connection, "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'checkout_idempotency_claims' AND column_name = 'checkout_snapshot'"))
        }
    }

    @Test
    fun `immutable facts reject mutation and order evidence cannot change`() {
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement.executeUpdate("INSERT INTO payment_event_inbox(provider_event_id, resource_reference, envelope_redacted) VALUES ('event-1', 'payment/1', '{}')")
                assertThrows(PSQLException::class.java) { statement.executeUpdate("UPDATE payment_event_inbox SET resource_reference = 'payment/2' WHERE provider_event_id = 'event-1'") }
                assertThrows(PSQLException::class.java) { statement.executeUpdate("DELETE FROM payment_event_inbox WHERE provider_event_id = 'event-1'") }
                statement.executeUpdate("INSERT INTO customers(email, password_hash, first_name, last_name) VALUES ('customer@example.com', '\$argon2id\$test', 'Customer', 'One')")
                statement.executeUpdate("INSERT INTO checkout_idempotency_claims(customer_id, checkout_idempotency_key, request_hash, checkout_snapshot) VALUES (1, '11111111-1111-1111-1111-111111111111', repeat('a', 64), '{}')")
                assertEquals(1, statement.executeUpdate("UPDATE checkout_idempotency_claims SET state = 'COMPLETED' WHERE id = 1"))
                assertThrows(PSQLException::class.java) { statement.executeUpdate("UPDATE checkout_idempotency_claims SET checkout_snapshot = '{\"tampered\":true}' WHERE id = 1") }
                statement.executeUpdate("INSERT INTO brands(name, slug) VALUES ('Brand', 'brand')")
                statement.executeUpdate("INSERT INTO categories(name, slug) VALUES ('Category', 'category')")
                statement.executeUpdate("INSERT INTO products(brand_id, category_id, name, slug, base_price) VALUES (1, 1, 'Product', 'product', 1)")
                statement.executeUpdate("INSERT INTO product_variants(product_id, sku, label) VALUES (1, 'SKU-1', 'Default')")
                statement.executeUpdate("INSERT INTO orders(order_number, checkout_claim_id, checkout_idempotency_key, checkout_request_hash, customer_id, buyer_snapshot, checkout_snapshot, subtotal, shipping_cost, total) VALUES ('ORDER-1', 1, '11111111-1111-1111-1111-111111111111', repeat('a', 64), 1, '{}', '{}', 0, 0, 0)")
                statement.executeUpdate("INSERT INTO order_items(order_id, variant_id, product_snapshot, quantity, original_unit_price, discount_amount, effective_unit_price, subtotal) VALUES (1, 1, '{}', 1, 1, 0, 1, 1)")
                assertThrows(PSQLException::class.java) { statement.executeUpdate("UPDATE order_items SET discount_amount = 1 WHERE order_id = 1") }
                assertEquals(1, statement.executeUpdate("UPDATE orders SET status = 'PENDING_PAYMENT' WHERE order_number = 'ORDER-1'"))
                assertThrows(PSQLException::class.java) { statement.executeUpdate("UPDATE orders SET buyer_snapshot = '{\"tampered\":true}' WHERE order_number = 'ORDER-1'") }
            }
        }
    }

    @Test
    fun `grouped nullable checks preserve mandatory channel and return predicates`() {
        connection().use { connection ->
            val definitions = connection.createStatement().use { statement ->
                statement.executeQuery("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid IN ('returns'::regclass, 'channel_listings'::regclass, 'channel_price_policies'::regclass) AND contype = 'c'").use { resultSet ->
                    buildList { while (resultSet.next()) add(resultSet.getString(1)) }
                }
            }
            assertTrue(definitions.any { it.contains("inspection_result IS NULL") && it.contains("OR") }, definitions.joinToString("\n"))
            assertTrue(definitions.any { it.contains("observed_quantity IS NULL") && it.contains("OR") }, definitions.joinToString("\n"))
            assertTrue(definitions.any { it.contains("observed_price IS NULL") && it.contains("effective_promo_price IS NULL") && it.contains("OR") }, definitions.joinToString("\n"))
        }
    }

    @Test
    fun `identity V2 keeps argon constraint names`() {
        connection().use { connection ->
            val names = connection.createStatement().use { statement ->
                statement.executeQuery("SELECT conname FROM pg_constraint WHERE conrelid IN ('users'::regclass,'customers'::regclass) AND contype='c'").use { resultSet ->
                    buildList { while (resultSet.next()) add(resultSet.getString(1)) }
                }
            }
            assertTrue(names.contains("ck_users_email_canonical"))
            assertTrue(names.contains("ck_customers_email_canonical"))
        }
    }

    @Test
    fun `identity V2 protects session csrf and bootstrap evidence`() {
        connection().use { connection ->
            connection.createStatement().use { statement ->
                assertThrows(PSQLException::class.java) {
                    statement.executeUpdate("INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('bad@example.com', '\$2legacy', 'Bad', 'Hash')")
                }
                statement.executeUpdate("INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('admin@example.com', '\$argon2id\$fixture', 'Admin', 'One')")
                statement.executeUpdate("INSERT INTO identity_sessions(id, subject_kind, user_id, token_hash, idle_expires_at, absolute_expires_at) VALUES ('00000000-0000-0000-0000-000000000101', 'USER', (SELECT id FROM users WHERE email='admin@example.com'), repeat('1', 64), clock_timestamp() + interval '30 minutes', clock_timestamp() + interval '12 hours')")
                statement.executeUpdate("INSERT INTO identity_session_csrf_tokens(session_id, token_hash, generation, expires_at) VALUES ('00000000-0000-0000-0000-000000000101', repeat('2', 64), 1, clock_timestamp() + interval '30 minutes')")
                assertEquals(1, statement.executeUpdate("UPDATE identity_session_csrf_tokens SET retired_at=clock_timestamp() WHERE session_id='00000000-0000-0000-0000-000000000101'"))
                assertThrows(PSQLException::class.java) {
                    statement.executeUpdate("UPDATE identity_session_csrf_tokens SET retired_at=clock_timestamp() WHERE session_id='00000000-0000-0000-0000-000000000101'")
                }
                assertThrows(PSQLException::class.java) {
                    statement.executeUpdate("DELETE FROM identity_session_csrf_tokens WHERE session_id='00000000-0000-0000-0000-000000000101'")
                }
                assertEquals(1, statement.executeUpdate("UPDATE identity_sessions SET revoked_at=clock_timestamp(), revocation_kind='SYSTEM', revocation_correlation_id='00000000-0000-0000-0000-000000000102', revoked_reason='session-expired' WHERE id='00000000-0000-0000-0000-000000000101'"))
                assertThrows(PSQLException::class.java) {
                    statement.executeUpdate("UPDATE identity_sessions SET last_seen_at=clock_timestamp() WHERE id='00000000-0000-0000-0000-000000000101'")
                }
                statement.executeUpdate("INSERT INTO installation_bootstrap_markers(installation_id, bootstrap_admin_user_id) VALUES (1, (SELECT id FROM users WHERE email='admin@example.com'))")
                assertThrows(PSQLException::class.java) {
                    statement.executeUpdate("DELETE FROM installation_bootstrap_markers WHERE installation_id=1")
                }
            }
        }
    }
    private fun connection() = DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password)
    private fun scalar(connection: java.sql.Connection, sql: String): Int = connection.createStatement().use { statement -> statement.executeQuery(sql).use { resultSet -> check(resultSet.next()); resultSet.getInt(1) } }
}