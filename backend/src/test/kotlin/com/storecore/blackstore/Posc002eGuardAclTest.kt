package com.storecore.blackstore

import com.storecore.configuration.CapabilityAdminTestSupport
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
import org.postgresql.util.PSQLException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.sql.Connection
import java.sql.DriverManager
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Posc002eGuardAclTest {
    private lateinit var database: String
    private var companionId = 0L
    private var credentialId = 0L

    @BeforeAll
    fun migrateCleanBootstrap() {
        database = createDatabase()
        migrateTo(database, "10")
        seedCompanion(jdbc(database))
        createLogins(jdbc(database))
    }

    @Test
    fun v1ThroughV9StayIntactAndV10DoesNotEnableBlackStore() {
        val expected = mapOf(
            "V3__capability_administration.sql" to "0D2CEBE1FBA3D43C1C33E2EA216B5D931EA57D510B967D7C471BBB8B87A65DC8",
            "V5__blackstore_integration_registry.sql" to "B27C38CCDB6BAAAAB689197A948C96567BB20CC8BFE7E363DD51FF3ADE34220A",
            "V8__posc002_shared_capability_cutover.sql" to "359CE72F8A7E8041D65DCC545440ADDE4F2F43D72160C922CD88E40110249E2C",
            "V9__posc002c_companion_admin.sql" to "23615A62517151177ADE5C8E62644EA6540C30CC6D32ADD0A29E95AB8E378F3A",
        )
        expected.forEach { (script, hash) ->
            assertEquals(hash, lfNormalizedSha256(Files.readAllBytes(Path.of("src/main/resources/db/migration", script))), script)
        }
        val upgraded = createDatabase()
        migrateTo(upgraded, "9")
        val before = jdbc(upgraded)
        assertEquals("DISABLED", before.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        migrateTo(upgraded, "10")
        val after = jdbc(upgraded)
        assertEquals("DISABLED", after.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        assertEquals(listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "10"), after.queryForList("SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank", String::class.java))
        assertEquals(listOf("1", "2", "3", "4", "5", "6", "7", "8", "9", "10"), jdbc(database).queryForList("SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank", String::class.java))
    }

    @Test
    fun ownerIsNologinAndExecuteIsNarrow() {
        val jdbc = jdbc(database)
        assertTrue(jdbc.queryForObject("SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='storecore_pos_guard_owner'", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT pg_has_role('storecore_pos_guard_owner','storecore_runtime','member')", Boolean::class.java)!!)
        assertTrue(functionExecute("storecore_runtime", "pos_companion_effect_guard"))
        assertTrue(functionExecute("storecore_runtime", "pos_companion_read_guard"))
        assertFalse(functionExecute("storecore_companion_admin", "pos_companion_effect_guard"))
        assertFalse(functionExecute("storecore_capability_admin", "pos_companion_read_guard"))
        assertFalse(functionExecute("public", "pos_companion_effect_guard"))
        assertEquals("storecore_pos_guard_owner", jdbc.queryForObject("SELECT pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='pos_companion_effect_guard'", String::class.java))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'pos_companion_%' AND (proconfig IS NULL OR NOT proconfig::text LIKE '%search_path=pg_catalog, pg_temp%')", Int::class.java))
        assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','public.blackstore_companions','UPDATE')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT has_column_privilege('storecore_runtime','public.module_configurations','state','UPDATE')", Boolean::class.java)!!)
        assertTrue(jdbc.queryForObject("SELECT has_column_privilege('storecore_pos_guard_owner','public.capability_actions','action_code','UPDATE')", Boolean::class.java)!!)
    }

    @Test
    fun runtimeExecutesGuardsAndBlankLoginsStayDenied() {
        asLogin("e10_blank_login", "e10-blank").use { connection ->
            assertSqlState(connection, "42501") {
                callGuard(it, "pos_companion_effect_guard", "STOCK_RESERVE", isolation = "read committed")
            }
        }
        asLogin("e10_admin_login", "e10-admin").use { connection ->
            assertSqlState(connection, "42501") {
                callGuard(it, "pos_companion_effect_guard", "STOCK_RESERVE", isolation = "read committed")
            }
        }
        asLogin("e10_runtime_login", "e10-runtime").use { connection ->
            val isolation = assertThrows(PSQLException::class.java) {
                callGuard(connection, "pos_companion_effect_guard", "STOCK_RESERVE", isolation = "repeatable read")
            }
            assertEquals("25000", isolation.sqlState)
            val readIsolation = assertThrows(PSQLException::class.java) {
                callGuard(connection, "pos_companion_read_guard", "STOCK_READ", isolation = "read committed")
            }
            assertEquals("25000", readIsolation.sqlState)
            val disabled = assertThrows(PSQLException::class.java) {
                callGuard(connection, "pos_companion_effect_guard", "STOCK_RESERVE", isolation = "read committed")
            }
            assertEquals("P0001", disabled.sqlState)
            assertTrue(disabled.message.orEmpty().contains("CAPABILITY_DISABLED"))
        }
        assertEquals("DISABLED", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
    }

    @Test
    fun temporaryActiveAllowsMatchingScopeAndDeniesMissingScopeThenRestoresDisabled() {
        activate(CapabilityState.ACTIVE, "posc002e temporary active")
        try {
            asLogin("e10_runtime_login", "e10-runtime").use { connection ->
                callGuard(connection, "pos_companion_effect_guard", "STOCK_RESERVE", isolation = "read committed")
                callGuard(connection, "pos_companion_read_guard", "STOCK_READ", isolation = "repeatable read")
                val denied = assertThrows(PSQLException::class.java) {
                    callGuard(connection, "pos_companion_effect_guard", "COST_READ", isolation = "read committed")
                }
                assertEquals("42501", denied.sqlState)
            }
        } finally {
            activate(CapabilityState.DISABLED, "posc002e restore disabled")
        }
        assertEquals("DISABLED", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        asLogin("e10_runtime_login", "e10-runtime").use { connection ->
            val disabled = assertThrows(PSQLException::class.java) {
                callGuard(connection, "pos_companion_effect_guard", "STOCK_RESERVE", isolation = "read committed")
            }
            assertEquals("P0001", disabled.sqlState)
        }
    }

    @Test
    fun adminWinsAfterEffectWaitsOnActionAnchor() {
        activate(CapabilityState.ACTIVE, "posc002e admin-wins active")
        val pool = Executors.newSingleThreadExecutor()
        try {
            DriverManager.getConnection(databaseUrl(database), postgres.username, postgres.password).use { holder ->
                holder.autoCommit = false
                holder.createStatement().use { it.execute("SET TRANSACTION ISOLATION LEVEL READ COMMITTED") }
                holder.prepareStatement("SELECT action_code FROM public.capability_actions WHERE module_code='BLACKSTORE_INTEGRATION' ORDER BY action_code FOR UPDATE").use { statement ->
                    statement.executeQuery().close()
                }
                val waiting = pool.submit<String?> {
                    asLogin("e10_runtime_login", "e10-runtime").use { connection ->
                        try {
                            callGuard(connection, "pos_companion_effect_guard", "STOCK_RESERVE", isolation = "read committed")
                            "ok"
                        } catch (error: PSQLException) {
                            error.sqlState
                        }
                    }
                }
                val started = System.nanoTime()
                var sawWait = false
                while (TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started) < 15) {
                    val locks = jdbc(database).queryForList(
                        """
                        SELECT a.wait_event_type AS wait_type, a.wait_event AS wait_event, l.granted AS granted
                        FROM pg_stat_activity a
                        JOIN pg_locks l ON l.pid=a.pid
                        WHERE a.datname=current_database()
                          AND (a.query LIKE '%pos_companion_effect_guard%' OR a.wait_event_type='Lock')
                        """.trimIndent(),
                    )
                    val waiter = locks.firstOrNull { it["wait_event"] == "transactionid" && it["granted"] == false }
                    if (waiter != null) {
                        sawWait = true
                        break
                    }
                    Thread.sleep(50)
                }
                assertTrue(sawWait, "effect guard must wait on the action-row lock held by admin")
                val version = jdbc(database).queryForObject("SELECT config_version FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", Int::class.java)!!
                val adminId = jdbc(database).queryForObject("SELECT id FROM users WHERE email='e10-admin@example.test'", Long::class.java)!!
                holder.prepareStatement("SELECT public.capability_admin_change_configuration(?,?,?,?,?::jsonb,?,?)").use { statement ->
                    statement.setLong(1, adminId)
                    statement.setString(2, "BLACKSTORE_INTEGRATION")
                    statement.setInt(3, version)
                    statement.setString(4, "DISABLED")
                    statement.setString(5, blackstoreConfig())
                    statement.setObject(6, UUID.randomUUID())
                    statement.setString(7, "posc002e admin-wins disable")
                    statement.executeQuery().close()
                }
                holder.commit()
                assertEquals("P0001", waiting.get(20, TimeUnit.SECONDS))
            }
        } finally {
            pool.shutdownNow()
            assertTrue(pool.awaitTermination(20, TimeUnit.SECONDS))
            if (jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java) != "DISABLED") {
                activate(CapabilityState.DISABLED, "posc002e admin-wins restore")
            }
        }
        assertEquals("DISABLED", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
    }

    @Test
    fun effectWinsBlocksAdminUntilGuardCommits() {
        activate(CapabilityState.ACTIVE, "posc002e effect-wins active")
        val pool = Executors.newSingleThreadExecutor()
        try {
            asLogin("e10_runtime_login", "e10-runtime").use { effect ->
                effect.autoCommit = false
                effect.createStatement().use { it.execute("BEGIN ISOLATION LEVEL READ COMMITTED") }
                val effectPid = effect.prepareStatement("SELECT pg_backend_pid()").use { statement ->
                    statement.executeQuery().use { rows ->
                        assertTrue(rows.next())
                        rows.getInt(1)
                    }
                }
                effect.prepareStatement("SELECT public.pos_companion_effect_guard(?::bigint,?::bigint,?::integer,?)").use { statement ->
                    statement.setLong(1, companionId)
                    statement.setLong(2, credentialId)
                    statement.setInt(3, 1)
                    statement.setString(4, "STOCK_RESERVE")
                    statement.executeQuery().close()
                }
                val held = jdbc(database).queryForList(
                    "SELECT mode FROM pg_locks WHERE pid=? AND granted AND relation='public.capability_actions'::regclass",
                    effectPid,
                ).map { it["mode"].toString() }
                assertTrue(held.any { it.contains("Share") || it.contains("RowShare") }, "effect must retain action-row share locks: $held")
                val waiting = pool.submit<Boolean> {
                    DriverManager.getConnection(databaseUrl(database), postgres.username, postgres.password).use { admin ->
                        admin.autoCommit = false
                        admin.createStatement().use { it.execute("BEGIN ISOLATION LEVEL READ COMMITTED") }
                        admin.prepareStatement("SELECT action_code FROM public.capability_actions WHERE module_code='BLACKSTORE_INTEGRATION' ORDER BY action_code FOR UPDATE").use { statement ->
                            statement.executeQuery().close()
                        }
                        admin.rollback()
                    }
                    true
                }
                val started = System.nanoTime()
                var sawWait = false
                while (TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started) < 15) {
                    val locks = jdbc(database).queryForList(
                        """
                        SELECT a.wait_event_type AS wait_type, a.wait_event AS wait_event, l.granted AS granted
                        FROM pg_stat_activity a
                        JOIN pg_locks l ON l.pid=a.pid
                        WHERE a.datname=current_database()
                          AND a.pid<>?
                          AND (a.query LIKE '%capability_actions%' OR a.wait_event_type='Lock')
                        """.trimIndent(),
                        effectPid,
                    )
                    if (locks.any { it["wait_event"] == "transactionid" && it["granted"] == false }) {
                        sawWait = true
                        break
                    }
                    Thread.sleep(50)
                }
                assertTrue(sawWait, "admin FOR UPDATE must wait while effect holds the action-row share lock")
                effect.commit()
                assertTrue(waiting.get(20, TimeUnit.SECONDS))
            }
        } finally {
            pool.shutdownNow()
            assertTrue(pool.awaitTermination(20, TimeUnit.SECONDS))
            activate(CapabilityState.DISABLED, "posc002e effect-wins restore")
        }
        assertEquals("DISABLED", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
    }

    private fun seedCompanion(jdbc: JdbcTemplate) {
        jdbc.update("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,?,?)", "e10-admin@example.test", "\$argon2id\$fixture", "Eve", "Admin")
        val adminId = jdbc.queryForObject("SELECT id FROM users WHERE email='e10-admin@example.test'", Long::class.java)!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
        jdbc.update("INSERT INTO blackstore_companions(client_instance_id,status) VALUES (?::uuid,'ACTIVE')", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        companionId = jdbc.queryForObject("SELECT id FROM blackstore_companions WHERE client_instance_id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid", Long::class.java)!!
        jdbc.update(
            """
            INSERT INTO blackstore_companion_credentials(
              companion_id, credential_secret_ref, credential_version, status,
              token_fingerprint, scopes, service_role, auth_ready
            ) VALUES (?, 'test-only:e10', 1, 'ACTIVE', ?, ARRAY['catalog:read','stock:read','stock:reserve','stock:commit','stock:release'], 'SERVICE', TRUE)
            """.trimIndent(),
            companionId,
            "b".repeat(64),
        )
        credentialId = jdbc.queryForObject("SELECT id FROM blackstore_companion_credentials WHERE companion_id=?", Long::class.java, companionId)!!
    }

    private fun activate(state: CapabilityState, reason: String) {
        val jdbc = jdbc(database)
        val adminId = jdbc.queryForObject("SELECT id FROM users WHERE email='e10-admin@example.test'", Long::class.java)!!
        CapabilityAdminTestSupport.setBlackStoreStateForTest(jdbc, state, adminId)
    }

    private fun blackstoreConfig(): String =
        jdbc(database).queryForObject(
            "SELECT config::text FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'",
            String::class.java,
        )!!

    private fun callGuard(connection: Connection, function: String, action: String, isolation: String) {
        connection.autoCommit = false
        try {
            connection.createStatement().use { it.execute("SET TRANSACTION ISOLATION LEVEL $isolation") }
            connection.prepareStatement("SELECT public.$function(?::bigint,?::bigint,?::integer,?)").use { statement ->
                statement.setLong(1, companionId)
                statement.setLong(2, credentialId)
                statement.setInt(3, 1)
                statement.setString(4, action)
                statement.executeQuery().close()
            }
            connection.commit()
        } catch (error: RuntimeException) {
            connection.rollback()
            throw error
        } catch (error: PSQLException) {
            connection.rollback()
            throw error
        } finally {
            connection.autoCommit = true
        }
    }

    private fun functionExecute(grantee: String, functionName: String): Boolean =
        jdbc(database).queryForObject(
            "SELECT has_function_privilege(?, p.oid, 'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=?",
            Boolean::class.java,
            grantee,
            functionName,
        )!!

    private fun createLogins(jdbc: JdbcTemplate) {
        jdbc.execute("CREATE ROLE e10_runtime_login LOGIN PASSWORD 'e10-runtime' IN ROLE storecore_runtime")
        jdbc.execute("CREATE ROLE e10_admin_login LOGIN PASSWORD 'e10-admin' IN ROLE storecore_companion_admin")
        jdbc.execute("CREATE ROLE e10_blank_login LOGIN PASSWORD 'e10-blank'")
    }

    private fun assertSqlState(connection: Connection, sqlState: String, action: (Connection) -> Unit) {
        val error = assertThrows(PSQLException::class.java) { action(connection) }
        assertEquals(sqlState, error.sqlState)
    }

    private fun asLogin(user: String, password: String): Connection =
        DriverManager.getConnection(databaseUrl(database), user, password)

    private fun lfNormalizedSha256(bytes: ByteArray): String {
        val normalized = String(bytes, StandardCharsets.UTF_8).replace("\r\n", "\n").replace('\r', '\n')
        return MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02X".format(it) }
    }

    private fun migrateTo(name: String, target: String) {
        Flyway.configure().dataSource(databaseUrl(name), postgres.username, postgres.password).locations("classpath:db/migration").target(MigrationVersion.fromVersion(target)).load().migrate()
    }

    private fun createDatabase(): String {
        val name = "posc002e_" + UUID.randomUUID().toString().replace("-", "")
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
