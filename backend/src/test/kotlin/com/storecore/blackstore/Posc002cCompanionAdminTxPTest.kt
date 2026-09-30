package com.storecore.blackstore

import com.storecore.blackstore.application.CompanionAdminCommandAborted
import com.storecore.blackstore.application.CompanionAdminPoolMissing
import com.storecore.blackstore.domain.CompanionAdminCommand
import com.storecore.blackstore.domain.CompanionAdminOperation
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.blackstore.infrastructure.InMemoryCompanionSecretProvider
import com.storecore.blackstore.infrastructure.JdbcCompanionAdminCommands
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.jdbc.core.JdbcTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Posc002cCompanionAdminTxPTest {
    @Test
    fun missingPoolFailsClosedBeforeSql() {
        val runtimeOnly = JdbcCompanionAdminCommands(null, InMemoryCompanionSecretProvider())
        assertThrows(CompanionAdminPoolMissing::class.java) {
            runtimeOnly.pair(admin(), CompanionAdminCommand.Pair(UUID.randomUUID(), UUID.randomUUID(), listOf(CompanionScope.CATALOG_READ), "no-pool"))
        }
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
    }

    @Test
    fun pairDeliversBearerOnceAndReplayKeepsMetadata() {
        revokeLive()
        val client = UUID.randomUUID()
        val correlation = UUID.randomUUID()
        val command = CompanionAdminCommand.Pair(correlation, client, listOf(CompanionScope.CATALOG_READ, CompanionScope.STOCK_READ), "pair http")
        val first = commands.pair(admin(), command)
        assertEquals("COMPLETED", first.commandState)
        assertEquals(CompanionLifecycleStatus.DISABLED, first.status)
        assertEquals(1, first.credentialVersion)
        assertNotNull(first.bearer)
        assertEquals(64, first.bearer!!.length)
        val replay = commands.pair(admin(), command)
        assertEquals(first.companionId, replay.companionId)
        assertNull(replay.bearer)
        assertEquals("DISABLED", jdbc.queryForObject("SELECT status FROM blackstore_companions WHERE id=?", String::class.java, first.companionId))
        assertEquals(true, jdbc.queryForObject("SELECT auth_ready FROM blackstore_companion_credentials WHERE companion_id=? AND status='ACTIVE'", Boolean::class.java, first.companionId))
        val status = commands.commandStatus(admin(), correlation)
        assertEquals("COMPLETED", status.commandState)
        assertNull(status.bearer)
        assertFalse(status.toString().contains("synthetic:", ignoreCase = true))
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
    }

    @Test
    fun secondLivePairAbortsAndActivateStaysFailClosed() {
        revokeLive()
        val first = commands.pair(admin(), CompanionAdminCommand.Pair(UUID.randomUUID(), UUID.randomUUID(), listOf(CompanionScope.CATALOG_READ), "primero"))
        assertThrows(CompanionAdminCommandAborted::class.java) {
            commands.pair(admin(), CompanionAdminCommand.Pair(UUID.randomUUID(), UUID.randomUUID(), listOf(CompanionScope.CATALOG_READ), "segundo"))
        }
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_companions WHERE status<>'REVOKED'", Int::class.java))
        assertThrows(CompanionAdminCommandAborted::class.java) {
            commands.applyState(
                admin(),
                CompanionAdminCommand.ApplyState(
                    UUID.randomUUID(),
                    CompanionAdminOperation.Activate,
                    first.companionId!!,
                    CompanionLifecycleStatus.DISABLED,
                    1,
                    "activar",
                ),
            )
        }
        assertEquals("DISABLED", jdbc.queryForObject("SELECT status FROM blackstore_companions WHERE id=?", String::class.java, first.companionId))
    }

    @Test
    fun kotlinHashMatchesSqlDigest() {
        val client = UUID.randomUUID()
        val command = CompanionAdminCommand.Pair(UUID.randomUUID(), client, listOf(CompanionScope.CATALOG_READ), "hash check")
        val sql = jdbc.queryForObject(
            "SELECT public.companion_admin_command_digest('PAIR', ?::uuid, NULL, NULL, NULL, ?::text[], 'SERVICE', ?)",
            String::class.java,
            client,
            "{catalog:read}",
            "hash check",
        )
        assertEquals(sql, command.requestHash())
    }

    private fun admin() = InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN))

    private fun revokeLive() {
        jdbc.update("UPDATE blackstore_companion_credentials SET status='REVOKED', revoked_at=clock_timestamp() WHERE status='ACTIVE'")
        jdbc.update("UPDATE blackstore_companions SET status='REVOKED', revoked_at=clock_timestamp() WHERE status<>'REVOKED'")
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        private lateinit var jdbc: JdbcTemplate
        private lateinit var commands: JdbcCompanionAdminCommands
        private var adminId: Long = 0
        private lateinit var adminSession: UUID

        @JvmStatic
        @BeforeAll
        fun startDatabase() {
            postgres.start()
            val provisioned = CompanionAdminTestSupport.migrateAndProvision(postgres)
            jdbc = provisioned.first
            commands = JdbcCompanionAdminCommands(provisioned.second, InMemoryCompanionSecretProvider())
            val hash = Argon2PasswordHasher().hash("a-very-long-password".toCharArray())
            adminId = jdbc.queryForObject(
                "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id",
                Long::class.java,
                "posc002c-admin@example.com",
                hash,
            )!!
            jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
            adminSession = CompanionAdminTestSupport.liveAdminSession(jdbc, adminId)
        }

        @JvmStatic
        @AfterAll
        fun stopDatabase() = postgres.stop()
    }
}
