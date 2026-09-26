package com.storecore.commerce

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
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
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
class OfferHttpIntegrationTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val passwords: com.storecore.identity.infrastructure.security.Argon2PasswordHasher,
    @LocalServerPort private val port: Int,
) {
    private lateinit var admin: Session
    private lateinit var customer: Session

    @BeforeEach
    fun seed() {
        admin = provisionAdmin("admin-${UUID.randomUUID()}@example.com")
        customer = registerCustomer("shopper-${UUID.randomUUID()}@example.com")
        activate("CATALOG")
    }

    @Test
    fun `active percent offer prices the cart and does not write channel price policies`() {
        val sku = "SKU-OFFER-${UUID.randomUUID()}"
        putProduct(sku, "Offer Item")
        val policies = policyCount()
        val starts = Instant.now().minus(1, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS)
        val ends = Instant.now().plus(6, ChronoUnit.HOURS).truncatedTo(ChronoUnit.SECONDS)
        val created = exchange(
            "/api/v1/user/offers",
            HttpMethod.POST,
            offerBody("Twenty $sku", "ACTIVE", starts, ends, sku),
            admin.cookie,
            admin.csrf,
        )
        assertEquals(200, created.statusCode.value(), created.body)
        val offerId = Regex(""""id"\s*:\s*"(\d+)"""").find(created.body!!)!!.groupValues[1]
        assertTrue(created.body!!.contains("\"discountType\":\"PERCENT\""))
        assertTrue(created.body!!.contains("\"approvedBy\":\"${adminUserId()}\""))
        assertTrue(created.body!!.contains("\"status\":\"ACTIVE\""))
        assertEquals(policies, policyCount())
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE event_type='OFFER_SAVED' AND aggregate_type='offers'", Int::class.java))
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        admin = admin.copy(csrf = created.headers.getFirst("X-CSRF-Token")!!)

        val listed = exchange("/api/v1/user/offers", HttpMethod.GET, null, admin.cookie)
        assertEquals(200, listed.statusCode.value(), listed.body)
        assertTrue(listed.body!!.contains("\"id\":\"$offerId\""))
        assertTrue(listed.body!!.contains(sku))
        assertTrue(listed.body!!.contains("\"minMarginPercent\""))

        val added = exchange("/api/v1/customer/cart/items", HttpMethod.PUT, """{"sku":"$sku","quantity":1}""", customer.cookie, customer.csrf)
        assertEquals(200, added.statusCode.value(), added.body)
        assertTrue(added.body!!.contains("\"effectiveUnitPrice\":80"), added.body)
        assertTrue(added.body!!.contains("\"offerRef\":\"$offerId\""), added.body)
        customer = customer.copy(csrf = added.headers.getFirst("X-CSRF-Token")!!)

        val paused = exchange(
            "/api/v1/user/offers/$offerId/status",
            HttpMethod.POST,
            """{"status":"PAUSED"}""",
            admin.cookie,
            admin.csrf,
        )
        assertEquals(200, paused.statusCode.value(), paused.body)
        assertTrue(paused.body!!.contains("\"status\":\"PAUSED\""), paused.body)
        assertEquals(policies, policyCount())
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE event_type='OFFER_STATUS_CHANGED' AND aggregate_type='offers'", Int::class.java))
        admin = admin.copy(csrf = paused.headers.getFirst("X-CSRF-Token")!!)

        val repriced = exchange("/api/v1/customer/cart/items", HttpMethod.PUT, """{"sku":"$sku","quantity":1}""", customer.cookie, customer.csrf)
        assertEquals(200, repriced.statusCode.value(), repriced.body)
        assertTrue(repriced.body!!.contains("\"effectiveUnitPrice\":100"), repriced.body)
        assertFalse(repriced.body!!.contains("\"offerRef\":\"$offerId\""), repriced.body)

        val unknown = exchange(
            "/api/v1/user/offers",
            HttpMethod.POST,
            offerBody("Missing $sku", "ACTIVE", starts, ends, "NO-SUCH-${UUID.randomUUID()}"),
            admin.cookie,
            admin.csrf,
        )
        assertEquals(404, unknown.statusCode.value(), unknown.body)
        admin = admin.copy(csrf = unknown.headers.getFirst("X-CSRF-Token") ?: admin.csrf)

        val closed = exchange(
            "/api/v1/user/offers",
            HttpMethod.POST,
            offerBody("Closed $sku", "ACTIVE", ends, starts, sku),
            admin.cookie,
            admin.csrf,
        )
        assertEquals(400, closed.statusCode.value(), closed.body)
        assertEquals(policies, policyCount())
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM offers WHERE name LIKE 'Missing %' OR name LIKE 'Closed %'", Int::class.java))

        val draft = exchange(
            "/api/v1/user/offers",
            HttpMethod.POST,
            offerBody("Draft $sku", "DRAFT", starts, ends, sku),
            admin.cookie,
            admin.csrf,
        )
        assertEquals(200, draft.statusCode.value(), draft.body)
        assertTrue(draft.body!!.contains("\"status\":\"DRAFT\""))
        assertTrue(draft.body!!.contains("\"approvedBy\":null"))
        assertEquals(policies, policyCount())
    }

    private fun offerBody(name: String, status: String, starts: Instant, ends: Instant, sku: String) =
        """{"name":"$name","status":"$status","priority":10,"startsAt":"$starts","endsAt":"$ends","discountType":"PERCENT","discountValue":20,"minMarginPercent":0,"skus":["$sku"]}"""

    private fun policyCount() = jdbc.queryForObject("SELECT COUNT(*) FROM channel_price_policies", Int::class.java)

    private fun putProduct(sku: String, name: String) {
        val body = """{"sku":"$sku","name":"$name","description":"$name","brand":"Tools","category":"Hand","images":[],"variants":[{"sku":"$sku","name":"$name","availableQuantity":10}],"price":{"base":100,"effective":100,"priceVersion":"v1"},"active":true}"""
        val saved = exchange("/api/v1/user/catalog/products/$sku", HttpMethod.PUT, body, admin.cookie, admin.csrf)
        assertEquals(200, saved.statusCode.value(), saved.body)
        admin = admin.copy(csrf = saved.headers.getFirst("X-CSRF-Token")!!)
    }

    private fun activate(module: String) {
        val state = jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code=?", String::class.java, module)
        if (state == "ACTIVE") return
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code=?", Int::class.java, module)
        jdbc.query("SELECT capability_admin_change_configuration(?,?,?,?,?::jsonb,?,?)", { _, _ -> }, adminUserId(), module, version, "ACTIVE", "{}", UUID.randomUUID(), "test")
    }

    private fun provisionAdmin(email: String): Session {
        val hash = passwords.hash("a-very-long-password".toCharArray())
        val userId = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id", Long::class.java, email, hash)
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", userId)
        val login = exchange("/api/v1/internal/auth/login", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password"}""")
        val cookie = login.headers.getFirst(HttpHeaders.SET_COOKIE) ?: error("admin login ${login.statusCode} ${login.body}")
        val csrf = login.headers.getFirst("X-CSRF-Token") ?: error("admin login missing csrf ${login.statusCode} ${login.body}")
        return Session(cookie.substringBefore(';'), csrf)
    }

    private fun registerCustomer(email: String): Session {
        val registered = exchange("/api/v1/customer/auth/register", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password","firstName":"Person","lastName":"One"}""")
        return Session(registered.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'), registered.headers.getFirst("X-CSRF-Token")!!)
    }

    private fun adminUserId() = jdbc.queryForObject("SELECT id FROM users WHERE email LIKE 'admin-%' ORDER BY id DESC LIMIT 1", Long::class.java)!!

    private fun exchange(path: String, method: HttpMethod, body: String?, cookie: String? = null, csrf: String? = null) = http.exchange(
        URI("http://localhost:$port$path"), method,
        HttpEntity(body, HttpHeaders().apply {
            contentType = MediaType.APPLICATION_JSON
            set(HttpHeaders.ORIGIN, "http://localhost:4200")
            cookie?.let { set(HttpHeaders.COOKIE, it) }
            csrf?.let { set("X-CSRF-Token", it) }
        }), String::class.java,
    )

    private data class Session(val cookie: String, val csrf: String)

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @DynamicPropertySource
        fun database(registry: DynamicPropertyRegistry) {
            postgres.start()
            registry.add("spring.datasource.url") { postgres.jdbcUrl }
            registry.add("spring.datasource.username") { postgres.username }
            registry.add("spring.datasource.password") { postgres.password }
        }
    }
}
