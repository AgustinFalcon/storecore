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

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Posc002cV9AclTest {
    private lateinit var database: String
    private lateinit var adminId: String
    private lateinit var otherId: String
    private lateinit var originalSession: String
    private lateinit var renewedSession: String
    private lateinit var otherSession: String

    @BeforeAll
    fun migrateCleanBootstrap() {
        database = createDatabase()
        migrateTo(database, "9")
        seedActor(jdbc(database))
        createLogins(jdbc(database))
    }

    @Test
    fun v1ThroughV8StayIntactAndLegacyCredentialStaysQuarantined() {
        val expected = mapOf(
            "V3__capability_administration.sql" to "0D2CEBE1FBA3D43C1C33E2EA216B5D931EA57D510B967D7C471BBB8B87A65DC8",
            "V8__posc002_shared_capability_cutover.sql" to "359CE72F8A7E8041D65DCC545440ADDE4F2F43D72160C922CD88E40110249E2C",
        )
        expected.filterValues { it != null }.forEach { (script, hash) ->
            assertEquals(hash, lfNormalizedSha256(Files.readAllBytes(Path.of("src/main/resources/db/migration", script))), script)
        }
        val upgraded = createDatabase()
        migrateTo(upgraded, "8")
        val before = jdbc(upgraded)
        before.update("INSERT INTO blackstore_companions(client_instance_id,status) VALUES (?::uuid,'DISABLED')", "30000000-0000-0000-0000-000000000009")
        val companionId = before.queryForObject("SELECT id FROM blackstore_companions WHERE client_instance_id='30000000-0000-0000-0000-000000000009'::uuid", Long::class.java)!!
        before.update("INSERT INTO blackstore_companion_credentials(companion_id,credential_secret_ref,credential_version,status) VALUES (?, ?,1,'ACTIVE')", companionId, "test-only:legacy")
        migrateTo(upgraded, "9")
        val after = jdbc(upgraded)
        assertEquals("DISABLED", after.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        assertEquals(false, after.queryForObject("SELECT auth_ready FROM blackstore_companion_credentials WHERE companion_id=?", Boolean::class.java, companionId))
        assertEquals("ACTIVE", after.queryForObject("SELECT status FROM blackstore_companion_credentials WHERE companion_id=?", String::class.java, companionId))
        assertEquals(listOf("1", "2", "3", "4", "5", "6", "7", "8", "9"), after.queryForList("SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank", String::class.java))
        assertFalse(after.queryForObject("SELECT has_table_privilege('storecore_runtime','public.blackstore_companions','INSERT')", Boolean::class.java)!!)
    }

    @Test
    fun rolesStayNologinAndExecuteIsNarrow() {
        val jdbc = jdbc(database)
        assertTrue(jdbc.queryForList("SELECT rolname FROM pg_roles WHERE rolname IN ('storecore_companion_admin_owner','storecore_companion_admin') AND rolcanlogin", String::class.java).isEmpty())
        assertFalse(jdbc.queryForObject("SELECT pg_has_role('storecore_companion_admin','storecore_runtime','member')", Boolean::class.java)!!)
        assertFalse(functionExecute("public", "companion_admin_pair"))
        assertTrue(functionExecute("storecore_companion_admin", "companion_admin_prepare_command"))
        assertFalse(functionExecute("storecore_capability_admin", "companion_admin_pair"))
        assertFalse(functionExecute("storecore_companion_admin", "capability_tx_c_execute"))
        assertFalse(functionExecute("storecore_companion_admin", "companion_admin_apply_state"))
        assertFalse(functionExecute("storecore_companion_admin", "companion_admin_lock_shared_anchor"))
        assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_companion_admin','public.blackstore_companion_admin_commands','INSERT')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT has_column_privilege('storecore_companion_admin_owner','public.module_configurations','state','UPDATE')", Boolean::class.java)!!)
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'companion_admin_%' AND (proconfig IS NULL OR NOT proconfig::text LIKE '%search_path=pg_catalog, pg_temp%')", Int::class.java))
    }

    @Test
    fun runtimeAndBlankLoginsFailClosed() {
        asLogin("v9_runtime_login", "v9-runtime").use { connection ->
            assertSqlState(connection, "42501") {
                it.createStatement().execute("INSERT INTO public.blackstore_companions(client_instance_id,status) VALUES ('${UUID.randomUUID()}','DISABLED')")
            }
            assertSqlState(connection, "42501") {
                it.createStatement().execute("SELECT public.companion_admin_command_status(1,'${UUID.randomUUID()}'::uuid,'${UUID.randomUUID()}'::uuid)")
            }
            assertSqlState(connection, "42501") {
                it.createStatement().execute("SELECT created_at FROM public.blackstore_companions")
            }
        }
        asLogin("v9_admin_login", "v9-admin").use { connection ->
            assertSqlState(connection, "42501") {
                it.createStatement().execute("INSERT INTO public.blackstore_companion_admin_commands(correlation_id,actor_user_id,session_id,operation_kind,client_instance_id,scopes,service_role,reason,command_hash,status) VALUES ('${UUID.randomUUID()}',1,'${UUID.randomUUID()}','PAIR','${UUID.randomUUID()}',ARRAY['catalog:read'],'SERVICE','x','${"a".repeat(64)}','PENDING')")
            }
        }
        asLogin("v9_blank_login", "v9-blank").use { connection ->
            assertSqlState(connection, "42501") {
                it.createStatement().execute("SELECT public.companion_admin_command_status(1,'${UUID.randomUUID()}'::uuid,'${UUID.randomUUID()}'::uuid)")
            }
        }
        val expired = UUID.randomUUID().toString()
        val expiredClient = UUID.randomUUID().toString()
        val expiredReason = "sesion vencida"
        val expiredScopes = arrayOf("catalog:read")
        val expiredDigest = digest("PAIR", expiredClient, "", "", "", expiredScopes, "SERVICE", expiredReason)
        jdbc(database).update(
            "INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at) VALUES (?::uuid,'USER',?::bigint,?,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour',clock_timestamp()+interval '8 hours')",
            expired,
            adminId.toLong(),
            expired.replace("-", "") + expired.replace("-", ""),
        )
        asLogin("v9_admin_login", "v9-admin").use { connection ->
            val denied = assertThrows(PSQLException::class.java) {
                call(connection, "SELECT command_state FROM public.companion_admin_prepare_command(?::bigint,'PAIR',?::uuid,NULL,NULL,NULL,?::text[],'SERVICE',?::uuid,?,?::char(64),?::uuid)", adminId, expiredClient, scopesSql(expiredScopes), UUID.randomUUID().toString(), expiredReason, expiredDigest, expired)
            }
            assertEquals("42501", denied.sqlState)
        }
    }

    @Test
    fun prepareAttachPairReplaysAndKeepsBlackStoreDisabled() {
        revokeLiveCompanions()
        val client = UUID.randomUUID().toString()
        val correlation = UUID.randomUUID().toString()
        val reason = "pair de prueba"
        val scopes = arrayOf("catalog:read", "stock:reserve")
        val digest = digest("PAIR", client, "", "", "", scopes, "SERVICE", reason)
        val fingerprint = "a".repeat(64)
        val secret = "ref:synthetic-pair"
        adminConnection().use { connection ->
            assertEquals("PENDING", call(connection, "SELECT command_state FROM public.companion_admin_prepare_command(?::bigint,'PAIR',?::uuid,NULL,NULL,NULL,?::text[],'SERVICE',?::uuid,?,?::char(64),?::uuid)", adminId, client, scopesSql(scopes), correlation, reason, digest, originalSession))
            assertEquals("PENDING", call(connection, "SELECT command_state FROM public.companion_admin_prepare_command(?::bigint,'PAIR',?::uuid,NULL,NULL,NULL,?::text[],'SERVICE',?::uuid,?,?::char(64),?::uuid)", adminId, client, scopesSql(scopes), correlation, reason, digest, originalSession))
            assertEquals("READY", call(connection, "SELECT public.companion_admin_attach_secret(?::bigint,?::uuid,?::char(64),?::char(64),?,?::uuid)", adminId, correlation, digest, fingerprint, secret, originalSession))
            assertEquals("READY", call(connection, "SELECT public.companion_admin_attach_secret(?::bigint,?::uuid,?::char(64),?::char(64),?,?::uuid)", adminId, correlation, digest, fingerprint, secret, originalSession))
            val attachConflict = assertThrows(PSQLException::class.java) {
                call(connection, "SELECT public.companion_admin_attach_secret(?::bigint,?::uuid,?::char(64),?::char(64),?,?::uuid)", adminId, correlation, digest, "b".repeat(64), "ref:other", originalSession)
            }
            assertEquals("23514", attachConflict.sqlState)
            val first = call(connection, "SELECT public.companion_admin_pair(?::bigint,?::uuid,?::char(64),?,?::text[],'SERVICE',?::uuid,?,?::uuid)", adminId, client, fingerprint, secret, scopesSql(scopes), correlation, reason, originalSession)
            val replay = call(connection, "SELECT public.companion_admin_pair(?::bigint,?::uuid,?::char(64),?,?::text[],'SERVICE',?::uuid,?,?::uuid)", adminId, client, fingerprint, secret, scopesSql(scopes), correlation, reason, originalSession)
            assertEquals(true, jsonbEquals(first, replay ?: ""))
        }
        assertEquals("DISABLED", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        assertEquals("DISABLED", jdbc(database).queryForObject("SELECT status FROM blackstore_companions WHERE client_instance_id=?::uuid", String::class.java, client))
        assertEquals(true, jdbc(database).queryForObject("SELECT auth_ready FROM blackstore_companion_credentials WHERE token_fingerprint=?", Boolean::class.java, fingerprint))
        val status = jdbc(database).queryForMap("SELECT * FROM public.companion_admin_command_status(?::bigint,?::uuid,?::uuid)", adminId.toLong(), UUID.fromString(correlation), UUID.fromString(renewedSession))
        assertEquals("COMPLETED", status["command_state"])
        assertFalse(status.values.any { it?.toString()?.contains("ref:synthetic") == true })
    }

    @Test
    fun hashMismatchAbortsNothingAndActivateStaysFailClosed() {
        val client = UUID.randomUUID().toString()
        val correlation = UUID.randomUUID().toString()
        val reason = "pair mismatch"
        val scopes = arrayOf("catalog:read")
        val digest = digest("PAIR", client, "", "", "", scopes, "SERVICE", reason)
        adminConnection().use { connection ->
            val conflict = assertThrows(PSQLException::class.java) {
                call(connection, "SELECT command_state FROM public.companion_admin_prepare_command(?::bigint,'PAIR',?::uuid,NULL,NULL,NULL,?::text[],'SERVICE',?::uuid,?,?::char(64),?::uuid)", adminId, client, scopesSql(scopes), correlation, reason, "b".repeat(64), originalSession)
            }
            assertEquals("23514", conflict.sqlState)
            call(connection, "SELECT command_state FROM public.companion_admin_prepare_command(?::bigint,'PAIR',?::uuid,NULL,NULL,NULL,?::text[],'SERVICE',?::uuid,?,?::char(64),?::uuid)", adminId, client, scopesSql(scopes), correlation, reason, digest, originalSession)
            val aborted = call(connection, "SELECT public.companion_admin_abort_command(?::bigint,?::uuid,?::char(64),?,?::uuid)", adminId, correlation, digest, "abort voluntario", renewedSession)
            assertEquals("ABORTED", aborted)
            val after = call(connection, "SELECT public.companion_admin_attach_secret(?::bigint,?::uuid,?::char(64),?::char(64),?,?::uuid)", adminId, correlation, digest, "c".repeat(64), "ref:x", originalSession)
            assertEquals("ABORTED", after)
        }

        val paired = pairCompanion("stock:read")
        val activate = adminConnection().use { connection ->
            call(connection, "SELECT public.companion_admin_activate(?::bigint,?::bigint,'DISABLED',1,?::uuid,'activar',?::uuid)", adminId, paired, UUID.randomUUID().toString(), originalSession)
        }
        assertEquals(true, jsonbEquals(activate, """{"status":"ABORTED"}"""))
        assertEquals("DISABLED", jdbc(database).queryForObject("SELECT status FROM blackstore_companions WHERE id=?", String::class.java, paired.toLong()))
        assertEquals("DISABLED", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
    }

    @Test
    fun rotateAndRevokeAreDurableAndStrangerIsDenied() {
        val companionId = pairCompanion("catalog:read")
        val rotateCorrelation = UUID.randomUUID().toString()
        val reason = "rotar"
        val scopes = arrayOf("catalog:read")
        val digest = digest("ROTATE", "", companionId, "DISABLED", "1", scopes, "SERVICE", reason)
        val fingerprint = "d".repeat(64)
        adminConnection().use { connection ->
            call(connection, "SELECT command_state FROM public.companion_admin_prepare_command(?::bigint,'ROTATE',NULL,?::bigint,'DISABLED',1,?::text[],'SERVICE',?::uuid,?,?::char(64),?::uuid)", adminId, companionId, scopesSql(scopes), rotateCorrelation, reason, digest, originalSession)
            call(connection, "SELECT public.companion_admin_attach_secret(?::bigint,?::uuid,?::char(64),?::char(64),?,?::uuid)", adminId, rotateCorrelation, digest, fingerprint, "ref:rotated", originalSession)
            val rotated = call(connection, "SELECT public.companion_admin_rotate(?::bigint,?::bigint,'DISABLED',1,?::char(64),'ref:rotated',?::text[],'SERVICE',?::uuid,?,?::uuid)", adminId, companionId, fingerprint, scopesSql(scopes), rotateCorrelation, reason, originalSession)
            val rotateReplay = call(connection, "SELECT public.companion_admin_rotate(?::bigint,?::bigint,'DISABLED',1,?::char(64),'ref:rotated',?::text[],'SERVICE',?::uuid,?,?::uuid)", adminId, companionId, fingerprint, scopesSql(scopes), rotateCorrelation, reason, originalSession)
            assertEquals(true, jsonbEquals(rotated, rotateReplay ?: ""))
        }
        assertEquals(2, jdbc(database).queryForObject("SELECT credential_version FROM blackstore_companion_credentials WHERE companion_id=? AND status='ACTIVE'", Int::class.java, companionId.toLong()))
        assertEquals(true, jdbc(database).queryForObject("SELECT auth_ready FROM blackstore_companion_credentials WHERE token_fingerprint=?", Boolean::class.java, fingerprint))

        val revoke = adminConnection().use { connection ->
            call(connection, "SELECT public.companion_admin_revoke(?::bigint,?::bigint,'DISABLED',2,?::uuid,'revocar',?::uuid)", adminId, companionId, UUID.randomUUID().toString(), originalSession)
        }
        assertEquals("REVOKED", jdbc(database).queryForObject("SELECT status FROM blackstore_companions WHERE id=?", String::class.java, companionId.toLong()))
        assertEquals(true, jsonbEquals(revoke, """{"companionId":$companionId,"status":"REVOKED","credentialVersion":2}"""))
        adminConnection().use { connection ->
            val stranger = assertThrows(PSQLException::class.java) {
                call(connection, "SELECT command_state,operation_kind FROM public.companion_admin_command_status(?::bigint,?::uuid,?::uuid)", otherId, rotateCorrelation, otherSession)
            }
            assertEquals("42501", stranger.sqlState)
        }
    }

    private fun pairCompanion(scope: String): String {
        revokeLiveCompanions()
        val client = UUID.randomUUID().toString()
        val correlation = UUID.randomUUID().toString()
        val reason = "pair helper"
        val scopes = arrayOf(scope)
        val digest = digest("PAIR", client, "", "", "", scopes, "SERVICE", reason)
        val fingerprint = (UUID.randomUUID().toString() + UUID.randomUUID().toString()).replace("-", "")
        adminConnection().use { connection ->
            call(connection, "SELECT command_state FROM public.companion_admin_prepare_command(?::bigint,'PAIR',?::uuid,NULL,NULL,NULL,?::text[],'SERVICE',?::uuid,?,?::char(64),?::uuid)", adminId, client, scopesSql(scopes), correlation, reason, digest, originalSession)
            call(connection, "SELECT public.companion_admin_attach_secret(?::bigint,?::uuid,?::char(64),?::char(64),?,?::uuid)", adminId, correlation, digest, fingerprint, "ref:$fingerprint", originalSession)
            call(connection, "SELECT public.companion_admin_pair(?::bigint,?::uuid,?::char(64),?,?::text[],'SERVICE',?::uuid,?,?::uuid)", adminId, client, fingerprint, "ref:$fingerprint", scopesSql(scopes), correlation, reason, originalSession)
        }
        return jdbc(database).queryForObject("SELECT id FROM blackstore_companions WHERE client_instance_id=?::uuid", String::class.java, client)!!
    }

    private fun revokeLiveCompanions() {
        jdbc(database).update("UPDATE blackstore_companion_credentials SET status='REVOKED', revoked_at=clock_timestamp() WHERE status='ACTIVE'")
        jdbc(database).update("UPDATE blackstore_companions SET status='REVOKED', revoked_at=clock_timestamp() WHERE status<>'REVOKED'")
    }

    private fun functionExecute(grantee: String, functionName: String): Boolean =
        jdbc(database).queryForObject(
            "SELECT has_function_privilege(?, p.oid, 'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=?",
            Boolean::class.java,
            grantee,
            functionName,
        )!!

    private fun digest(operation: String, client: String, companion: String, state: String, version: String, scopes: Array<String>, role: String, reason: String): String {
        val payload = listOf(operation, client, companion, state, version, scopes.sorted().joinToString(","), role, reason).joinToString(0x1f.toChar().toString())
        return MessageDigest.getInstance("SHA-256").digest(payload.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }

    private fun scopesSql(scopes: Array<String>) = "{" + scopes.joinToString(",") + "}"

    private fun jsonbEquals(actual: String?, expected: String): Boolean =
        jdbc(database).queryForObject("SELECT ?::jsonb = ?::jsonb", Boolean::class.java, actual, expected)!!

    private fun seedActor(jdbc: JdbcTemplate) {
        val dollar = 36.toChar().toString()
        val argon = dollar + "argon2id" + dollar + "v=19" + dollar + "m=65536,t=3,p=1" + dollar + "fixture-salt" + dollar + "fixture-hash"
        jdbc.update("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,?,?)", "v9-admin@example.test", argon, "Ada", "Admin")
        jdbc.update("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,?,?)", "v9-other@example.test", argon, "Otto", "Other")
        adminId = jdbc.queryForObject("SELECT id FROM users WHERE email='v9-admin@example.test'", String::class.java)!!
        otherId = jdbc.queryForObject("SELECT id FROM users WHERE email='v9-other@example.test'", String::class.java)!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId.toLong())
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", otherId.toLong())
        originalSession = UUID.randomUUID().toString()
        renewedSession = UUID.randomUUID().toString()
        otherSession = UUID.randomUUID().toString()
        listOf(originalSession to adminId, renewedSession to adminId, otherSession to otherId).forEach { (session, actor) ->
            jdbc.update(
                "INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at) VALUES (?::uuid,'USER',?::bigint,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '8 hours')",
                session,
                actor.toLong(),
                session.replace("-", "") + session.replace("-", ""),
            )
        }
    }

    private fun createLogins(jdbc: JdbcTemplate) {
        jdbc.execute("CREATE ROLE v9_admin_login LOGIN PASSWORD 'v9-admin' IN ROLE storecore_companion_admin")
        jdbc.execute("CREATE ROLE v9_runtime_login LOGIN PASSWORD 'v9-runtime' IN ROLE storecore_runtime")
        jdbc.execute("CREATE ROLE v9_blank_login LOGIN PASSWORD 'v9-blank'")
    }

    private fun call(connection: Connection, sql: String, vararg args: String): String? {
        connection.prepareStatement(sql).use { statement ->
            args.forEachIndexed { index, value -> statement.setString(index + 1, value) }
            statement.executeQuery().use { rows ->
                return if (rows.next()) rows.getString(1) else null
            }
        }
    }

    private fun assertSqlState(connection: Connection, sqlState: String, action: (Connection) -> Unit) {
        val error = assertThrows(PSQLException::class.java) { action(connection) }
        assertEquals(sqlState, error.sqlState)
    }

    private fun adminConnection(): Connection = asLogin("v9_admin_login", "v9-admin")

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
        val name = "posc002c_" + UUID.randomUUID().toString().replace("-", "")
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
