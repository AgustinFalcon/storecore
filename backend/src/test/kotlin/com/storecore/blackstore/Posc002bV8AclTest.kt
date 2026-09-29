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
import java.sql.Connection
import java.sql.DriverManager
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Posc002bV8AclTest {
    private lateinit var database: String
    private lateinit var adminId: String
    private lateinit var otherId: String
    private lateinit var originalSession: String
    private lateinit var renewedSession: String
    private lateinit var otherSession: String

    @BeforeAll
    fun migrateCleanBootstrap() {
        database = createDatabase()
        migrateTo(database, "8")
        val jdbc = jdbc(database)
        assertEquals("8", jdbc.queryForObject("SELECT MAX(version) FROM flyway_schema_history WHERE success", String::class.java))
        seedActor(jdbc)
        createLogins(jdbc)
    }

    @Test
    fun v1ThroughV7ChecksumsStayIntactAfterV8() {
        val expected = mapOf(
            "V1__core_single_tenant_schema.sql" to null,
            "V3__capability_administration.sql" to "0D2CEBE1FBA3D43C1C33E2EA216B5D931EA57D510B967D7C471BBB8B87A65DC8",
            "V4__mp_orders_checkout.sql" to "EB677AE41202961AA1527B4AD0539A344A2620E75079241AEE9BA356209A4C5F",
            "V5__blackstore_integration_registry.sql" to "B27C38CCDB6BAAAAB689197A948C96567BB20CC8BFE7E363DD51FF3ADE34220A",
            "V6__blackstore_integration_saga.sql" to "BC06A1F0C1CDB51A6737E972C2FDC0777C9206F624EF73D70C2F0B8CADD9EB6D",
            "V7__blackstore_future_optional_promotion.sql" to "6444ADB440C4B7DC8536F4BA9856AC9C041742CA67EFB91C03EC6409B5398A0C",
        )
        expected.filterValues { it != null }.forEach { (script, hash) ->
            val bytes = Files.readAllBytes(Path.of("src/main/resources/db/migration", script))
            assertEquals(hash, lfNormalizedSha256(bytes), script)
        }
        val versions = jdbc(database).queryForList(
            "SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank",
            String::class.java,
        )
        assertEquals(listOf("1", "2", "3", "4", "5", "6", "7", "8"), versions)
    }

    @Test
    fun populatedUpgradeReachesV8WithoutEnablingBlackStore() {
        val upgraded = createDatabase()
        migrateTo(upgraded, "7")
        val jdbc = jdbc(upgraded)
        val dollar = 36.toChar().toString()
        val argon = dollar + "argon2id" + dollar + "v=19" + dollar + "m=65536,t=3,p=1" + dollar + "fixture-salt" + dollar + "fixture-hash"
        jdbc.update("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,?,?)", "v8-upgrade@example.test", argon, "Upgrade", "Admin")
        val userId = jdbc.queryForObject("SELECT id FROM users WHERE email='v8-upgrade@example.test'", Long::class.java)!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", userId)
        jdbc.update("INSERT INTO brands(name,slug) VALUES ('Upgrade Brand','upgrade-brand')")
        val brandId = jdbc.queryForObject("SELECT id FROM brands WHERE slug='upgrade-brand'", Long::class.java)!!
        jdbc.update("INSERT INTO products(brand_id,name,slug,base_price,status) VALUES (?,'Upgrade Product','upgrade-product',10.00,'ACTIVE')", brandId)
        val productId = jdbc.queryForObject("SELECT id FROM products WHERE slug='upgrade-product'", Long::class.java)!!
        jdbc.update("INSERT INTO product_variants(product_id,sku,label) VALUES (?,'UPG-SKU','Upgrade variant')", productId)
        val variantId = jdbc.queryForObject("SELECT id FROM product_variants WHERE sku='UPG-SKU'", Long::class.java)!!
        jdbc.update("INSERT INTO inventory_balances(variant_id,available_quantity,reserved_quantity,safety_stock) VALUES (?,7,2,1)", variantId)
        jdbc.update("INSERT INTO blackstore_companions(client_instance_id,status) VALUES (?::uuid,'DISABLED')", "30000000-0000-0000-0000-000000000008")
        val companionId = jdbc.queryForObject("SELECT id FROM blackstore_companions WHERE client_instance_id='30000000-0000-0000-0000-000000000008'::uuid", Long::class.java)!!
        jdbc.update(
            "INSERT INTO blackstore_companion_credentials(companion_id,credential_secret_ref,credential_version,status) VALUES (?, ?,1,'ACTIVE')",
            companionId,
            "test-only:not-resolvable",
        )
        val beforeStates = jdbc.queryForList("SELECT module_code || ':' || state FROM module_configurations ORDER BY module_code", String::class.java)
        val beforeCompanion = jdbc.queryForObject("SELECT status FROM blackstore_companions WHERE id=?", String::class.java, companionId)
        val beforeCredential = jdbc.queryForObject("SELECT status FROM blackstore_companion_credentials WHERE companion_id=?", String::class.java, companionId)
        val beforeBalance = jdbc.queryForObject("SELECT available_quantity FROM inventory_balances WHERE variant_id=?", Int::class.java, variantId)
        migrateTo(upgraded, "8")
        assertEquals(beforeStates, jdbc.queryForList("SELECT module_code || ':' || state FROM module_configurations ORDER BY module_code", String::class.java))
        assertEquals(beforeCompanion, jdbc.queryForObject("SELECT status FROM blackstore_companions WHERE id=?", String::class.java, companionId))
        assertEquals(beforeCredential, jdbc.queryForObject("SELECT status FROM blackstore_companion_credentials WHERE companion_id=?", String::class.java, companionId))
        assertEquals(beforeBalance, jdbc.queryForObject("SELECT available_quantity FROM inventory_balances WHERE variant_id=?", Int::class.java, variantId))
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        assertFalse(jdbc.queryForObject("SELECT has_function_privilege('storecore_runtime','public.capability_admin_change_configuration(bigint,character varying,integer,character varying,jsonb,uuid,character varying)','EXECUTE')", Boolean::class.java)!!)
        assertEquals(listOf("1", "2", "3", "4", "5", "6", "7", "8"), jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE success ORDER BY installed_rank", String::class.java))
    }

    @Test
    fun rolesStayNologinAndAdminExecuteIsNarrow() {
        val jdbc = jdbc(database)
        val logins = jdbc.queryForList("SELECT rolname FROM pg_roles WHERE rolname IN ('storecore_capability_admin_owner','storecore_capability_admin') AND rolcanlogin", String::class.java)
        assertTrue(logins.isEmpty())
        assertFalse(jdbc.queryForObject("SELECT pg_has_role('storecore_capability_admin','storecore_runtime','member')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT pg_has_role('storecore_capability_admin','pg_write_all_data','member')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT has_function_privilege('storecore_runtime','public.capability_admin_change_configuration(bigint,character varying,integer,character varying,jsonb,uuid,character varying)','EXECUTE')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT has_function_privilege('public','public.capability_tx_c_execute(uuid,bigint,uuid,character varying)','EXECUTE')", Boolean::class.java)!!)
        assertTrue(jdbc.queryForObject("SELECT has_function_privilege('storecore_capability_admin','public.capability_tx_c_execute(uuid,bigint,uuid,character varying)','EXECUTE')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_capability_admin','public.capability_admin_commands','INSERT')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT has_column_privilege('storecore_runtime','public.capability_admin_intents','capability_lock_version','UPDATE')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT has_column_privilege('storecore_capability_admin_owner','public.capability_admin_intents','companion_lock_version','UPDATE')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT has_function_privilege('public','public.capability_admin_change_configuration(bigint,character varying,integer,character varying,jsonb,uuid,character varying)','EXECUTE')", Boolean::class.java)!!)
        listOf(
            "public.capability_admin_change_configuration(bigint,character varying,integer,character varying,jsonb,uuid,character varying)",
            "public.capability_admin_create_kill_switch(bigint,character varying,character varying,character varying,character varying,timestamp with time zone,character varying,uuid)",
            "public.capability_admin_remove_kill_switch(bigint,bigint,character varying,uuid)",
            "public.capability_admin_replace_kill_switch(bigint,bigint,character varying,character varying,timestamp with time zone,character varying,uuid)",
        ).forEach { signature ->
            assertFalse(jdbc.queryForObject("SELECT has_function_privilege('v8_admin_login',?, 'EXECUTE')", Boolean::class.java, signature)!!, signature)
        }
        assertEquals(
            listOf("storecore_capability_admin_owner", "storecore_capability_admin_owner", "storecore_capability_admin_owner"),
            jdbc.queryForList("SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE proname LIKE 'capability_tx_c_%' ORDER BY proname", String::class.java),
        )
        assertEquals(
            0,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole WHERE r.rolname IN ('storecore_capability_admin_owner','storecore_capability_admin')",
                Int::class.java,
            ),
        )
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM pg_proc WHERE proname LIKE 'capability_tx_c%' AND prosrc ILIKE '%repeatable read%'", Int::class.java))
        assertTrue(
            jdbc.queryForObject(
                "SELECT has_table_privilege('v8_wide_login','public.capability_admin_commands','INSERT') AND NOT has_table_privilege('v8_admin_login','public.capability_admin_commands','INSERT')",
                Boolean::class.java,
            )!!,
        )
    }

    @Test
    fun directDmlAndV3CallsFailClosed() {
        asLogin("v8_runtime_login", "v8-runtime").use { connection ->
            assertSqlState(connection, "42501") {
                it.createStatement().execute("UPDATE public.capability_admin_intents SET capability_lock_version=1")
            }
            assertSqlState(connection, "42501") {
                it.createStatement().execute("INSERT INTO public.capability_admin_commands(correlation_id,status) VALUES ('${UUID.randomUUID()}','PENDING')")
            }
            assertSqlState(connection, "42501") {
                it.createStatement().execute("SELECT public.capability_admin_change_configuration(1,'CATALOG',1,'READ_ONLY','{}'::jsonb,'${UUID.randomUUID()}'::uuid,'reason')")
            }
            assertSqlState(connection, "42501") {
                it.createStatement().execute("UPDATE public.capability_admin_commands SET status='ABORTED'")
            }
            assertSqlState(connection, "42501") {
                it.createStatement().execute("UPDATE public.capability_configuration_audit_events SET reason='changed'")
            }
            val runtimeCorrelation = UUID.randomUUID().toString()
            connection.prepareStatement(
                """
                INSERT INTO public.capability_admin_intents(
                  correlation_id, actor_user_id, session_id, module_code, operation_code, request_hash,
                  expected_config_version, next_state, reason
                ) VALUES (?::uuid, ?::bigint, ?::uuid, 'FAVORITES', 'CHANGE_STATE', ?, 1, 'READ_ONLY', 'runtime insert')
                """.trimIndent(),
            ).use { statement ->
                statement.setString(1, runtimeCorrelation)
                statement.setLong(2, adminId.toLong())
                statement.setString(3, originalSession)
                statement.setString(4, "d".repeat(64))
                assertEquals(1, statement.executeUpdate())
            }
            assertSqlState(connection, "42501") {
                it.createStatement().execute("UPDATE public.capability_admin_intents SET companion_lock_version=1 WHERE correlation_id='$runtimeCorrelation'::uuid")
            }
            assertEquals(
                0,
                jdbc(database).queryForObject(
                    "SELECT capability_lock_version FROM public.capability_admin_intents WHERE correlation_id=?::uuid",
                    Int::class.java,
                    runtimeCorrelation,
                ),
            )
        }
        asLogin("v8_admin_login", "v8-admin").use { connection ->
            assertSqlState(connection, "42501") {
                it.createStatement().execute("INSERT INTO public.capability_admin_commands(correlation_id,status) VALUES ('${UUID.randomUUID()}','PENDING')")
            }
        }
        asLogin("v8_blank_login", "v8-blank").use { connection ->
            assertSqlState(connection, "42501") {
                it.createStatement().execute("SELECT public.capability_tx_c_status('${UUID.randomUUID()}'::uuid, 1, '${UUID.randomUUID()}'::uuid)")
            }
        }
    }

    @Test
    fun admissionTriggerRejectsMutationAndUnknownWire() {
        val jdbc = jdbc(database)
        val correlation = insertIntent(jdbc, originalSession, "CHANGE_STATE", "CATALOG")
        val error = assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) {
            jdbc.update("UPDATE public.capability_admin_intents SET module_code='STOREFRONT' WHERE correlation_id=?::uuid", correlation)
        }
        assertTrue(generateSequence(error as Throwable?) { it.cause }.any { (it as? PSQLException)?.sqlState == "23514" })
        val unknown = assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) {
            jdbc.update(
                """
                INSERT INTO public.capability_admin_intents(correlation_id,actor_user_id,session_id,module_code,operation_code,request_hash,reason)
                VALUES (?::uuid, ?::bigint, ?::uuid, 'CATALOG', 'NOT_A_COMMAND', '${"a".repeat(64)}', 'no')
                """.trimIndent(),
                UUID.randomUUID().toString(),
                adminId,
                originalSession,
            )
        }
        assertTrue(generateSequence(unknown as Throwable?) { it.cause }.any { (it as? PSQLException)?.sqlState == "23514" })
    }

    @Test
    fun executePersistsStateAndReplayReturnsTheSameResult() {
        val correlation = insertIntent(jdbc(database), originalSession, "CHANGE_STATE", "STOREFRONT")
        val first = call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'STOREFRONT')", correlation, adminId, originalSession)
        val replay = call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'STOREFRONT')", correlation, adminId, originalSession)
        assertEquals(true, jsonbEquals(first, replay ?: ""))
        assertEquals(true, jsonbEquals(first, """{"module":"STOREFRONT","state":"READ_ONLY","configVersion":2}"""))
        assertEquals("READ_ONLY", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='STOREFRONT'", String::class.java))
    }

    @Test
    fun differentPayloadDoesNotApplyAndMissingCommandAbortIsTerminal() {
        val correlation = insertIntent(jdbc(database), originalSession, "CHANGE_STATE", "PROFILE_CONTENT")
        val conflict = assertThrows(PSQLException::class.java) {
            call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'CATALOG')", correlation, adminId, originalSession)
        }
        assertEquals("23514", conflict.sqlState)
        assertEquals("DISABLED", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='PROFILE_CONTENT'", String::class.java))
        val aborted = call(adminConnection(), "SELECT public.capability_tx_c_abort(?::uuid, ?::bigint, ?::uuid)", correlation, adminId, renewedSession)
        assertEquals(true, jsonbEquals(aborted, """{"status":"ABORTED"}"""))
        val after = call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'PROFILE_CONTENT')", correlation, adminId, originalSession)
        assertEquals(true, jsonbEquals(after, """{"status":"ABORTED"}"""))
        assertEquals(0, jdbc(database).queryForObject("SELECT COUNT(*) FROM capability_configuration_audit_events WHERE correlation_id=?::uuid", Int::class.java, correlation))
    }

    @Test
    fun expiredOriginalSessionCannotExecuteAndReauthCanAbort() {
        val expired = UUID.randomUUID().toString()
        jdbc(database).update(
            """
            INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES (?::uuid,'USER',?::bigint,?,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '90 minutes',clock_timestamp()-interval '60 minutes',clock_timestamp()-interval '30 minutes')
            """.trimIndent(),
            expired,
            adminId.toLong(),
            expired.replace("-", "") + expired.replace("-", ""),
        )
        val correlation = insertIntent(jdbc(database), expired, "CHANGE_STATE", "MANUAL_PROMOTIONS")
        val denied = assertThrows(PSQLException::class.java) {
            call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'MANUAL_PROMOTIONS')", correlation, adminId, expired)
        }
        assertEquals("42501", denied.sqlState)
        val aborted = call(adminConnection(), "SELECT public.capability_tx_c_abort(?::uuid, ?::bigint, ?::uuid)", correlation, adminId, renewedSession)
        assertEquals(true, jsonbEquals(aborted, """{"status":"ABORTED"}"""))
        val status = call(adminConnection(), "SELECT public.capability_tx_c_status(?::uuid, ?::bigint, ?::uuid)", correlation, adminId, renewedSession)
        assertEquals(true, jsonbEquals(status, """{"status":"ABORTED"}"""))
        val stranger = assertThrows(PSQLException::class.java) {
            call(adminConnection(), "SELECT public.capability_tx_c_status(?::uuid, ?::bigint, ?::uuid)", correlation, otherId, otherSession)
        }
        assertEquals("42501", stranger.sqlState)
    }

    @Test
    fun completedResultReplaysAfterOriginalSessionExpires() {
        val shortLived = UUID.randomUUID().toString()
        jdbc(database).update(
            """
            INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES (?::uuid,'USER',?::bigint,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 second',clock_timestamp()+interval '2 seconds')
            """.trimIndent(),
            shortLived,
            adminId.toLong(),
            shortLived.replace("-", "") + shortLived.replace("-", ""),
        )
        val correlation = insertIntent(jdbc(database), shortLived, "CHANGE_STATE", "CATALOG")
        val completed = call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'CATALOG')", correlation, adminId, shortLived)
        assertEquals(true, jsonbEquals(completed, """{"module":"CATALOG","state":"READ_ONLY","configVersion":2}"""))
        Thread.sleep(2100)
        val replay = call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'CATALOG')", correlation, adminId, shortLived)
        val status = call(adminConnection(), "SELECT public.capability_tx_c_status(?::uuid, ?::bigint, ?::uuid)", correlation, adminId, renewedSession)
        assertEquals(true, jsonbEquals(replay, """{"module":"CATALOG","state":"READ_ONLY","configVersion":2}"""))
        assertEquals(true, jsonbEquals(status, """{"module":"CATALOG","state":"READ_ONLY","configVersion":2}"""))
        assertEquals("READ_ONLY", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='CATALOG'", String::class.java))
    }

    @Test
    fun killRemoveAndReplacePersistCanonicalResults() {
        val created = insertKillCreate("PROFILE_CONTENT", "MANAGE")
        val createdResult = call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'PROFILE_CONTENT')", created, adminId, originalSession)
        val switchId = jdbc(database).queryForObject(
            "SELECT id FROM capability_kill_switches WHERE module_code='PROFILE_CONTENT' AND action_code='MANAGE' AND active",
            Long::class.java,
        )!!
        assertEquals(true, jsonbEquals(createdResult, """{"module":"PROFILE_CONTENT","killSwitchId":$switchId}"""))

        val replaceCorrelation = insertKillIntent("KILL_REPLACE", "PROFILE_CONTENT", switchId)
        val replaced = call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'PROFILE_CONTENT')", replaceCorrelation, adminId, originalSession)
        val replacementId = jdbc(database).queryForObject(
            "SELECT id FROM capability_kill_switches WHERE module_code='PROFILE_CONTENT' AND action_code='MANAGE' AND active",
            Long::class.java,
        )!!
        assertEquals(true, jsonbEquals(replaced, """{"module":"PROFILE_CONTENT","killSwitchId":$replacementId}"""))
        val replaceReplay = call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'PROFILE_CONTENT')", replaceCorrelation, adminId, originalSession)
        assertEquals(true, jsonbEquals(replaced, replaceReplay ?: ""))
        assertEquals(false, jdbc(database).queryForObject("SELECT active FROM capability_kill_switches WHERE id=?", Boolean::class.java, switchId))

        val removeCorrelation = insertKillIntent("KILL_REMOVE", "PROFILE_CONTENT", replacementId)
        val removed = call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'PROFILE_CONTENT')", removeCorrelation, adminId, originalSession)
        assertEquals(true, jsonbEquals(removed, """{"module":"PROFILE_CONTENT","killSwitchId":$replacementId,"removed":true}"""))
        val removeReplay = call(adminConnection(), "SELECT public.capability_tx_c_status(?::uuid, ?::bigint, ?::uuid)", removeCorrelation, adminId, renewedSession)
        assertEquals(true, jsonbEquals(removed, removeReplay ?: ""))
        assertEquals(0, jdbc(database).queryForObject("SELECT COUNT(*) FROM capability_kill_switches WHERE module_code='PROFILE_CONTENT' AND action_code='MANAGE' AND active", Int::class.java))
    }

    @Test
    fun blackStoreStaysDisabledAndSearchPathHomonymIsIgnored() {
        val correlation = insertIntent(jdbc(database), originalSession, "CHANGE_STATE", "BLACKSTORE_INTEGRATION")
        val aborted = call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'BLACKSTORE_INTEGRATION')", correlation, adminId, originalSession)
        assertEquals(true, jsonbEquals(aborted, """{"status":"ABORTED"}"""))
        assertEquals("DISABLED", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        jdbc(database).execute("CREATE SCHEMA spoof; CREATE TABLE spoof.module_configurations(id int, module_code text, state text)")
        asLogin("v8_admin_login", "v8-admin").use { connection ->
            connection.createStatement().execute("SET search_path TO spoof, public")
            val result = call(connection, "SELECT public.capability_tx_c_status(?::uuid, ?::bigint, ?::uuid)", correlation, adminId, renewedSession)
            assertEquals(true, jsonbEquals(result, """{"status":"ABORTED"}"""))
        }
    }

    @Test
    fun failedEffectRollsBackAndAbsentSwitchCanBeCreatedOnce() {
        val broken = insertKillCreate("ML_PRICE_AUTOMATION", "MISSING_ACTION")
        val failure = assertThrows(PSQLException::class.java) {
            call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'ML_PRICE_AUTOMATION')", broken, adminId, originalSession)
        }
        assertEquals("23503", failure.sqlState)
        assertEquals(0, jdbc(database).queryForObject("SELECT COUNT(*) FROM capability_admin_commands WHERE correlation_id=?::uuid", Int::class.java, broken))

        val created = insertKillCreate("CATALOG", "MANAGE")
        assertEquals(0, jdbc(database).queryForObject("SELECT COUNT(*) FROM capability_kill_switches WHERE module_code='CATALOG' AND action_code='MANAGE' AND active", Int::class.java))
        val first = call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'CATALOG')", created, adminId, originalSession)
        val replay = call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'CATALOG')", created, adminId, originalSession)
        assertEquals(true, jsonbEquals(first, replay ?: ""))
        assertEquals(1, jdbc(database).queryForObject("SELECT COUNT(*) FROM capability_kill_switches WHERE module_code='CATALOG' AND action_code='MANAGE' AND active", Int::class.java))
        assertEquals("DISABLED", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='CATALOG'", String::class.java))
        val duplicate = insertKillCreate("CATALOG", "MANAGE")
        val aborted = call(adminConnection(), "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'CATALOG')", duplicate, adminId, originalSession)
        assertEquals(true, jsonbEquals(aborted, """{"status":"ABORTED"}"""))
    }

    @Test
    fun abortCreatesTheMissingCommandAndLocksActionsBeforeConfigBeforeSwitches() {
        val correlation = insertIntent(jdbc(database), originalSession, "CHANGE_STATE", "LOYALTY")
        assertEquals(0, jdbc(database).queryForObject("SELECT COUNT(*) FROM capability_admin_commands WHERE correlation_id=?::uuid", Int::class.java, correlation))
        val aborted = call(adminConnection(), "SELECT public.capability_tx_c_abort(?::uuid, ?::bigint, ?::uuid)", correlation, adminId, renewedSession)
        assertEquals(true, jsonbEquals(aborted, """{"status":"ABORTED"}"""))
        assertEquals(1, jdbc(database).queryForObject("SELECT COUNT(*) FROM capability_admin_commands WHERE correlation_id=?::uuid", Int::class.java, correlation))

        jdbc(database).update(
            """
            INSERT INTO capability_kill_switches(module_code,action_code,owner,reason,expires_at,removal_ticket,created_by_user_id)
            VALUES ('MARKETPLACE_ML','SYNC','qa','orden de locks',clock_timestamp()+interval '1 day','T-ORDER',?::bigint)
            """.trimIndent(),
            adminId.toLong(),
        )
        val blocked = insertIntent(jdbc(database), originalSession, "CHANGE_STATE", "MARKETPLACE_ML")
        val holder = DriverManager.getConnection(databaseUrl(database), postgres.username, postgres.password)
        holder.autoCommit = false
        holder.prepareStatement("SELECT id FROM public.capability_kill_switches WHERE module_code='MARKETPLACE_ML' FOR UPDATE").use { statement ->
            statement.executeQuery().use { it.next() }
        }
        val pool = Executors.newSingleThreadExecutor()
        val waiting = pool.submit<String?> {
            adminConnection().use { connection ->
                call(connection, "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, 'MARKETPLACE_ML')", blocked, adminId, originalSession)
            }
        }
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10)
        var ordered = false
        while (System.nanoTime() < deadline) {
            val locks = jdbc(database).queryForList(
                """
                SELECT a.pid AS pid, a.wait_event_type AS wait_type, a.wait_event AS wait_event, a.query AS query,
                       l.locktype AS locktype, c.relname AS relname, l.granted AS granted
                FROM pg_stat_activity a
                JOIN pg_locks l ON l.pid=a.pid
                LEFT JOIN pg_class c ON c.oid=l.relation
                WHERE a.datname=current_database()
                  AND a.pid<>pg_backend_pid()
                  AND (a.query LIKE '%capability_tx_c_execute%' OR a.wait_event_type='Lock')
                """.trimIndent(),
            )
            val waiter = locks.firstOrNull { it["wait_event"] == "transactionid" && it["granted"] == false }
            val held = locks.filter { it["pid"] == waiter?.get("pid") && it["granted"] == true }.map { it["relname"] }.toSet()
            if (waiter != null && held.containsAll(setOf("capability_actions", "module_configurations", "capability_kill_switches"))) {
                ordered = true
                break
            }
            Thread.sleep(50)
        }
        holder.rollback()
        holder.close()
        waiting.get(20, TimeUnit.SECONDS)
        pool.shutdown()
        assertTrue(ordered)
        assertEquals("READ_ONLY", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='MARKETPLACE_ML'", String::class.java))
    }

    @Test
    fun executeAndAbortHaveOneWinnerInBothOrders() {
        val abortWins = insertIntent(jdbc(database), originalSession, "CHANGE_STATE", "MANUAL_FULFILLMENT")
        race(abortWins, "MANUAL_FULFILLMENT", abortFirst = true)
        assertEquals("DISABLED", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='MANUAL_FULFILLMENT'", String::class.java))
        val executeWins = insertIntent(jdbc(database), originalSession, "CHANGE_STATE", "PAYMENTS_MP")
        race(executeWins, "PAYMENTS_MP", abortFirst = false)
        assertEquals("READ_ONLY", jdbc(database).queryForObject("SELECT state FROM module_configurations WHERE module_code='PAYMENTS_MP'", String::class.java))
    }

    private fun race(correlation: String, module: String, abortFirst: Boolean) {
        val holder = DriverManager.getConnection(databaseUrl(database), postgres.username, postgres.password)
        holder.autoCommit = false
        holder.prepareStatement("SELECT id FROM public.capability_admin_intents WHERE correlation_id=?::uuid FOR UPDATE").use { statement ->
            statement.setString(1, correlation)
            statement.executeQuery().use { it.next() }
        }
        val pool = Executors.newSingleThreadExecutor()
        val waiting = pool.submit<String?> {
            val connection = adminConnection()
            connection.autoCommit = true
            if (abortFirst) {
                call(connection, "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, ?)", correlation, adminId, originalSession, module)
            } else {
                call(connection, "SELECT public.capability_tx_c_abort(?::uuid, ?::bigint, ?::uuid)", correlation, adminId, renewedSession)
            }
        }
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10)
        while (System.nanoTime() < deadline) {
            val waitingLocks = jdbc(database).queryForObject(
                "SELECT COUNT(*) FROM pg_locks WHERE relation='public.capability_admin_intents'::regclass AND NOT granted",
                Int::class.java,
            ) ?: 0
            if (waitingLocks > 0) {
                break
            }
            Thread.sleep(50)
        }
        if (abortFirst) {
            call(holder, "SELECT public.capability_tx_c_abort(?::uuid, ?::bigint, ?::uuid)", correlation, adminId, renewedSession)
        } else {
            call(holder, "SELECT public.capability_tx_c_execute(?::uuid, ?::bigint, ?::uuid, ?)", correlation, adminId, originalSession, module)
        }
        holder.commit()
        holder.close()
        val follower = waiting.get(20, TimeUnit.SECONDS)
        pool.shutdown()
        if (abortFirst) {
            assertEquals(true, jsonbEquals(follower, """{"status":"ABORTED"}"""))
        } else {
            assertEquals(true, jsonbEquals(follower, """{"module":"PAYMENTS_MP","state":"READ_ONLY","configVersion":2}"""))
        }
    }

    private fun jsonbEquals(actual: String?, expected: String): Boolean =
        jdbc(database).queryForObject("SELECT ?::jsonb = ?::jsonb", Boolean::class.java, actual, expected)!!

    private fun seedActor(jdbc: JdbcTemplate) {
        val dollar = 36.toChar().toString()
        val argon = dollar + "argon2id" + dollar + "v=19" + dollar + "m=65536,t=3,p=1" + dollar + "fixture-salt" + dollar + "fixture-hash"
        jdbc.update("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,?,?)", "v8-admin@example.test", argon, "Ada", "Admin")
        jdbc.update("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,?,?)", "v8-other@example.test", argon, "Otto", "Other")
        adminId = jdbc.queryForObject("SELECT id FROM users WHERE email='v8-admin@example.test'", String::class.java)!!
        otherId = jdbc.queryForObject("SELECT id FROM users WHERE email='v8-other@example.test'", String::class.java)!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId.toLong())
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", otherId.toLong())
        originalSession = UUID.randomUUID().toString()
        renewedSession = UUID.randomUUID().toString()
        otherSession = UUID.randomUUID().toString()
        listOf(originalSession to adminId, renewedSession to adminId, otherSession to otherId).forEach { (session, actor) ->
            jdbc.update(
                """
                INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
                VALUES (?::uuid,'USER',?::bigint,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '8 hours')
                """.trimIndent(),
                session,
                actor.toLong(),
                session.replace("-", "") + session.replace("-", ""),
            )
        }
    }

    private fun insertKillIntent(operation: String, module: String, expectedActiveId: Long): String {
        val correlation = UUID.randomUUID().toString()
        if (operation == "KILL_REPLACE") {
            jdbc(database).update(
                """
                INSERT INTO public.capability_admin_intents(
                  correlation_id, actor_user_id, session_id, module_code, operation_code, request_hash,
                  kill_owner, reason, expires_at, removal_ticket, expected_active_id
                ) VALUES (?::uuid, ?::bigint, ?::uuid, ?, 'KILL_REPLACE', ?, 'qa-owner', 'corte de prueba', clock_timestamp()+interval '1 day', 'T-REPLACE', ?)
                """.trimIndent(),
                correlation,
                adminId.toLong(),
                originalSession,
                module,
                "e".repeat(64),
                expectedActiveId,
            )
        } else {
            jdbc(database).update(
                """
                INSERT INTO public.capability_admin_intents(
                  correlation_id, actor_user_id, session_id, module_code, operation_code, request_hash,
                  reason, expected_active_id
                ) VALUES (?::uuid, ?::bigint, ?::uuid, ?, 'KILL_REMOVE', ?, 'corte de prueba', ?)
                """.trimIndent(),
                correlation,
                adminId.toLong(),
                originalSession,
                module,
                "f".repeat(64),
                expectedActiveId,
            )
        }
        return correlation
    }

    private fun insertKillCreate(module: String, action: String): String {
        val correlation = UUID.randomUUID().toString()
        jdbc(database).update(
            """
            INSERT INTO public.capability_admin_intents(
              correlation_id, actor_user_id, session_id, module_code, operation_code, request_hash,
              action_code, kill_owner, reason, expires_at, removal_ticket
            ) VALUES (?::uuid, ?::bigint, ?::uuid, ?, 'KILL_CREATE', ?, ?, 'qa-owner', 'corte de prueba', clock_timestamp()+interval '1 day', 'T-CREATE')
            """.trimIndent(),
            correlation,
            adminId.toLong(),
            originalSession,
            module,
            "c".repeat(64),
            action,
        )
        return correlation
    }

    private fun insertIntent(jdbc: JdbcTemplate, session: String, operation: String, module: String): String {
        val correlation = UUID.randomUUID().toString()
        jdbc.update(
            """
            INSERT INTO public.capability_admin_intents(
              correlation_id, actor_user_id, session_id, module_code, operation_code, request_hash,
              expected_config_version, next_state, reason
            ) VALUES (?::uuid, ?::bigint, ?::uuid, ?, ?, ?, 1, 'READ_ONLY', 'corte de prueba')
            """.trimIndent(),
            correlation,
            adminId.toLong(),
            session,
            module,
            operation,
            "b".repeat(64),
        )
        return correlation
    }

    private fun createLogins(jdbc: JdbcTemplate) {
        jdbc.execute("CREATE ROLE v8_admin_login LOGIN PASSWORD 'v8-admin' IN ROLE storecore_capability_admin")
        jdbc.execute("CREATE ROLE v8_runtime_login LOGIN PASSWORD 'v8-runtime' IN ROLE storecore_runtime")
        jdbc.execute("CREATE ROLE v8_blank_login LOGIN PASSWORD 'v8-blank'")
        jdbc.execute("CREATE ROLE v8_wide_login LOGIN PASSWORD 'v8-wide' IN ROLE storecore_capability_admin, pg_write_all_data")
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

    private fun adminConnection(): Connection = asLogin("v8_admin_login", "v8-admin")

    private fun asLogin(user: String, password: String): Connection =
        DriverManager.getConnection(databaseUrl(database), user, password)

    private fun lfNormalizedSha256(bytes: ByteArray): String {
        val normalized = String(bytes, StandardCharsets.UTF_8).replace("\r\n", "\n").replace('\r', '\n')
        return java.security.MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(StandardCharsets.UTF_8)).joinToString("") { "%02X".format(it) }
    }

    private fun migrateTo(name: String, target: String) {
        Flyway.configure().dataSource(databaseUrl(name), postgres.username, postgres.password).locations("classpath:db/migration").target(MigrationVersion.fromVersion(target)).load().migrate()
    }

    private fun createDatabase(): String {
        val name = "posc002b_" + UUID.randomUUID().toString().replace("-", "")
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
