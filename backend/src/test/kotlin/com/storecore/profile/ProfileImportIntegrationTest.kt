package com.storecore.profile

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.ProfileRejected
import com.storecore.commerce.infrastructure.JdbcProfileService
import com.storecore.configuration.domain.CapabilityState
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
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import org.springframework.dao.DataIntegrityViolationException
import java.util.UUID

class ProfileImportIntegrationTest {
    @Test
    fun `preview diffs against installed content and rejects incompatible profile versions`() {
        val key = uniqueKey("hero")
        jdbc.update("INSERT INTO home_content_sections(section_key,content,active,sort_order) VALUES (?,?::jsonb,true,0)", key, """{"title":"Current"}""")
        val manifest = manifest(key, """{"title":"Incoming"}""")
        val preview = service.preview(actor, manifest)
        assertTrue(preview.compatible)
        assertTrue(preview.diff.contains("\"operation\":\"UPDATE\""))
        assertTrue(preview.diff.contains("\"title\":\"Current\""))
        assertTrue(preview.diff.contains("\"title\":\"Incoming\""))

        val incompatible = service.preview(actor, manifest(key, """{"title":"Incoming"}""", profileVersion = "2.0.0"))
        assertFalse(incompatible.compatible)
        assertThrows(ProfileRejected::class.java) {
            service.merge(actor, manifest(key, """{"title":"Incoming"}""", profileVersion = "2.0.0", selection = true))
        }
    }

