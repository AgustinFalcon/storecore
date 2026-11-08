package com.storecore.commerce

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.infrastructure.mporders.MpOrdersAdapterMode
import com.storecore.commerce.infrastructure.mporders.ShowcaseExternalCapability
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.domain.InstallationCapabilityModule
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.http.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import java.net.URI
import java.util.UUID

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
class ShowcaseSafetyHttpIntegrationTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val passwords: Argon2PasswordHasher,
    @Autowired private val json: ObjectMapper,
    @LocalServerPort private val port: Int,
) {
    @Test
    fun `only ADMIN can read the minimal noncacheable safety projection without mutation authority`() {
        val path = "/api/v1/user/showcase-safety"
        assertEquals(401, get(path).statusCode.value())
        val customer = post("/api/v1/customer/auth/register", """{"email":"safety-${UUID.randomUUID()}@example.test","password":"safety-fixture-password","firstName":"Safety","lastName":"Customer"}""")
        assertEquals(201, customer.statusCode.value())
        assertEquals(401, get(path, cookie(customer)).statusCode.value())
        assertEquals(403, get(path, internal(InternalRole.OPERATOR)).statusCode.value())
        val admin = internal(InternalRole.ADMIN)
        // No Origin or CSRF is necessary for this read-only diagnostic.
        val response = get(path, admin)
        assertEquals(200, response.statusCode.value(), response.body)
        assertEquals("no-store", response.headers.cacheControl)
        val payload = json.readTree(response.body).path("data")
        assertEquals(setOf("mpOrdersAdapter", "externalCheckoutDisabled", "externalCapabilities"), payload.fieldNames().asSequence().toSet())
        assertEquals(MpOrdersAdapterMode.UNCONFIGURED, MpOrdersAdapterMode.fromWire(payload.path("mpOrdersAdapter").asText()))
        assertTrue(payload.path("externalCheckoutDisabled").asBoolean())
        val rows = payload.path("externalCapabilities")
        assertEquals(ShowcaseExternalCapability.entries.size, rows.size())
        assertEquals(ShowcaseExternalCapability.entries.map { it.module }.toSet(), rows.map { InstallationCapabilityModule.fromWire(it.path("module").asText()) }.toSet())
        rows.forEach { row ->
            assertEquals(setOf("module", "state"), row.fieldNames().asSequence().toSet())
            assertEquals(CapabilityState.DISABLED, CapabilityState.fromWire(row.path("state").asText()))
        }
        val console = json.readTree(get("/api/v1/user/capabilities", admin).body).path("data")
        assertFalse(console.any { InstallationCapabilityModule.fromWire(it.path("module").asText()) == InstallationCapabilityModule.BlackStoreIntegration })
    }

    private fun internal(role: InternalRole): String {
        val email = "safety-${UUID.randomUUID()}@example.test"
        val id = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Safety','User') RETURNING id", Long::class.java,
            email, passwords.hash("safety-fixture-password".toCharArray()))!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?", id, role.name)
        val response = post("/api/v1/internal/auth/login", """{"email":"$email","password":"safety-fixture-password"}""")
        assertEquals(200, response.statusCode.value(), response.body)
        return cookie(response)
    }
    private fun cookie(response: ResponseEntity<String>) = response.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';')
    private fun get(path: String, cookie: String? = null) = http.exchange(URI("http://localhost:$port$path"), HttpMethod.GET,
        HttpEntity(null, HttpHeaders().apply { cookie?.let { set(HttpHeaders.COOKIE, it) } }), String::class.java)
    private fun post(path: String, body: String) = http.exchange(URI("http://localhost:$port$path"), HttpMethod.POST,
        HttpEntity(body, HttpHeaders().apply { contentType = MediaType.APPLICATION_JSON; set(HttpHeaders.ORIGIN, "http://localhost:4200") }), String::class.java)

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @DynamicPropertySource fun database(registry: DynamicPropertyRegistry) {
            postgres.start()
            registry.add("spring.datasource.url") { postgres.jdbcUrl }
            registry.add("spring.datasource.username") { postgres.username }
            registry.add("spring.datasource.password") { postgres.password }
        }
    }
}
