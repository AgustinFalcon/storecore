package com.storecore.commerce

import com.storecore.configuration.application.CapabilityDisabled
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.CapabilityAdminTestSupport
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.flywaydb.core.Flyway
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
import java.sql.DriverManager
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Dsp000bMlCapabilityGuardTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var capabilities: JdbcCapabilityService
    private var adminId: Long = 0
    private lateinit var adminSession: UUID
    private lateinit var runtimeLogin: String
    private lateinit var runtimePassword: String

    @BeforeAll
    fun start() {
        postgres.start()
        val provisioned = CapabilityAdminTestSupport.migrateAndProvision(postgres)
        jdbc = provisioned.first
        capabilities = JdbcCapabilityService(jdbc, provisioned.second)
        val hash = Argon2PasswordHasher().hash("a-very-long-password".toCharArray())
        adminId = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id",
            Long::class.java,
            "dsp000b-admin@example.com",
            hash,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
        adminSession = CapabilityAdminTestSupport.liveAdminSession(jdbc, adminId)
        runtimeLogin = "dsp000b_rt_" + UUID.randomUUID().toString().replace("-", "").take(8)
        runtimePassword = UUID.randomUUID().toString()
        jdbc.execute("CREATE ROLE $runtimeLogin LOGIN PASSWORD '$runtimePassword'")
        jdbc.execute("GRANT storecore_runtime TO $runtimeLogin")
        jdbc.execute("GRANT CONNECT ON DATABASE ${postgres.databaseName} TO $runtimeLogin")
        jdbc.execute("GRANT USAGE ON SCHEMA public TO $runtimeLogin")
    }

    @AfterAll
    fun stop() = postgres.stop()

    @Test
    fun v15ShaAndFlywayCeiling() {
        val path = Path.of("src/main/resources/db/migration/V15__dsp000b_ml_sync_capability_guard.sql")
        assertEquals(V15_SHA, lfSha(Files.readAllBytes(path)))
        assertTrue(
            jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE success", String::class.java).contains("15"),
        )
    }

    @Test
    fun runtimeSnapshotWorksAndDirectDmlAndV3MlAreDenied() {
        DriverManager.getConnection(postgres.jdbcUrl, runtimeLogin, runtimePassword).use { connection ->
            connection.autoCommit = true
            connection.createStatement().use { statement ->
                assertEquals(runtimeLogin, statement.executeQuery("SELECT current_user").use { it.next(); it.getString(1) })
                assertFalse(statement.executeQuery("SELECT rolsuper FROM pg_roles WHERE rolname=current_user").use { it.next(); it.getBoolean(1) })
                val photo = statement.executeQuery("SELECT public.marketplace_ml_sync_snapshot()::text").use {
                    assertTrue(it.next())
                    it.getString(1)
                }
                assertTrue(photo.contains("MARKETPLACE_ML"), photo)
                assertTrue(photo.contains("SYNC"), photo)
                assertTrue(photo.contains("DISABLED"), photo)
                assertFalse(
                    statement.executeQuery(
                        "SELECT has_table_privilege('storecore_runtime','public.module_configurations','UPDATE')",
                    ).use { it.next(); it.getBoolean(1) },
                )
                assertFalse(
                    statement.executeQuery(
                        "SELECT has_function_privilege('storecore_runtime','public.capability_admin_change_configuration(bigint,varchar,integer,varchar,jsonb,uuid,varchar)','EXECUTE')",
                    ).use { it.next(); it.getBoolean(1) },
                )
            }
        }
        assertThrows(PSQLException::class.java) {
            DriverManager.getConnection(postgres.jdbcUrl, runtimeLogin, runtimePassword).use { connection ->
                connection.createStatement().use {
                    it.executeUpdate("UPDATE public.module_configurations SET config_version=config_version WHERE module_code='MARKETPLACE_ML'")
                }
            }
        }
        val version = jdbc.queryForObject(
            "SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'",
            Int::class.java,
        )!!
        val denied = assertThrows(Exception::class.java) {
            jdbc.queryForObject(
                "SELECT public.capability_admin_change_configuration(?,?,?,?,?::jsonb,?,?)",
                String::class.java,
                adminId,
                "MARKETPLACE_ML",
                version,
                "ACTIVE",
                "{}",
                UUID.randomUUID(),
                "generic-ml",
            )
        }
        assertTrue(denied.message.orEmpty().contains("CAPABILITY_ML_GENERIC_DENIED") || denied.cause?.message.orEmpty().contains("CAPABILITY_ML_GENERIC_DENIED"), denied.message)
    }

    @Test
    fun decideUsesSnapshotAndTxCAdminStillActivatesMl() {
        assertThrows(CapabilityDisabled::class.java) {
            capabilities.decide("MARKETPLACE_ML", "SYNC", CapabilityActor.System)
        }
        val version = jdbc.queryForObject(
            "SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'",
            Int::class.java,
        )!!
        capabilities.changeState(
            InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN)),
            "MARKETPLACE_ML",
            CapabilityState.ACTIVE,
            version,
            "dsp000b enable sync",
            UUID.randomUUID(),
        )
        capabilities.decide("MARKETPLACE_ML", "SYNC", CapabilityActor.System)
        assertEquals(
            "ACTIVE",
            jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='MARKETPLACE_ML'", String::class.java),
        )
        val restore = jdbc.queryForObject(
            "SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'",
            Int::class.java,
        )!!
        capabilities.changeState(
            InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN)),
            "MARKETPLACE_ML",
            CapabilityState.DISABLED,
            restore,
            "dsp000b restore disabled",
            UUID.randomUUID(),
        )
        assertEquals(
            "DISABLED",
            jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='MARKETPLACE_ML'", String::class.java),
        )
        assertEquals(
            "DISABLED",
            jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java),
        )
    }

    @Test
    fun concurrentWriterWaitsOnRuntimeSnapshotShareLock() {
        val held = CountDownLatch(1)
        val release = CountDownLatch(1)
        val writerFailedOnTimeout = AtomicBoolean(false)
        val holder = Thread {
            DriverManager.getConnection(postgres.jdbcUrl, runtimeLogin, runtimePassword).use { connection ->
                connection.autoCommit = false
                connection.createStatement().use { it.execute("SELECT public.marketplace_ml_sync_snapshot()") }
                held.countDown()
                assertTrue(release.await(10, TimeUnit.SECONDS))
                connection.commit()
            }
        }
        holder.start()
        assertTrue(held.await(10, TimeUnit.SECONDS))
        val writer = Thread {
            DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
                connection.autoCommit = true
                connection.createStatement().use { statement ->
                    statement.execute("SET lock_timeout = '400ms'")
                    try {
                        statement.executeQuery(
                            "SELECT 1 FROM public.capability_actions WHERE module_code='MARKETPLACE_ML' AND action_code='SYNC' FOR UPDATE",
                        )
                    } catch (_: PSQLException) {
                        writerFailedOnTimeout.set(true)
                    }
                }
            }
        }
        writer.start()
        writer.join(5_000)
        assertTrue(writerFailedOnTimeout.get())
        release.countDown()
        holder.join(5_000)
    }

    private fun lfSha(bytes: ByteArray): String {
        val normalized = String(bytes, StandardCharsets.UTF_8).replace("\r\n", "\n").replace('\r', '\n')
        return MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02X".format(it) }
    }

    companion object {
        private const val V15_SHA = "4CECD8B7E846E692B025F383CCFB8E7152716B4C93EB5B5945282FA15C8DBC61"
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
