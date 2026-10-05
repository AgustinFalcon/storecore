package com.storecore.blackstore

import com.storecore.configuration.application.CapabilityDisabled
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.postgresql.util.PSQLException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.DriverManager
import java.util.UUID

class BlackStoreSchemaMigrationTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @BeforeAll
        fun migrate() {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        }

        @JvmStatic
        @AfterAll
        fun stop() = postgres.stop()
    }

    private val jdbc = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
    private val capabilities = JdbcCapabilityService(jdbc)

    @Test
    fun `blackstore module is future optional disabled schema v2`() {
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        assertEquals(false, jdbc.queryForObject("SELECT future_optional FROM capability_modules WHERE module_code='BLACKSTORE_INTEGRATION'", Boolean::class.java))
        assertEquals(2, jdbc.queryForObject("SELECT config_schema_version FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", Int::class.java))
        assertEquals(9, jdbc.queryForObject("SELECT COUNT(*) FROM capability_actions WHERE module_code='BLACKSTORE_INTEGRATION'", Int::class.java))
        assertThrows(CapabilityDisabled::class.java) {
            capabilities.decide("BLACKSTORE_INTEGRATION", "STOCK_RESERVE", CapabilityActor.System)
        }
        val adminId = jdbc.queryForObject(
            "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('bs-admin@example.com', '\$argon2id\$fixture', 'Bs', 'Admin') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id",
            Long::class.java,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id, role_id) SELECT ?, id FROM roles WHERE code='ADMIN' ON CONFLICT DO NOTHING", adminId)
        val sessionId = UUID.randomUUID()
        jdbc.update(
            """INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,idle_expires_at,absolute_expires_at)
               VALUES(?,'USER',?,repeat(replace(?::text,'-',''),2),clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '12 hours')""",
            sessionId, adminId, sessionId,
        )
        val admin = InternalUserPrincipal(sessionId, adminId, setOf(InternalRole.ADMIN))
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", Int::class.java)!!
        capabilities.changeState(
            admin,
            "BLACKSTORE_INTEGRATION",
            CapabilityState.ACTIVE,
            version,
            "testcontainers temporary active",
            UUID.randomUUID(),
        )
        capabilities.decide("BLACKSTORE_INTEGRATION", "STOCK_RESERVE", CapabilityActor.System)
        val activeVersion = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", Int::class.java)!!
        capabilities.changeState(
            admin,
            "BLACKSTORE_INTEGRATION",
            CapabilityState.DISABLED,
            activeVersion,
            "restore disabled baseline",
            UUID.randomUUID(),
        )
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        assertThrows(CapabilityDisabled::class.java) {
            capabilities.decide("BLACKSTORE_INTEGRATION", "STOCK_RESERVE", CapabilityActor.System)
        }
    }

    @Test
    fun `companion live unique and ledger pairing reject POS sale`() {
        connection().use { connection ->
            connection.createStatement().use { statement ->
                statement.executeUpdate("INSERT INTO blackstore_companions(client_instance_id, status) VALUES ('11111111-1111-1111-1111-111111111111', 'DISABLED')")
                assertThrows(PSQLException::class.java) {
                    statement.executeUpdate("INSERT INTO blackstore_companions(client_instance_id, status) VALUES ('22222222-2222-2222-2222-222222222222', 'ACTIVE')")
                }
                statement.executeUpdate("INSERT INTO brands(name, slug) VALUES ('Bs', 'bs-brand')")
                statement.executeUpdate("INSERT INTO categories(name, slug) VALUES ('BsCat', 'bs-cat')")
                statement.executeUpdate("INSERT INTO products(brand_id, category_id, name, slug, base_price) VALUES (1, 1, 'P', 'bs-p', 1)")
                statement.executeUpdate("INSERT INTO product_variants(product_id, sku, label) VALUES (1, 'BS-SKU', 'Default')")
                statement.executeUpdate("INSERT INTO inventory_balances(variant_id, available_quantity) VALUES (1, 5)")
                assertThrows(PSQLException::class.java) {
                    statement.executeUpdate(
                        "INSERT INTO inventory_ledger(variant_id, event_idempotency_key, event_type, channel, quantity_delta, actor) VALUES (1, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SALE', 'EXTERNAL_BLACKSTORE', -1, 'test')",
                    )
                }
                assertEquals(
                    1,
                    statement.executeUpdate(
                        "INSERT INTO inventory_ledger(variant_id, event_idempotency_key, event_type, channel, quantity_delta, actor) VALUES (1, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'STOCK_COMMIT_EXTERNAL', 'EXTERNAL_BLACKSTORE', -1, 'test')",
                    ),
                )
            }
        }
    }

    @Test
    fun `tombstone retention is at least seven years`() {
        connection().use { connection ->
            connection.createStatement().use { statement ->
                assertThrows(PSQLException::class.java) {
                    statement.executeUpdate(
                        """INSERT INTO blackstore_integration_operation_tombstones(
                             client_instance_id, device_id, sale_id, operation_id, request_hash, final_state, receipt, reservation_ref, retired_at, retention_until
                           ) VALUES (
                             '33333333-3333-3333-3333-333333333333', 'T1', 's1', '44444444-4444-4444-4444-444444444444', repeat('a', 64), 'COMMITTED', 'r1',
                             '55555555-5555-5555-5555-555555555555', now(), now() + interval '1 year'
                           )""",
                    )
                }
                assertTrue(
                    statement.executeUpdate(
                        """INSERT INTO blackstore_integration_operation_tombstones(
                             client_instance_id, device_id, sale_id, operation_id, request_hash, final_state, receipt, reservation_ref, retired_at, retention_until
                           ) VALUES (
                             '33333333-3333-3333-3333-333333333333', 'T1', 's1', '44444444-4444-4444-4444-444444444444', repeat('a', 64), 'COMMITTED', 'r1',
                             '55555555-5555-5555-5555-555555555555', now(), now() + interval '7 years'
                           )""",
                    ) == 1,
                )
            }
        }
    }

    private fun connection() = DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password)
}
