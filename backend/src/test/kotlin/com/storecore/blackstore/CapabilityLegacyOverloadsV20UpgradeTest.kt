package com.storecore.blackstore

import org.flywaydb.core.Flyway
import org.flywaydb.core.api.FlywayException
import org.flywaydb.core.api.MigrationVersion
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.postgresql.util.PSQLException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.DriverManager
import java.util.UUID

class CapabilityLegacyOverloadsV20UpgradeTest {
    @Test
    fun v19OverloadsWithDirectGrantsAreRetiredByV20() {
        val database = createDatabase()
        migrateTo(database, "19")
        val jdbc = jdbc(database)
        installModuleBoundOverloads(jdbc)
        jdbc.execute("GRANT EXECUTE ON FUNCTION public.capability_admin_remove_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,UUID) TO PUBLIC, storecore_runtime")
        jdbc.execute("GRANT EXECUTE ON FUNCTION public.capability_admin_replace_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) TO PUBLIC, storecore_runtime")
        jdbc.execute("CREATE ROLE v20_runtime_login LOGIN PASSWORD 'v20-runtime' IN ROLE storecore_runtime")

        migrateTo(database, "20")

        val signatures = moduleBoundSignatures()
        signatures.forEach { signature ->
            assertFalse(jdbc.queryForObject("SELECT has_function_privilege('public', ?, 'EXECUTE')", Boolean::class.java, signature)!!)
            assertFalse(jdbc.queryForObject("SELECT has_function_privilege('storecore_runtime', ?, 'EXECUTE')", Boolean::class.java, signature)!!)
        }
        DriverManager.getConnection(databaseUrl(database), "v20_runtime_login", "v20-runtime").use { connection ->
            val error = assertThrows(PSQLException::class.java) {
                connection.createStatement().use {
                    it.execute("SELECT public.capability_admin_remove_kill_switch(1,'BLACKSTORE_INTEGRATION',1,'test',gen_random_uuid())")
                }
            }
            assertEquals("42501", error.sqlState)
        }
    }

    @Test
    fun inheritedLegacyGrantMakesV20FailClosed() {
        val database = createDatabase()
        migrateTo(database, "19")
        val jdbc = jdbc(database)
        installModuleBoundOverloads(jdbc)
        jdbc.execute("CREATE ROLE v20_legacy_parent")
        jdbc.execute("GRANT EXECUTE ON FUNCTION public.capability_admin_remove_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,UUID) TO v20_legacy_parent")
        jdbc.execute("GRANT v20_legacy_parent TO storecore_runtime")

        assertThrows(FlywayException::class.java) { migrateTo(database, "20") }
        assertFalse(jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE success", String::class.java).contains("20"))
    }

    private fun installModuleBoundOverloads(jdbc: JdbcTemplate) {
        jdbc.execute(
            """
            CREATE FUNCTION public.capability_admin_remove_kill_switch(
              p_actor BIGINT, p_module VARCHAR, p_expected_active_id BIGINT, p_reason VARCHAR, p_correlation UUID
            ) RETURNS VOID LANGUAGE plpgsql AS 'BEGIN RETURN; END'
            """.trimIndent(),
        )
        jdbc.execute(
            """
            CREATE FUNCTION public.capability_admin_replace_kill_switch(
              p_actor BIGINT, p_module VARCHAR, p_expected_active_id BIGINT, p_owner VARCHAR,
              p_reason VARCHAR, p_expires TIMESTAMPTZ, p_ticket VARCHAR, p_correlation UUID
            ) RETURNS BIGINT LANGUAGE sql AS 'SELECT 1::BIGINT'
            """.trimIndent(),
        )
        jdbc.execute("ALTER FUNCTION public.capability_admin_remove_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,UUID) OWNER TO storecore_migrator")
        jdbc.execute("ALTER FUNCTION public.capability_admin_replace_kill_switch(BIGINT,VARCHAR,BIGINT,VARCHAR,VARCHAR,TIMESTAMPTZ,VARCHAR,UUID) OWNER TO storecore_migrator")
    }

    private fun moduleBoundSignatures() = listOf(
        "public.capability_admin_remove_kill_switch(bigint,character varying,bigint,character varying,uuid)",
        "public.capability_admin_replace_kill_switch(bigint,character varying,bigint,character varying,character varying,timestamp with time zone,character varying,uuid)",
    )

    private fun migrateTo(name: String, target: String) {
        Flyway.configure()
            .dataSource(databaseUrl(name), postgres.username, postgres.password)
            .locations("classpath:db/migration")
            .target(MigrationVersion.fromVersion(target))
            .load()
            .migrate()
    }

    private fun createDatabase(): String {
        val name = "cap_v20_" + UUID.randomUUID().toString().replace("-", "")
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.createStatement().use { it.execute("CREATE DATABASE \"$name\"") }
        }
        return name
    }

    private fun jdbc(name: String) = JdbcTemplate(DriverManagerDataSource(databaseUrl(name), postgres.username, postgres.password))

    private fun databaseUrl(name: String) = postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/" + name

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @BeforeAll
        fun startPostgres16() = postgres.start()

        @JvmStatic
        @AfterAll
        fun stopPostgres16() = postgres.stop()
    }
}
