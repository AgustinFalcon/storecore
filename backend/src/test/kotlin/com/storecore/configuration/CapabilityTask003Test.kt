package com.storecore.configuration

import com.storecore.configuration.application.CapabilityActionNotAllowed
import com.storecore.configuration.application.CapabilityActorNotAuthorized
import com.storecore.configuration.application.CapabilityConfigInvalid
import com.storecore.configuration.application.CapabilityConfigVersionConflict
import com.storecore.configuration.application.CapabilityDisabled
import com.storecore.configuration.application.CapabilityErrorState
import com.storecore.configuration.application.CapabilityKillSwitchActive
import com.storecore.configuration.application.CapabilityKillSwitchVersionConflict
import com.storecore.configuration.application.CapabilityPaused
import com.storecore.configuration.application.CapabilityReadOnly
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.domain.InstallationCapabilityModule
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.SingleConnectionDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Instant
import java.util.UUID

class CapabilityTask003Test {
    @Test
    fun `runtime configuration and creation reject temporary forged admin relations`() {
        val forgedId = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) SELECT ?,password_hash,'Forged','User' FROM users WHERE id=? RETURNING id",
            Long::class.java, "capability-definer-forged@example.com", adminId,
        )!!
        val forgedSession = createSession(forgedId)
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='CATALOG'", Int::class.java)!!
        val state = jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='CATALOG'", String::class.java)!!
        val nextState = if (CapabilityState.fromWire(state) == CapabilityState.ACTIVE) CapabilityState.READ_ONLY else CapabilityState.ACTIVE
        val killsBefore = jdbc.queryForObject("SELECT COUNT(*) FROM capability_kill_switches", Int::class.java)!!
        withRuntimeCapabilities { runtimeCapabilities, runtimeJdbc ->
            runtimeJdbc.execute("CREATE TEMP TABLE users(id BIGINT, active BOOLEAN)")
            runtimeJdbc.execute("CREATE TEMP TABLE roles(id BIGINT, code VARCHAR(64))")
            runtimeJdbc.execute("CREATE TEMP TABLE user_roles(user_id BIGINT, role_id BIGINT)")
            runtimeJdbc.execute("CREATE TEMP TABLE identity_sessions(id UUID, subject_kind VARCHAR(16), user_id BIGINT, revoked_at TIMESTAMPTZ, idle_expires_at TIMESTAMPTZ, absolute_expires_at TIMESTAMPTZ)")
            runtimeJdbc.execute("GRANT SELECT ON users, roles, user_roles, identity_sessions TO storecore_migrator")
            runtimeJdbc.update("INSERT INTO users(id,active) VALUES(?,TRUE)", forgedId)
            runtimeJdbc.update("INSERT INTO roles(id,code) VALUES(1,'ADMIN')")
            runtimeJdbc.update("INSERT INTO user_roles(user_id,role_id) VALUES(?,1)", forgedId)
            runtimeJdbc.update("INSERT INTO identity_sessions VALUES(?,'USER',?,NULL,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')", forgedSession, forgedId)
            val forged = InternalUserPrincipal(forgedSession, forgedId, setOf(InternalRole.ADMIN))
            assertThrows(CapabilityActorNotAuthorized::class.java) {
                runtimeCapabilities.changeState(forged, "CATALOG", nextState, version, "forged", UUID.randomUUID())
            }
            assertThrows(CapabilityActorNotAuthorized::class.java) {
                runtimeCapabilities.createKill(forged, "CATALOG", "MANAGE", "ops", "forged", Instant.now().plusSeconds(3600), "TICKET-FORGED", UUID.randomUUID())
            }
        }
        assertEquals(version, jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='CATALOG'", Int::class.java))
        assertEquals(killsBefore, jdbc.queryForObject("SELECT COUNT(*) FROM capability_kill_switches", Int::class.java))
    }

    @Test
    fun `decide precedence is kill then state then action then actor`() {
        activate("STOREFRONT")
        capabilities.decide("STOREFRONT", "SERVE", CapabilityActor.Public)
        val killId = capabilities.createKill(admin(), "STOREFRONT", "SERVE", "ops", "freeze", Instant.now().plusSeconds(3600), "TICKET-1", UUID.randomUUID())
        assertThrows(CapabilityKillSwitchActive::class.java) { capabilities.decide("STOREFRONT", "SERVE", CapabilityActor.Public) }
        capabilities.removeKill(admin(), InstallationCapabilityModule.Storefront, killId, "thaw", UUID.randomUUID())
        capabilities.decide("STOREFRONT", "SERVE", CapabilityActor.Public)
        setState("CATALOG", CapabilityState.ACTIVE)
        assertThrows(CapabilityActionNotAllowed::class.java) { capabilities.decide("CATALOG", "MISSING", CapabilityActor.Internal(admin())) }
        assertThrows(CapabilityActorNotAuthorized::class.java) { capabilities.decide("CATALOG", "MANAGE", CapabilityActor.Public) }
        assertThrows(CapabilityActorNotAuthorized::class.java) { capabilities.decide("CATALOG", "MANAGE", CapabilityActor.Internal(InternalUserPrincipal(UUID.randomUUID(), adminId, emptySet()))) }
        capabilities.decide("CATALOG", "MANAGE", CapabilityActor.Internal(admin()))
    }

    @Test
    fun `module states DISABLED READ_ONLY ACTIVE PAUSED ERROR`() {
        assertThrows(CapabilityDisabled::class.java) { capabilities.decide("MANUAL_FULFILLMENT", "READ", CapabilityActor.Internal(admin())) }
        setState("MANUAL_FULFILLMENT", CapabilityState.READ_ONLY)
        capabilities.decide("MANUAL_FULFILLMENT", "READ", CapabilityActor.Internal(admin()))
        assertThrows(CapabilityReadOnly::class.java) { capabilities.decide("MANUAL_FULFILLMENT", "MANAGE", CapabilityActor.Internal(admin())) }
        setState("MANUAL_FULFILLMENT", CapabilityState.ACTIVE)
        capabilities.decide("MANUAL_FULFILLMENT", "MANAGE", CapabilityActor.Internal(admin()))
        setState("MANUAL_FULFILLMENT", CapabilityState.PAUSED)
        assertThrows(CapabilityPaused::class.java) { capabilities.decide("MANUAL_FULFILLMENT", "READ", CapabilityActor.Internal(admin())) }
        capabilities.decide("MANUAL_FULFILLMENT", "READ_STATUS", CapabilityActor.Internal(admin()))
        capabilities.decide("MANUAL_FULFILLMENT", "HEALTH", CapabilityActor.System)
        setState("MANUAL_FULFILLMENT", CapabilityState.ERROR)
        assertThrows(CapabilityErrorState::class.java) { capabilities.decide("MANUAL_FULFILLMENT", "READ", CapabilityActor.Internal(admin())) }
        capabilities.decide("MANUAL_FULFILLMENT", "HEALTH", CapabilityActor.System)
    }

    @Test
    fun `config CAS conflict kill lifecycle and future optional stay disabled`() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='PROFILE_CONTENT'", Int::class.java)!!
        capabilities.changeState(admin(), "PROFILE_CONTENT", CapabilityState.ACTIVE, version, "enable", UUID.randomUUID())
        assertThrows(CapabilityConfigVersionConflict::class.java) { capabilities.changeState(admin(), "PROFILE_CONTENT", CapabilityState.READ_ONLY, version, "stale", UUID.randomUUID()) }
        val created = capabilities.createKill(admin(), "PROFILE_CONTENT", "MANAGE", "ops", "hold", Instant.now().plusSeconds(7200), "TICKET-2", UUID.randomUUID())
        val forgedAdminId = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) SELECT ?,password_hash,'Forged','Admin' FROM users WHERE id=? RETURNING id",
            Long::class.java,
            "capability-forged-admin@example.com",
            adminId,
        )!!
        val forgedAdminSession = createSession(forgedAdminId)
        withRuntimeCapabilities { runtimeCapabilities, runtimeJdbc ->
            runtimeJdbc.execute("CREATE TEMP TABLE users(id BIGINT, active BOOLEAN)")
            runtimeJdbc.execute("CREATE TEMP TABLE roles(id BIGINT, code VARCHAR(64))")
            runtimeJdbc.execute("CREATE TEMP TABLE user_roles(user_id BIGINT, role_id BIGINT)")
            runtimeJdbc.execute("CREATE TEMP TABLE identity_sessions(id UUID, subject_kind VARCHAR(16), user_id BIGINT, revoked_at TIMESTAMPTZ, idle_expires_at TIMESTAMPTZ, absolute_expires_at TIMESTAMPTZ)")
            runtimeJdbc.execute("GRANT SELECT ON users, roles, user_roles, identity_sessions TO storecore_migrator")
            runtimeJdbc.update("INSERT INTO users(id,active) VALUES(?,TRUE)", forgedAdminId)
            runtimeJdbc.update("INSERT INTO roles(id,code) VALUES(1,'ADMIN')")
            runtimeJdbc.update("INSERT INTO user_roles(user_id,role_id) VALUES(?,1)", forgedAdminId)
            runtimeJdbc.update("INSERT INTO identity_sessions VALUES(?,'USER',?,NULL,clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')", forgedAdminSession, forgedAdminId)

            val forgedPrincipal = InternalUserPrincipal(forgedAdminSession, forgedAdminId, setOf(InternalRole.ADMIN))
            assertThrows(CapabilityActorNotAuthorized::class.java) {
                runtimeCapabilities.removeKill(forgedPrincipal, InstallationCapabilityModule.ProfileContent, created, "forged admin", UUID.randomUUID())
            }
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM capability_kill_switches WHERE id=? AND active", Int::class.java, created))
        }
        val replaced = withRuntimeCapabilities { runtimeCapabilities, _ ->
            assertThrows(CapabilityKillSwitchVersionConflict::class.java) {
                runtimeCapabilities.replaceKill(admin(), InstallationCapabilityModule.Catalog, created, "ops-2", "wrong module", Instant.now().plusSeconds(7200), "TICKET-X", UUID.randomUUID())
            }
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM capability_kill_switches WHERE id=? AND active", Int::class.java, created))
            runtimeCapabilities.replaceKill(admin(), InstallationCapabilityModule.ProfileContent, created, "ops-2", "replace", Instant.now().plusSeconds(7200), "TICKET-3", UUID.randomUUID())
        }
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM capability_kill_switches WHERE id=? AND active", Int::class.java, replaced))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM capability_kill_switches WHERE id=? AND active", Int::class.java, created))
        withRuntimeCapabilities { runtimeCapabilities, _ ->
            assertThrows(CapabilityKillSwitchVersionConflict::class.java) {
                runtimeCapabilities.removeKill(admin(), InstallationCapabilityModule.Catalog, replaced, "wrong module", UUID.randomUUID())
            }
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM capability_kill_switches WHERE id=? AND active", Int::class.java, replaced))
            runtimeCapabilities.removeKill(admin(), InstallationCapabilityModule.ProfileContent, replaced, "done", UUID.randomUUID())
        }
        val expired = capabilities.createKill(admin(), "PROFILE_CONTENT", "READ", "ops", "expire-me", Instant.now().plusSeconds(3600), "TICKET-4", UUID.randomUUID())
        jdbc.update("ALTER TABLE capability_kill_switches DISABLE TRIGGER trg_enforce_kill_switch_lifecycle")
        jdbc.update("UPDATE capability_kill_switches SET created_at=now()-interval '2 minutes', expires_at=now()-interval '1 minute' WHERE id=?", expired)
        jdbc.update("ALTER TABLE capability_kill_switches ENABLE TRIGGER trg_enforce_kill_switch_lifecycle")
        setState("PROFILE_CONTENT", CapabilityState.ACTIVE)
        capabilities.decide("PROFILE_CONTENT", "READ", CapabilityActor.Internal(admin()))
        assertThrows(CapabilityConfigInvalid::class.java) { capabilities.changeState(admin(), "FAVORITES", CapabilityState.ACTIVE, jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='FAVORITES'", Int::class.java), "nope", UUID.randomUUID()) }
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='FAVORITES'", String::class.java))
    }

    private fun activate(module: String) = setState(module, CapabilityState.ACTIVE)

    private fun setState(module: String, state: CapabilityState) {
        val current = jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code=?", String::class.java, module)
        if (current == state.name) return
        if (current == "ERROR" && state != CapabilityState.ERROR && state != CapabilityState.PAUSED && state != CapabilityState.DISABLED) {
            setState(module, CapabilityState.DISABLED)
        }
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code=?", Int::class.java, module)
        capabilities.changeState(admin(), module, state, version, "test-$state", UUID.randomUUID())
    }

    private fun admin() = InternalUserPrincipal(adminSessionId, adminId, setOf(InternalRole.ADMIN))

    private fun createSession(userId: Long): UUID = UUID.randomUUID().also { sessionId ->
        jdbc.update(
            """INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,idle_expires_at,absolute_expires_at)
               VALUES(?,'USER',?,repeat(replace(?::text,'-',''),2),clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '12 hours')""",
            sessionId, userId, sessionId,
        )
    }

    private fun <T> withRuntimeCapabilities(block: (JdbcCapabilityService, JdbcTemplate) -> T): T {
        val dataSource = SingleConnectionDataSource(postgres.jdbcUrl, postgres.username, postgres.password, true)
        val runtimeJdbc = JdbcTemplate(dataSource)
        return try {
            runtimeJdbc.execute("SET ROLE storecore_runtime")
            block(JdbcCapabilityService(runtimeJdbc), runtimeJdbc)
        } finally {
            runtimeJdbc.execute("RESET ROLE")
            dataSource.destroy()
        }
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        private lateinit var jdbc: JdbcTemplate
        private lateinit var capabilities: JdbcCapabilityService
        private var adminId: Long = 0
        private lateinit var adminSessionId: UUID

        @JvmStatic
        @BeforeAll
        fun startDatabase() {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
            jdbc = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
            capabilities = JdbcCapabilityService(jdbc)
            val hash = Argon2PasswordHasher().hash("a-very-long-password".toCharArray())
            adminId = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id", Long::class.java, "capability-admin@example.com", hash)!!
            jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
            adminSessionId = UUID.randomUUID()
            jdbc.update(
                """INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,idle_expires_at,absolute_expires_at)
                   VALUES(?,'USER',?,repeat(replace(?::text,'-',''),2),clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '12 hours')""",
                adminSessionId, adminId, adminSessionId,
            )
        }

        @JvmStatic
        @AfterAll
        fun stopDatabase() = postgres.stop()
    }
}