    @Test
    fun `merge requires explicit selection and applies only selected home sections atomically with audit`() {
        val selected = uniqueKey("selected")
        val untouched = uniqueKey("untouched")
        jdbc.update("INSERT INTO home_content_sections(section_key,content,active,sort_order) VALUES (?,?::jsonb,true,0)", selected, """{"title":"Before"}""")
        jdbc.update("INSERT INTO home_content_sections(section_key,content,active,sort_order) VALUES (?,?::jsonb,true,1)", untouched, """{"title":"Keep"}""")
        val input = """{"profile_name":"universal-tools-profile","profile_version":"1.0.0","coreCompatibility":"1.x","content":{"homeSections":[{"sectionKey":"$selected","content":{"title":"After"},"active":false,"sortOrder":2},{"sectionKey":"$untouched","content":{"title":"Must not apply"},"active":true,"sortOrder":3}]}}"""
        assertThrows(ProfileRejected::class.java) { service.merge(actor, input) }

        val beforeImports = jdbc.queryForObject("SELECT COUNT(*) FROM universal_profile_imports", Int::class.java)!!
        val beforeAudits = jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE event_type='PROFILE_MERGED'", Int::class.java)!!
        val result = service.merge(actor, withSelection(input, listOf(selected)))
        assertTrue(result.compatible)
        assertTrue(result.diff.contains("\"sectionKey\":\"$selected\""))
        assertEquals("After", jdbc.queryForObject("SELECT content->>'title' FROM home_content_sections WHERE section_key=?", String::class.java, selected))
        assertEquals(false, jdbc.queryForObject("SELECT active FROM home_content_sections WHERE section_key=?", Boolean::class.java, selected))
        assertEquals(2, jdbc.queryForObject("SELECT sort_order FROM home_content_sections WHERE section_key=?", Int::class.java, selected))
        assertEquals("Keep", jdbc.queryForObject("SELECT content->>'title' FROM home_content_sections WHERE section_key=?", String::class.java, untouched))
        assertEquals(beforeImports + 1, jdbc.queryForObject("SELECT COUNT(*) FROM universal_profile_imports", Int::class.java))
        assertEquals(beforeAudits + 1, jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE event_type='PROFILE_MERGED'", Int::class.java))
        val selection = jdbc.queryForObject("SELECT merge_selection FROM universal_profile_imports ORDER BY id DESC LIMIT 1", String::class.java)!!
        assertTrue(selection.contains(selected))
        assertFalse(selection.contains(untouched))
    }

    @Test
    fun `secret and unknown keys fail closed without writes`() {
        val before = jdbc.queryForObject("SELECT COUNT(*) FROM universal_profile_imports", Int::class.java)
        assertEquals("PROFILE_SECRET_REJECTED", assertThrows(ProfileRejected::class.java) {
            service.preview(actor, """{"profile_name":"universal-tools-profile","profile_version":"1.0.0","coreCompatibility":"1.x","content":{"homeSections":[{"sectionKey":"hero","content":{"oauthToken":"secret"}}]}}""")
        }.message)
        assertThrows(ProfileRejected::class.java) {
            service.preview(actor, """{"profile_name":"universal-tools-profile","profile_version":"1.0.0","coreCompatibility":"1.x","featureFlags":{"x":true}}""")
        }
        assertEquals(before, jdbc.queryForObject("SELECT COUNT(*) FROM universal_profile_imports", Int::class.java))
    }

    @Test
    fun `failed audit rolls back content and import record together`() {
        val key = uniqueKey("rollback")
        val input = withSelection(manifest(key, """{"title":"Must rollback"}"""), listOf(key))
        val beforeImports = jdbc.queryForObject("SELECT COUNT(*) FROM universal_profile_imports", Int::class.java)!!
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT ck_test_reject_profile_merge CHECK (event_type <> 'PROFILE_MERGED') NOT VALID")
        try {
            assertThrows(DataIntegrityViolationException::class.java) { service.merge(actor, input) }
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM home_content_sections WHERE section_key=?", Int::class.java, key))
            assertEquals(beforeImports, jdbc.queryForObject("SELECT COUNT(*) FROM universal_profile_imports", Int::class.java))
        } finally {
            jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT ck_test_reject_profile_merge")
        }
    }

    private fun manifest(key: String, content: String, profileVersion: String = "1.0.0", selection: Boolean = false): String {
        val select = if (selection) ""","mergeSelection":{"homeSections":["$key"]}""" else ""
        return """{"profile_name":"universal-tools-profile","profile_version":"$profileVersion","coreCompatibility":"1.x","content":{"homeSections":[{"sectionKey":"$key","content":$content}]}$select}"""
    }

    private fun withSelection(input: String, keys: List<String>): String {
        val root = mapper.readTree(input) as com.fasterxml.jackson.databind.node.ObjectNode
        root.set<com.fasterxml.jackson.databind.node.ObjectNode>("mergeSelection", mapper.createObjectNode().set<com.fasterxml.jackson.databind.node.ArrayNode>("homeSections", mapper.valueToTree(keys)))
        return mapper.writeValueAsString(root)
    }

    private fun uniqueKey(prefix: String) = "${prefix}-${UUID.randomUUID().toString().replace("-", "").take(12)}"

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        private lateinit var jdbc: JdbcTemplate
        private lateinit var service: JdbcProfileService
        private lateinit var mapper: ObjectMapper
        private lateinit var actor: InternalUserPrincipal

        @JvmStatic
        @BeforeAll
        fun startDatabase() {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
            jdbc = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
            mapper = ObjectMapper().findAndRegisterModules()
            val hash = Argon2PasswordHasher().hash("a-long-test-password".toCharArray())
            val actorId = jdbc.queryForObject(
                "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Profile','Admin') RETURNING id",
                Long::class.java, "profile-admin@example.com", hash,
            )!!
            jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='ADMIN'", actorId)
            val sessionId = UUID.randomUUID()
            jdbc.update(
                """INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,idle_expires_at,absolute_expires_at)
                   VALUES(?,'USER',?,repeat(replace(?::text,'-',''),2),clock_timestamp()+interval '30 minutes',clock_timestamp()+interval '12 hours')""",
                sessionId, actorId, sessionId,
            )
            actor = InternalUserPrincipal(sessionId, actorId, setOf(InternalRole.ADMIN))
            val capabilities = JdbcCapabilityService(jdbc)
            val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='PROFILE_CONTENT'", Int::class.java)!!
            capabilities.changeState(actor, "PROFILE_CONTENT", CapabilityState.ACTIVE, version, "profile import test", UUID.randomUUID())
            service = JdbcProfileService(jdbc, mapper, capabilities)
        }

        @JvmStatic
        @AfterAll
        fun stopDatabase() = postgres.stop()
    }
}
