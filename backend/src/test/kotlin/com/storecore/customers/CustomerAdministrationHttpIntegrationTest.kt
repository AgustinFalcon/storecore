package com.storecore.customers

import com.storecore.identity.application.AuthenticationFailed
import com.storecore.identity.application.IdentityUseCases
import com.storecore.identity.domain.IdentityRealm
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
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
class CustomerAdministrationHttpIntegrationTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val context: org.springframework.context.ApplicationContext,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val passwords: com.storecore.identity.infrastructure.security.Argon2PasswordHasher,
    @Autowired private val identity: IdentityUseCases,
    @LocalServerPort private val port: Int,
) {
    @Test
    fun `enabled identity registers authenticated projection adapters`() {
        listOf(
            com.storecore.customers.infrastructure.CustomerAdministrationController::class.java,
            com.storecore.customers.infrastructure.JdbcCustomerAdministrationRepository::class.java,
            com.storecore.favorites.infrastructure.FavoriteController::class.java,
            com.storecore.favorites.infrastructure.JdbcFavoriteRepository::class.java,
            com.storecore.offers.infrastructure.OfferController::class.java,
            com.storecore.offers.infrastructure.JdbcOfferRepository::class.java,
            com.storecore.overview.infrastructure.OverviewController::class.java,
            com.storecore.overview.infrastructure.JdbcOverviewRepository::class.java,
        ).forEach { type -> assertNotNull(context.getBean(type), type.simpleName) }
    }
    @Test
    fun `purpose limited reads authorize operator while only admin suspends and old sessions stay revoked`() {
        val admin = internalSession("customer-admin-${UUID.randomUUID()}@example.com", "ADMIN")
        val operator = internalSession("customer-operator-${UUID.randomUUID()}@example.com", "OPERATOR")
        val email = "managed-${UUID.randomUUID()}@example.com"
        val customer = register(email)
        val second = customerLogin(email)
        val customerId = jdbc.queryForObject("SELECT id FROM customers WHERE email=?", Long::class.java, email)!!

        val operatorList = exchange("/api/v1/user/customers?query=managed&state=ACTIVE&page=0", HttpMethod.GET, null, operator.cookie)
        assertEquals(200, operatorList.statusCode.value(), operatorList.body)
        assertTrue(operatorList.body!!.contains(email) && operatorList.body!!.contains("\"pageSize\":25"))
        assertFalse(operatorList.body!!.contains("password", true) || operatorList.body!!.contains("session", true) || operatorList.body!!.contains("address", true))
        val detail = exchange("/api/v1/user/customers/$customerId", HttpMethod.GET, null, admin.cookie)
        assertEquals(200, detail.statusCode.value())
        assertTrue(detail.body!!.contains("\"orderCount\":0") && detail.body!!.contains("\"lastOrderAt\":null"))

        val operatorDenied = exchange("/api/v1/user/customers/$customerId/state", HttpMethod.POST, """{"state":"SUSPENDED"}""", operator.cookie, operator.csrf)
        assertEquals(403, operatorDenied.statusCode.value())
        val suspended = exchange("/api/v1/user/customers/$customerId/state", HttpMethod.POST, """{"state":"SUSPENDED"}""", admin.cookie, admin.csrf)
        assertEquals(200, suspended.statusCode.value(), suspended.body)
        assertTrue(suspended.body!!.contains("\"state\":\"SUSPENDED\""))
        val nextCsrf = suspended.headers.getFirst("X-CSRF-Token")
        assertNotNull(nextCsrf)
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM identity_sessions WHERE customer_id=? AND revoked_at IS NULL AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp()", Int::class.java, customerId))
        assertEquals(401, exchange("/api/v1/customer/me", HttpMethod.GET, null, customer.cookie).statusCode.value())
        assertEquals(401, exchange("/api/v1/customer/me", HttpMethod.GET, null, second.cookie).statusCode.value())

        val reactivated = exchange("/api/v1/user/customers/$customerId/state", HttpMethod.POST, """{"state":"ACTIVE"}""", admin.cookie, nextCsrf)
        assertEquals(200, reactivated.statusCode.value())
        assertEquals(401, exchange("/api/v1/customer/me", HttpMethod.GET, null, customer.cookie).statusCode.value())
        assertEquals(200, customerLogin(email).status)
        val payload = jdbc.queryForObject("SELECT payload_redacted::text FROM audit_events WHERE event_type='CUSTOMER_ACCOUNT_STATE_REQUESTED' AND aggregate_id=? ORDER BY id DESC LIMIT 1", String::class.java, customerId)!!
        assertFalse(payload.contains(email) || payload.contains("token", true))
    }

    @Test
    fun `audit failure rolls back suspension and every session revocation`() {
        val admin = internalSession("rollback-admin-${UUID.randomUUID()}@example.com", "ADMIN")
        val email = "rollback-managed-${UUID.randomUUID()}@example.com"
        val customer = register(email)
        val customerId = jdbc.queryForObject("SELECT id FROM customers WHERE email=?", Long::class.java, email)!!
        jdbc.execute("ALTER TABLE audit_events ADD CONSTRAINT ck_test_customer_state_audit_fail CHECK (event_type <> 'CUSTOMER_ACCOUNT_STATE_REQUESTED') NOT VALID")
        try {
            val failed = exchange("/api/v1/user/customers/$customerId/state", HttpMethod.POST, """{"state":"SUSPENDED"}""", admin.cookie, admin.csrf)
            assertEquals(500, failed.statusCode.value())
        } finally {
            jdbc.execute("ALTER TABLE audit_events DROP CONSTRAINT ck_test_customer_state_audit_fail")
        }
        assertEquals(true, jdbc.queryForObject("SELECT active FROM customers WHERE id=?", Boolean::class.java, customerId))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM identity_sessions WHERE customer_id=? AND revoked_at IS NULL", Int::class.java, customerId))
        assertEquals(200, exchange("/api/v1/customer/me", HttpMethod.GET, null, customer.cookie).statusCode.value())
    }

    @Test
    fun `session issuance rechecks customer after compatible row lock`() {
        val email = "race-managed-${UUID.randomUUID()}@example.com"
        register(email)
        val customerId = jdbc.queryForObject("SELECT id FROM customers WHERE email=?", Long::class.java, email)!!
        val executor = java.util.concurrent.Executors.newSingleThreadExecutor()
        try {
            jdbc.dataSource!!.connection.use { blocker ->
                blocker.autoCommit = false
                blocker.prepareStatement("SELECT id FROM customers WHERE id=? FOR UPDATE").use {
                    it.setLong(1, customerId)
                    it.executeQuery().close()
                }
                val future = executor.submit<Any> { identity.login(IdentityRealm.CUSTOMER, email, "a-very-long-password", "race-test") }
                Thread.sleep(500)
                assertFalse(future.isDone)
                blocker.prepareStatement("UPDATE customers SET active=false WHERE id=?").use { it.setLong(1, customerId); it.executeUpdate() }
                blocker.commit()
                val error = assertThrows(java.util.concurrent.ExecutionException::class.java) { future.get(10, java.util.concurrent.TimeUnit.SECONDS) }
                assertTrue(error.cause is AuthenticationFailed)
            }
        } finally {
            executor.shutdownNow()
            jdbc.update("UPDATE customers SET active=true WHERE id=?", customerId)
        }
    }

    private fun register(email: String): Session {
        val response = exchange("/api/v1/customer/auth/register", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password","firstName":"Managed","lastName":"Customer"}""")
        return Session(response.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'), response.headers.getFirst("X-CSRF-Token")!!, response.statusCode.value())
    }

    private fun customerLogin(email: String): Session {
        val response = exchange("/api/v1/customer/auth/login", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password"}""")
        return Session(response.headers.getFirst(HttpHeaders.SET_COOKIE)?.substringBefore(';').orEmpty(), response.headers.getFirst("X-CSRF-Token").orEmpty(), response.statusCode.value())
    }

    private fun internalSession(email: String, role: String): Session {
        val userId = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Internal','User') RETURNING id", Long::class.java, email, passwords.hash("a-very-long-password".toCharArray()))!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?", userId, role)
        val response = exchange("/api/v1/internal/auth/login", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password"}""")
        return Session(response.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'), response.headers.getFirst("X-CSRF-Token")!!, response.statusCode.value())
    }

    private fun exchange(path: String, method: HttpMethod, body: String?, cookie: String? = null, csrf: String? = null) = http.exchange(
        URI("http://localhost:$port$path"), method,
        HttpEntity(body, HttpHeaders().apply {
            contentType = MediaType.APPLICATION_JSON
            set(HttpHeaders.ORIGIN, "http://localhost:4200")
            cookie?.let { set(HttpHeaders.COOKIE, it) }
            csrf?.let { set("X-CSRF-Token", it) }
        }), String::class.java,
    )

    private data class Session(val cookie: String, val csrf: String, val status: Int)

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
