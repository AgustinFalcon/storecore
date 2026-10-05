package com.storecore.configuration

import com.storecore.identity.domain.InternalRole
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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class CapabilitySessionAdministrationMigrationTest {
    @Test
    fun `fresh V10 exposes only four hardened session entrypoints`() {
        val database = createDatabase()
        migrateTo(database, "10")
        val jdbc = jdbc(database)

        assertEquals(0, jdbc.queryForObject(legacyRuntimeExecuteCount, Int::class.java))
        assertEquals(4, jdbc.queryForObject(sessionEntrypointCount, Int::class.java))
        assertFalse(jdbc.queryForObject("SELECT has_function_privilege('storecore_runtime','capability_assert_live_admin_session(bigint,uuid)','EXECUTE')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','module_configurations','UPDATE')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','capability_kill_switches','INSERT,UPDATE,DELETE')", Boolean::class.java)!!)
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
        val adminId = createUser(jdbc, "v10-admin@example.com", InternalRole.ADMIN)
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

            legacyInvocationSql.forEach { sql ->
                assertThrows(DataAccessException::class.java) { runtime.execute(sql) }
            }

            val stableVersion = version(jdbc)
            val missing = UUID.randomUUID()
            val revoked = createUserSession(jdbc, adminId)
            jdbc.update(
                """UPDATE identity_sessions
                      SET revoked_at=clock_timestamp(),revocation_kind='SELF',revoked_by_user_id=?,
                          revocation_correlation_id=?,revoked_reason='test revoked'
                    WHERE id=?""",
                adminId, UUID.randomUUID(), revoked,
            )
            val idleExpired = createIdleExpiredUserSession(jdbc, adminId)
            val absoluteExpired = createAbsoluteExpiredUserSession(jdbc, adminId)
            val nonAdminId = createUser(jdbc, "v10-non-admin@example.com", null)
            val nonAdminSession = createUserSession(jdbc, nonAdminId)
            val operatorId = createUser(jdbc, "v10-operator@example.com", InternalRole.OPERATOR)
            val operatorSession = createUserSession(jdbc, operatorId)
            val inactiveId = createUser(jdbc, "v10-inactive@example.com", InternalRole.ADMIN)
            val inactiveSession = createUserSession(jdbc, inactiveId)
            jdbc.update("UPDATE users SET active=FALSE WHERE id=?", inactiveId)
            val removedAdminId = createUser(jdbc, "v10-removed-admin@example.com", InternalRole.ADMIN)
            val removedAdminSession = createUserSession(jdbc, removedAdminId)
            jdbc.update("DELETE FROM user_roles WHERE user_id=?", removedAdminId)
            val otherAdminId = createUser(jdbc, "v10-other-admin@example.com", InternalRole.ADMIN)
            val otherAdminSession = createUserSession(jdbc, otherAdminId)
            val customerSession = createCustomerSession(jdbc)

            val created = runtime.queryForObject(
                sessionCreateSql,
                Long::class.java,
                adminId, liveSession, "STOREFRONT", "SERVE", "ops", "positive create", java.sql.Timestamp.from(java.time.Instant.now().plusSeconds(3600)), "V10-1", UUID.randomUUID(),
            )!!
            val replaced = runtime.queryForObject(
                sessionReplaceSql,
                Long::class.java,
                adminId, liveSession, "STOREFRONT", created, "ops", "positive replace", java.sql.Timestamp.from(java.time.Instant.now().plusSeconds(3600)), "V10-2", UUID.randomUUID(),
            )!!
            runtime.query(sessionRemoveSql, { _, _ -> }, adminId, liveSession, "STOREFRONT", replaced, "positive remove", UUID.randomUUID())
            val protectedKill = runtime.queryForObject(
                sessionCreateSql,
                Long::class.java,
                adminId, liveSession, "STOREFRONT", "SERVE", "ops", "protected", java.sql.Timestamp.from(java.time.Instant.now().plusSeconds(3600)), "V10-3", UUID.randomUUID(),
            )!!
            val auditsBefore = auditCount(jdbc)
            val killsBefore = killCount(jdbc)

            assertKillVersionConflict("null remove module") {
                runtime.query(sessionRemoveSql, { _, _ -> }, adminId, liveSession, null, protectedKill, "null module", UUID.randomUUID())
            }
            assertKillVersionConflict("null replace module") {
                runtime.queryForObject(
                    sessionReplaceSql,
                    Long::class.java,
                    adminId, liveSession, null, protectedKill, "ops", "null module", java.sql.Timestamp.from(java.time.Instant.now().plusSeconds(3600)), "NULL", UUID.randomUUID(),
                )
            }

            listOf(
                DeniedPrincipal("null actor", null, liveSession),
                DeniedPrincipal("null session", adminId, null),
                DeniedPrincipal("missing session", adminId, missing),
                DeniedPrincipal("revoked session", adminId, revoked),
                DeniedPrincipal("idle expired", adminId, idleExpired),
                DeniedPrincipal("absolute expired", adminId, absoluteExpired),
                DeniedPrincipal("non-admin", nonAdminId, nonAdminSession),
                DeniedPrincipal("operator", operatorId, operatorSession),
                DeniedPrincipal("inactive user", inactiveId, inactiveSession),
                DeniedPrincipal("removed admin", removedAdminId, removedAdminSession),
                DeniedPrincipal("mismatched actor", otherAdminId, liveSession),
                DeniedPrincipal("mismatched session", adminId, otherAdminSession),
                DeniedPrincipal("customer session", adminId, customerSession),
            ).forEach { denied ->
                assertAllMutationsDenied(runtime, denied, stableVersion, protectedKill)
            }
            assertEquals(stableVersion, version(jdbc))
            assertEquals(auditsBefore, auditCount(jdbc))
            assertEquals(killsBefore, killCount(jdbc))
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM capability_kill_switches WHERE id=? AND active", Int::class.java, protectedKill))
        }
    }

    @Test
    fun `deadline is rechecked after waiting for the business lock`() {
        val database = createDatabase()
        migrateTo(database, "10")
        val jdbc = jdbc(database)
        val adminId = createUser(jdbc, "v10-lock-admin@example.com", InternalRole.ADMIN)
        val expiringSession = createShortUserSession(jdbc, adminId)
        val stableVersion = version(jdbc)
        val auditsBefore = auditCount(jdbc)
        val executor = Executors.newSingleThreadExecutor()

        DriverManager.getConnection(databaseUrl(database), postgres.username, postgres.password).use { blocker ->
            blocker.autoCommit = false
            blocker.prepareStatement(
                "SELECT id FROM module_configurations WHERE module_code='CATALOG' FOR UPDATE",
            ).use { it.executeQuery().close() }
            val started = CountDownLatch(1)
            val future = executor.submit<Unit> {
                started.countDown()
                withRuntime(database) { runtime ->
                    runtime.query(
                        sessionChangeSql,
                        { _, _ -> },
                        adminId, expiringSession, "CATALOG", stableVersion, "ACTIVE", "{}", UUID.randomUUID(), "deadline wait",
                    )
                }
            }
            check(started.await(5, TimeUnit.SECONDS))
            Thread.sleep(3_000)
            blocker.commit()

            val failure = assertThrows(ExecutionException::class.java) { future.get(10, TimeUnit.SECONDS) }
            check(generateSequence<Throwable>(failure) { it.cause }.any { it.message?.contains("CAPABILITY_ACTOR_NOT_AUTHORIZED") == true })
        }
        executor.shutdownNow()
        assertEquals(stableVersion, version(jdbc))
        assertEquals(auditsBefore, auditCount(jdbc))
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

    private fun assertAllMutationsDenied(
        runtime: JdbcTemplate,
        denied: DeniedPrincipal,
        expectedVersion: Int,
        protectedKill: Long,
    ) {
        assertAuthorizationDenied(denied.label) {
            runtime.query(sessionChangeSql, { _, _ -> }, denied.actorId, denied.sessionId, "CATALOG", expectedVersion, "READ_ONLY", "{}", UUID.randomUUID(), "denied ${denied.label}")
        }
        assertAuthorizationDenied(denied.label) {
            runtime.queryForObject(
                sessionCreateSql,
                Long::class.java,
                denied.actorId, denied.sessionId, "CATALOG", "MANAGE", "ops", "denied ${denied.label}", java.sql.Timestamp.from(java.time.Instant.now().plusSeconds(3600)), "DENIED", UUID.randomUUID(),
            )
        }
        assertAuthorizationDenied(denied.label) {
            runtime.query(sessionRemoveSql, { _, _ -> }, denied.actorId, denied.sessionId, "STOREFRONT", protectedKill, "denied ${denied.label}", UUID.randomUUID())
        }
        assertAuthorizationDenied(denied.label) {
            runtime.queryForObject(
                sessionReplaceSql,
                Long::class.java,
                denied.actorId, denied.sessionId, "STOREFRONT", protectedKill, "ops", "denied ${denied.label}", java.sql.Timestamp.from(java.time.Instant.now().plusSeconds(3600)), "DENIED", UUID.randomUUID(),
            )
        }
    }

    private fun assertAuthorizationDenied(label: String, call: () -> Unit) {
        val error = assertThrows(DataAccessException::class.java, { call() }, label)
        check(generateSequence<Throwable>(error) { it.cause }.any { it.message?.contains("CAPABILITY_ACTOR_NOT_AUTHORIZED") == true }) {
            "$label did not fail with CAPABILITY_ACTOR_NOT_AUTHORIZED"
        }
    }

    private fun assertKillVersionConflict(label: String, call: () -> Unit) {
        val error = assertThrows(DataAccessException::class.java, { call() }, label)
        check(generateSequence<Throwable>(error) { it.cause }.any { it.message?.contains("CAPABILITY_KILL_SWITCH_VERSION_CONFLICT") == true }) {
            "$label did not fail with CAPABILITY_KILL_SWITCH_VERSION_CONFLICT"
        }
    }

    private fun createUser(jdbc: JdbcTemplate, email: String, role: InternalRole?): Long {
        val id = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?, '\$argon2id\$fixture', 'V10','User') RETURNING id",
            Long::class.java,
            email,
        )!!
        if (role != null) jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?", id, role.name)
        return id
    }

    private fun createUserSession(jdbc: JdbcTemplate, userId: Long): UUID = UUID.randomUUID().also { id ->
        jdbc.update(
            """INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,idle_expires_at,absolute_expires_at)
               VALUES(?,'USER',?,repeat(replace(?::text,'-',''),2),clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '12 hours')""",
            id, userId, id,
        )
    }

    private fun createShortUserSession(jdbc: JdbcTemplate, userId: Long): UUID = UUID.randomUUID().also { id ->
        jdbc.update(
            """INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,idle_expires_at,absolute_expires_at)
               VALUES(?,'USER',?,repeat(replace(?::text,'-',''),2),clock_timestamp()+interval '2 seconds',clock_timestamp()+interval '3 seconds')""",
            id, userId, id,
        )
    }

    private fun createIdleExpiredUserSession(jdbc: JdbcTemplate, userId: Long): UUID = UUID.randomUUID().also { id ->
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

    private fun createAbsoluteExpiredUserSession(jdbc: JdbcTemplate, userId: Long): UUID = UUID.randomUUID().also { id ->
        jdbc.update(
            """INSERT INTO identity_sessions(
                 id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at
               ) VALUES(
                 ?,'USER',?,repeat(replace(?::text,'-',''),2),clock_timestamp()-interval '4 hours',
                 clock_timestamp()-interval '3 hours',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour'
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

    private fun killCount(jdbc: JdbcTemplate) = jdbc.queryForObject("SELECT count(*) FROM capability_kill_switches", Int::class.java)!!

    private data class DeniedPrincipal(val label: String, val actorId: Long?, val sessionId: UUID?)

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
        private const val sessionCreateSql =
            "SELECT capability_session_create_kill_switch(?::bigint,?::uuid,?::varchar,?::varchar,?::varchar,?::varchar,?::timestamptz,?::varchar,?::uuid)"
        private const val sessionRemoveSql =
            "SELECT capability_session_remove_kill_switch(?::bigint,?::uuid,?::varchar,?::bigint,?::varchar,?::uuid)"
        private const val sessionReplaceSql =
            "SELECT capability_session_replace_kill_switch(?::bigint,?::uuid,?::varchar,?::bigint,?::varchar,?::varchar,?::timestamptz,?::varchar,?::uuid)"
        private val legacyInvocationSql = listOf(
            "SELECT capability_admin_change_configuration(1,'CATALOG',1,'ACTIVE','{}'::jsonb,gen_random_uuid(),'denied')",
            "SELECT capability_admin_create_kill_switch(1,'CATALOG','MANAGE','ops','denied',clock_timestamp()+interval '1 hour','D',gen_random_uuid())",
            "SELECT capability_admin_remove_kill_switch(1,1,'denied',gen_random_uuid())",
            "SELECT capability_admin_replace_kill_switch(1,1,'ops','denied',clock_timestamp()+interval '1 hour','D',gen_random_uuid())",
            "SELECT capability_admin_remove_kill_switch(1,'CATALOG',1,'denied',gen_random_uuid())",
            "SELECT capability_admin_replace_kill_switch(1,'CATALOG',1,'ops','denied',clock_timestamp()+interval '1 hour','D',gen_random_uuid())",
        )
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
