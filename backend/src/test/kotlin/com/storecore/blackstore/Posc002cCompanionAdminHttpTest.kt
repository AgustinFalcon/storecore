package com.storecore.blackstore

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.configuration.CapabilityAdminTestSupport
import com.storecore.configuration.domain.CapabilityState
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import java.net.URI
import java.util.UUID

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
class Posc002cCompanionAdminHttpTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val passwords: Argon2PasswordHasher,
    @Autowired private val mapper: ObjectMapper,
    @LocalServerPort private val port: Int,
) {
    @Test
    fun pairReplayStatusAndCustomerStayClosed() {
        revokeLive()
        val admin = loginAdmin("pair-admin-${System.nanoTime()}@example.com")
        val client = UUID.randomUUID()
        val correlation = UUID.randomUUID()
        val body = """{"clientInstanceId":"$client","scopes":["catalog:read","stock:read"],"reason":"pair http","correlationId":"$correlation"}"""
        val first = exchange("/api/v1/internal/admin/blackstore-companion/pair", HttpMethod.POST, body, admin.cookie, admin.csrf)
        assertEquals(200, first.statusCode.value(), first.body)
        val firstJson = mapper.readTree(first.body)
        assertEquals(200, firstJson["code"].asInt())
        assertEquals(first.statusCode.value(), firstJson["code"].asInt())
        val bearer = firstJson["data"]["bearer"].asText()
        assertEquals(64, bearer.length)
        assertFalse(first.body!!.contains("synthetic:", ignoreCase = true))
        val replay = exchange("/api/v1/internal/admin/blackstore-companion/pair", HttpMethod.POST, body, admin.cookie, first.headers.getFirst("X-CSRF-Token"))
        assertEquals(200, replay.statusCode.value(), replay.body)
        val replayJson = mapper.readTree(replay.body)
        assertEquals(200, replayJson["code"].asInt())
        assertFalse(replayJson["data"].has("bearer"))
        val status = exchange("/api/v1/internal/admin/blackstore-companion/commands/$correlation", HttpMethod.GET, null, admin.cookie)
        assertEquals(200, status.statusCode.value(), status.body)
        val statusJson = mapper.readTree(status.body)
        assertEquals(200, statusJson["code"].asInt())
        assertEquals("COMPLETED", statusJson["data"]["commandState"].asText())
        assertFalse(status.body!!.contains("bearer", ignoreCase = true))
        assertFalse(status.body!!.contains("synthetic:", ignoreCase = true))
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))

        val customer = exchange(
            "/api/v1/customer/auth/register",
            HttpMethod.POST,
            """{"email":"cust-${System.nanoTime()}@example.com","password":"a-very-long-password","firstName":"C","lastName":"Ust"}""",
        )
        val denied = exchange(
            "/api/v1/internal/admin/blackstore-companion/pair",
            HttpMethod.POST,
            """{"clientInstanceId":"${UUID.randomUUID()}","scopes":["catalog:read"],"reason":"no","correlationId":"${UUID.randomUUID()}"}""",
            customer.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'),
            customer.headers.getFirst("X-CSRF-Token"),
        )
        assertTrue(denied.statusCode.value() == 401 || denied.statusCode.value() == 403, denied.body)
        assertEquals(denied.statusCode.value(), mapper.readTree(denied.body)["code"].asInt())
    }

    @Test
    fun activateNeedsCapabilityThenRestoresDisabled() {
        revokeLive()
        val admin = loginAdmin("act-admin-${System.nanoTime()}@example.com")
        val pair = exchange(
            "/api/v1/internal/admin/blackstore-companion/pair",
            HttpMethod.POST,
            """{"clientInstanceId":"${UUID.randomUUID()}","scopes":["catalog:read"],"reason":"activar luego","correlationId":"${UUID.randomUUID()}"}""",
            admin.cookie,
            admin.csrf,
        )
        assertEquals(200, pair.statusCode.value(), pair.body)
        val companionId = mapper.readTree(pair.body)["data"]["companionId"].asLong()
        var csrf = pair.headers.getFirst("X-CSRF-Token")!!
        val aborted = exchange(
            "/api/v1/internal/admin/blackstore-companion/activate",
            HttpMethod.POST,
            """{"companionId":$companionId,"expectedState":"DISABLED","expectedCredentialVersion":1,"reason":"sin capability","correlationId":"${UUID.randomUUID()}"}""",
            admin.cookie,
            csrf,
        )
        assertEquals(409, aborted.statusCode.value(), aborted.body)
        val abortedJson = mapper.readTree(aborted.body)
        assertEquals(409, abortedJson["code"].asInt())
        assertEquals("COMPANION_ADMIN_COMMAND_ABORTED", abortedJson["errorCode"].asText())
        assertNotNull(abortedJson["traceId"].asText())
        assertEquals("DISABLED", jdbc.queryForObject("SELECT status FROM blackstore_companions WHERE id=?", String::class.java, companionId))
        csrf = exchange("/api/v1/internal/auth/csrf", HttpMethod.GET, null, admin.cookie).headers.getFirst("X-CSRF-Token")!!
        activateCapability(CapabilityState.ACTIVE)
        try {
            val activated = exchange(
                "/api/v1/internal/admin/blackstore-companion/activate",
                HttpMethod.POST,
                """{"companionId":$companionId,"expectedState":"DISABLED","expectedCredentialVersion":1,"reason":"con capability","correlationId":"${UUID.randomUUID()}"}""",
                admin.cookie,
                csrf,
            )
            assertEquals(200, activated.statusCode.value(), activated.body)
            assertEquals("ACTIVE", jdbc.queryForObject("SELECT status FROM blackstore_companions WHERE id=?", String::class.java, companionId))
            csrf = activated.headers.getFirst("X-CSRF-Token")!!
            val revoked = exchange(
                "/api/v1/internal/admin/blackstore-companion/revoke",
                HttpMethod.POST,
                """{"companionId":$companionId,"expectedState":"ACTIVE","expectedCredentialVersion":1,"reason":"cerrar","correlationId":"${UUID.randomUUID()}"}""",
                admin.cookie,
                csrf,
            )
            assertEquals(200, revoked.statusCode.value(), revoked.body)
            assertEquals("REVOKED", jdbc.queryForObject("SELECT status FROM blackstore_companions WHERE id=?", String::class.java, companionId))
        } finally {
            activateCapability(CapabilityState.DISABLED)
        }
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
    }

    private data class Session(val cookie: String, val csrf: String)

    private fun loginAdmin(email: String): Session {
        val hash = passwords.hash("a-very-long-password".toCharArray())
        val userId = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id", Long::class.java, email, hash)
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", userId)
        val login = exchange("/api/v1/internal/auth/login", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password"}""")
        assertEquals(200, login.statusCode.value(), login.body)
        return Session(login.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'), login.headers.getFirst("X-CSRF-Token")!!)
    }

    private fun revokeLive() {
        jdbc.update("UPDATE blackstore_companion_credentials SET status='REVOKED', revoked_at=clock_timestamp() WHERE status='ACTIVE'")
        jdbc.update("UPDATE blackstore_companions SET status='REVOKED', revoked_at=clock_timestamp() WHERE status<>'REVOKED'")
    }

    private fun activateCapability(state: CapabilityState) {
        val adminId = jdbc.queryForObject("SELECT id FROM users ORDER BY id LIMIT 1", Long::class.java)!!
        jdbc.update(
            """UPDATE module_configurations
               SET state=?, config_version=config_version+1, updated_by=?, updated_at=clock_timestamp()
               WHERE module_code='BLACKSTORE_INTEGRATION' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'""",
            state.name,
            adminId,
        )
    }

    private fun exchange(path: String, method: HttpMethod, body: String?, cookie: String? = null, csrf: String? = null) = http.exchange(
        URI("http://localhost:$port$path"),
        method,
        HttpEntity(body, HttpHeaders().apply {
            contentType = MediaType.APPLICATION_JSON
            set(HttpHeaders.ORIGIN, "http://localhost:4200")
            cookie?.let { set(HttpHeaders.COOKIE, it) }
            csrf?.let { set("X-CSRF-Token", it) }
        }),
        String::class.java,
    )

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @DynamicPropertySource
        fun database(registry: DynamicPropertyRegistry) {
            postgres.start()
            org.flywaydb.core.Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
            CapabilityAdminTestSupport.provisionLogin(postgres)
            CompanionAdminTestSupport.provisionLogin(postgres)
            registry.add("spring.datasource.url") { postgres.jdbcUrl }
            registry.add("spring.datasource.username") { postgres.username }
            registry.add("spring.datasource.password") { postgres.password }
            registry.add("storecore.capability-admin.datasource.url") { postgres.jdbcUrl }
            registry.add("storecore.capability-admin.datasource.username") { CapabilityAdminTestSupport.LOGIN }
            registry.add("storecore.capability-admin.datasource.password") { CapabilityAdminTestSupport.PASSWORD }
            registry.add("storecore.companion-admin.datasource.url") { postgres.jdbcUrl }
            registry.add("storecore.companion-admin.datasource.username") { CompanionAdminTestSupport.LOGIN }
            registry.add("storecore.companion-admin.datasource.password") { CompanionAdminTestSupport.PASSWORD }
        }
    }
}
