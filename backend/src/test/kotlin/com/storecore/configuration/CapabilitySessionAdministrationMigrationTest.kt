package com.storecore.configuration

import org.flywaydb.core.Flyway
import org.flywaydb.core.api.FlywayException
import org.flywaydb.core.api.MigrationVersion
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.SingleConnectionDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.DriverManager
import java.util.UUID

class CapabilitySessionAdministrationMigrationTest {
    @Test
    fun `fresh V10 exposes only four hardened session entrypoints`() {
        val database = createDatabase()
        migrateTo(database, "10")
        val jdbc = jdbc(database)

        assertEquals(0, jdbc.queryForObject(legacyRuntimeExecuteCount, Int::class.java))
        assertEquals(4, jdbc.queryForObject(sessionEntrypointCount, Int::class.java))
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT count(*) FROM flyway_schema_history WHERE version='10' AND success",
                Int::class.java,
            ),
        )
    }

    @Test
    fun `V9 to V10 requires a current USER admin session and retires actor-only runtime calls`() {
        val database = createDatabase()
        migrateTo(database, "9")
        val jdbc = jdbc(database)
        val adminId = createUser(jdbc, "v10-admin@example.com", admin = true)
        val liveSession = createUserSession(jdbc, adminId)
        migrateTo(database, "10")

        withRuntime(database) { runtime ->
            val initialVersion = version(jdbc)
            runtime.query(
                sessionChangeSql,
                { _, _ -> },
                adminId, liveSession, "CATALOG", initialVersion, "ACTIVE", "{}", UUID.randomUUID(), "v10 live session",
            )
            assertEquals(initialVersion + 1, version(jdbc))

            assertThrows(DataAccessException::class.java) {
                runtime.query(
                    legacyChangeSql,
                    { _, _ -> },
                    adminId, "CATALOG", initialVersion + 1, "READ_ONLY", "{}", UUID.randomUUID(), "legacy denied",
                )
            }

            val stableVersion = version(jdbc)
            val auditsBefore = auditCount(jdbc)
            val missing = UUID.randomUUID()
            val revoked = createUserSession(jdbc, adminId)
            jdbc.update(
                """UPDATE identity_sessions
                      SET revoked_at=clock_timestamp(),revocation_kind='SELF',revoked_by_user_id=?,
                          revocation_correlation_id=?,revoked_reason='test revoked'
                    WHERE id=?""",
                adminId, UUID.randomUUID(), revoked,
            )
            val expired = createExpiredUserSession(jdbc, adminId)
            val nonAdminId = createUser(jdbc, "v10-non-admin@example.com", admin = false)
            val nonAdminSession = createUserSession(jdbc, nonAdminId)
            val customerSession = createCustomerSession(jdbc)

            listOf(
                adminId to missing,
                adminId to revoked,
                adminId to expired,
                nonAdminId to nonAdminSession,
                adminId to customerSession,
            ).forEach { (actorId, sessionId) ->
                assertThrows(DataAccessException::class.java) {
                    runtime.query(
                        sessionChangeSql,
                        { _, _ -> },
                        actorId, sessionId, "CATALOG", stableVersion, "READ_ONLY", "{}", UUID.randomUUID(), "must fail closed",
                    )
                }
            }
            assertEquals(stableVersion, version(jdbc))
            assertEquals(auditsBefore, auditCount(jdbc))
        }
    }

    @Test
    fun `SET-reachable legacy grant aborts V10 transactionally`() {
        val database = createDatabase()
        migrateTo(database, "9")
        val jdbc = jdbc(database)
        jdbc.execute("CREATE ROLE v10_legacy_parent")
        jdbc.execute("REVOKE ALL ON FUNCTION public.capability_admin_remove_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,UUID) FROM PUBLIC, storecore_runtime")
        jdbc.execute("GRANT EXECUTE ON FUNCTION public.capability_admin_remove_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,UUID) TO v10_legacy_parent")
        jdbc.execute("GRANT v10_legacy_parent TO storecore_runtime WITH INHERIT FALSE, SET TRUE")
        assertFalse(
            jdbc.queryForObject(
                "SELECT has_function_privilege('storecore_runtime', 'public.capability_admin_remove_kill_switch(bigint,character varying,bigint,character varying,uuid)', 'EXECUTE')",
                Boolean::class.java,
            )!!,
        )

        val error = assertThrows(FlywayException::class.java) { migrateTo(database, "10") }
        check(generateSequence<Throwable>(error) { it.cause }.any { it.message?.contains("CAPABILITY_SESSION_BOUND_ACL_POSTCONDITION_FAILED") == true })
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE version='10' AND success", Int::class.java))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM pg_proc WHERE proname LIKE 'capability_session_%'", Int::class.java))
    }

    private fun createUser(jdbc: JdbcTemplate, email: String, admin: Boolean): Long {
        val id = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?, '\$argon2id\$fixture', 'V10','User') RETURNING id",
            Long::class.java,
            email,
        )!!
        if (admin) jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='ADMIN'", id)
        return id
    }

    private fun createUserSession(jdbc: JdbcTemplate, userId: Long): UUID = UUID.randomUUID().also { id ->
        jdbc.update(
            """INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,idle_expires_at,absolute_expires_at)
               VALUES(?,'USER',?,repeat(replace(?::text,'-',''),2),clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '12 hours')""",
            id, userId, id,
        )
    }

    private fun createExpiredUserSession(jdbc: JdbcTemplate, userId: Long): UUID = UUID.randomUUID().also { id ->
        jdbc.update(
            """INSERT INTO identity_sessions(
                 id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at
               ) VALUES(
                 ?,'USER',?,repeat(replace(?::text,'-',''),2),clock_timestamp()-interval '2 hours',
                 clock_timestamp()-interval '90 minutes',clock_timestamp()-interval '60 minutes',clock_timestamp()+interval '1 hour'
               )""",
            id, userId, id,
        )
    }

    private fun createCustomerSession(jdbc: JdbcTemplate): UUID {
        val customerId = jdbc.queryForObject(
            "INSERT INTO customers(email,password_hash,first_name,last_name) VALUES('v10-customer@example.com', '\$argon2id\$fixture', 'V10','Customer') RETURNING id",
            Long::class.java,
        )!!
        return UUID.randomUUID().also { id ->
            jdbc.update(
                """INSERT INTO identity_sessions(id,subject_kind,customer_id,token_hash,idle_expires_at,absolute_expires_at)
                   VALUES(?,'CUSTOMER',?,repeat(replace(?::text,'-',''),2),clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '12 hours')""",
                id, customerId, id,
            )
        }
    }

    private fun withRuntime(database: String, block: (JdbcTemplate) -> Unit) {
        DriverManager.getConnection(databaseUrl(database), postgres.username, postgres.password).use { connection ->
            connection.createStatement().use { it.execute("SET ROLE storecore_runtime") }
            block(JdbcTemplate(SingleConnectionDataSource(connection, true)))
        }
    }

    private fun version(jdbc: JdbcTemplate) = jdbc.queryForObject(
        "SELECT config_version FROM module_configurations WHERE module_code='CATALOG'",
        Int::class.java,
    )!!

    private fun auditCount(jdbc: JdbcTemplate) = jdbc.queryForObject(
        "SELECT count(*) FROM capability_configuration_audit_events",
        Int::class.java,
    )!!

    private fun migrateTo(database: String, target: String) {
        Flyway.configure()
            .dataSource(databaseUrl(database), postgres.username, postgres.password)
            .locations("classpath:db/migration")
            .target(MigrationVersion.fromVersion(target))
            .load()
            .migrate()
    }

    private fun createDatabase(): String {
        val name = "cap_v10_" + UUID.randomUUID().toString().replace("-", "")
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.createStatement().use { it.execute("CREATE DATABASE \"$name\"") }
        }
        return name
    }

    private fun jdbc(database: String) = JdbcTemplate(DriverManagerDataSource(databaseUrl(database), postgres.username, postgres.password))

    private fun databaseUrl(database: String) = postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/" + database

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        private const val sessionChangeSql =
            "SELECT capability_session_change_configuration(?::bigint,?::uuid,?::varchar,?::integer,?::varchar,?::jsonb,?::uuid,?::varchar)"
        private const val legacyChangeSql =
            "SELECT capability_admin_change_configuration(?::bigint,?::varchar,?::integer,?::varchar,?::jsonb,?::uuid,?::varchar)"
        private val legacyRuntimeExecuteCount = """
            SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname LIKE 'capability_admin_%'
              AND has_function_privilege('storecore_runtime',p.oid,'EXECUTE')
        """.trimIndent()
        private val sessionEntrypointCount = """
            SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname LIKE 'capability_session_%'
              AND has_function_privilege('storecore_runtime',p.oid,'EXECUTE')
              AND p.prosecdef
              AND p.proconfig @> ARRAY['search_path=pg_catalog, public, pg_temp']
              AND pg_get_userbyid(p.proowner)='storecore_migrator'
        """.trimIndent()

        @JvmStatic
        @BeforeAll
        fun startPostgres16() = postgres.start()

        @JvmStatic
        @AfterAll
        fun stopPostgres16() = postgres.stop()
    }
}
