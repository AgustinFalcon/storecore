package com.storecore.configuration

import com.storecore.configuration.application.CapabilityAdminPayloadConflict
import com.storecore.configuration.application.CapabilityAdminPoolMissing
import com.storecore.configuration.application.CapabilityConfigInvalid
import com.storecore.configuration.application.CapabilityConfigVersionConflict
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.jdbc.core.JdbcTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Posc002bCapabilityTxsTest {
    @Test
    fun adapterCallsTxCNotV3AndMissingPoolLeavesIntent() {
        val source = Files.readString(Path.of("src/main/kotlin/com/storecore/configuration/infrastructure/JdbcCapabilityService.kt"))
        assertTrue(source.contains("capability_tx_c_execute("))
        assertFalse(source.contains("capability_admin_change_configuration("))
        val correlation = UUID.randomUUID()
        val runtimeOnly = JdbcCapabilityService(jdbc)
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='STOREFRONT'", Int::class.java)!!
        assertThrows(CapabilityAdminPoolMissing::class.java) {
            runtimeOnly.changeState(admin(), "STOREFRONT", CapabilityState.ACTIVE, version, "no-pool", correlation)
        }
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM capability_admin_intents WHERE correlation_id=?", Int::class.java, correlation))
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='STOREFRONT'", String::class.java))
    }

    @Test
    fun changeStateReplayAndHashConflict() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='CATALOG'", Int::class.java)!!
        val correlation = UUID.randomUUID()
        capabilities.changeState(admin(), "CATALOG", CapabilityState.ACTIVE, version, "enable", correlation)
        assertEquals("ACTIVE", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='CATALOG'", String::class.java))
        capabilities.changeState(admin(), "CATALOG", CapabilityState.ACTIVE, version, "enable", correlation)
        assertThrows(CapabilityAdminPayloadConflict::class.java) {
            capabilities.changeState(admin(), "CATALOG", CapabilityState.READ_ONLY, version, "other", correlation)
        }
        assertThrows(CapabilityConfigVersionConflict::class.java) {
            capabilities.changeState(admin(), "CATALOG", CapabilityState.READ_ONLY, version, "stale", UUID.randomUUID())
        }
    }

    @Test
    fun blackstoreTxCAbortsAndFavoritesStayDisabled() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", Int::class.java)!!
        assertThrows(CapabilityConfigInvalid::class.java) {
            capabilities.changeState(admin(), "BLACKSTORE_INTEGRATION", CapabilityState.ACTIVE, version, "nope", UUID.randomUUID())
        }
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        val favorites = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='FAVORITES'", Int::class.java)!!
        assertThrows(CapabilityConfigInvalid::class.java) {
            capabilities.changeState(admin(), "FAVORITES", CapabilityState.ACTIVE, favorites, "nope", UUID.randomUUID())
        }
    }

    private fun admin() = InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN))

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        private lateinit var jdbc: JdbcTemplate
        private lateinit var capabilities: JdbcCapabilityService
        private var adminId: Long = 0
        private lateinit var adminSession: UUID

        @JvmStatic
        @BeforeAll
        fun startDatabase() {
            postgres.start()
            val provisioned = CapabilityAdminTestSupport.migrateAndProvision(postgres)
            jdbc = provisioned.first
            capabilities = JdbcCapabilityService(jdbc, provisioned.second)
            val hash = Argon2PasswordHasher().hash("a-very-long-password".toCharArray())
            adminId = jdbc.queryForObject(
                "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id",
                Long::class.java,
                "posc002b-admin@example.com",
                hash,
            )!!
            jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
            adminSession = CapabilityAdminTestSupport.liveAdminSession(jdbc, adminId)
        }

        @JvmStatic
        @AfterAll
        fun stopDatabase() = postgres.stop()
    }
}
