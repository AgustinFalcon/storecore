package com.storecore.identity

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Import
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import java.net.URI

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
class IdentityHttpIntegrationTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: org.springframework.jdbc.core.JdbcTemplate,
    @Autowired private val passwords: com.storecore.identity.infrastructure.security.Argon2PasswordHasher,
    @LocalServerPort private val port: Int,
) {
    @Test
    fun `customer identity uses http-only opaque cookie csrf rotation and owned addresses`() {
        val registered = exchange("/api/v1/customer/auth/register", HttpMethod.POST, """{"email":"person@example.com","password":"a-very-long-password","firstName":"Person","lastName":"One"}""")
        assertEquals(201, registered.statusCode.value())
        val cookie = registered.headers.getFirst(HttpHeaders.SET_COOKIE)
        val initialCsrf = registered.headers.getFirst("X-CSRF-Token")
        assertNotNull(cookie)
        assertNotNull(initialCsrf)
        assertEquals(false, registered.body!!.contains("token", ignoreCase = true))
        assertEquals("no-store", registered.headers.cacheControl)
        val profile = exchange("/api/v1/customer/me", HttpMethod.GET, null, cookie.substringBefore(';'))
        assertEquals(200, profile.statusCode.value())
        assertEquals(true, profile.body!!.contains("person@example.com") && profile.body!!.contains("Person"))
        assertEquals("no-store", profile.headers.cacheControl)
        assertEquals(true, cookie!!.contains("__Host-storecore-customer") && cookie.contains("HttpOnly") && cookie.contains("Secure") && cookie.contains("SameSite=Lax") && !cookie.contains("Domain="))

        val refreshed = exchange("/api/v1/customer/auth/csrf", HttpMethod.GET, null, cookie.substringBefore(';'))
        assertEquals(200, refreshed.statusCode.value())
        val csrf = refreshed.headers.getFirst("X-CSRF-Token")
        assertNotNull(csrf)
        assertEquals(false, csrf == initialCsrf)

        val missingCsrf = exchange("/api/v1/customer/me/addresses", HttpMethod.POST, """{"street":"Main","number":"0","city":"City","province":"Province","postalCode":"1000","isDefault":true}""", cookie.substringBefore(';'))
        assertEquals(403, missingCsrf.statusCode.value())
        assertEquals(true, missingCsrf.body!!.contains("CSRF_INVALID"))
        val address = exchange("/api/v1/customer/me/addresses", HttpMethod.POST, """{"street":"Main","number":"1","city":"City","province":"Province","postalCode":"1000","isDefault":true}""", cookie.substringBefore(';'), csrf)
        assertEquals(200, address.statusCode.value())
        val nextCsrf = address.headers.getFirst("X-CSRF-Token")
        assertNotNull(nextCsrf)
        assertEquals("no-store", address.headers.cacheControl)

        val replay = exchange("/api/v1/customer/me/addresses", HttpMethod.POST, """{"street":"Main","number":"2","city":"City","province":"Province","postalCode":"1000","isDefault":false}""", cookie.substringBefore(';'), csrf)
        assertEquals(403, replay.statusCode.value())
        val addresses = exchange("/api/v1/customer/me/addresses", HttpMethod.GET, null, cookie.substringBefore(';'))
        assertEquals(200, addresses.statusCode.value())
        assertEquals(true, addresses.body!!.contains("Main"))
        val addressId = jdbc.queryForObject("SELECT a.id FROM customer_addresses a JOIN customers c ON c.id=a.customer_id WHERE c.email=?", Long::class.java, "person@example.com")!!
        val deleted = exchange("/api/v1/customer/me/addresses/$addressId", HttpMethod.DELETE, null, cookie.substringBefore(59.toChar()), nextCsrf)
        assertEquals(200, deleted.statusCode.value())
        assertEquals("no-store", deleted.headers.cacheControl)
        assertNotNull(deleted.body)
        val afterDeleteCsrf = deleted.headers.getFirst("X-CSRF-Token")
        assertNotNull(afterDeleteCsrf)

        val wrongRealm = exchange("/api/v1/internal/me", HttpMethod.GET, null, cookie.substringBefore(';'))
        assertEquals(401, wrongRealm.statusCode.value())

        val logout = exchange("/api/v1/customer/auth/logout", HttpMethod.POST, null, cookie.substringBefore(';'), afterDeleteCsrf)
        assertEquals(204, logout.statusCode.value())
        assertEquals("no-store", logout.headers.cacheControl)
        assertEquals(true, logout.headers.getFirst(HttpHeaders.SET_COOKIE)!!.contains("Max-Age=0"))
    }

    @Test
    fun `malformed and invalid auth requests use the response envelope`() {
        val malformed = exchange("/api/v1/customer/auth/login", HttpMethod.POST, "{")
        assertEquals(400, malformed.statusCode.value())
        assertEquals(true, malformed.body!!.contains("REQUEST_MALFORMED"))
        assertEquals("no-store", malformed.headers.cacheControl)

        val invalid = exchange("/api/v1/customer/auth/register", HttpMethod.POST, """{"email":"invalid@example.com","password":"a-very-long-password","firstName":"","lastName":"User"}""")
        assertEquals(400, invalid.statusCode.value())
        assertEquals(true, invalid.body!!.contains("REQUEST_VALIDATION_FAILED"))
        assertEquals("no-store", invalid.headers.cacheControl)
    }

    @Test
    fun `unknown and wrong customer credentials return the same 401`() {
        val missing = exchange("/api/v1/customer/auth/login", HttpMethod.POST, """{"email":"nobody@example.com","password":"a-very-long-password"}""")
        exchange("/api/v1/customer/auth/register", HttpMethod.POST, """{"email":"known@example.com","password":"a-very-long-password","firstName":"Known","lastName":"User"}""")
        val wrong = exchange("/api/v1/customer/auth/login", HttpMethod.POST, """{"email":"known@example.com","password":"wrong-password-xx"}""")
        assertEquals(401, missing.statusCode.value())
        assertEquals(401, wrong.statusCode.value())
        assertEquals(true, missing.body!!.contains("AUTHENTICATION_FAILED"))
        assertEquals(true, wrong.body!!.contains("AUTHENTICATION_FAILED"))
        assertEquals(false, missing.body!!.contains("token", ignoreCase = true))
    }

    @Test
    fun `foreign address is indistinguishable 404`() {
        val owner = exchange("/api/v1/customer/auth/register", HttpMethod.POST, """{"email":"owner@example.com","password":"a-very-long-password","firstName":"Owner","lastName":"One"}""")
        val ownerCookie = owner.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';')
        val ownerCsrf = owner.headers.getFirst("X-CSRF-Token")
        val created = exchange("/api/v1/customer/me/addresses", HttpMethod.POST, """{"street":"Own","number":"9","city":"City","province":"Province","postalCode":"1000","isDefault":true}""", ownerCookie, ownerCsrf)
        assertEquals(200, created.statusCode.value())
        val addressId = Regex(""""id"\s*:\s*(\d+)""").find(created.body!!)?.groupValues?.get(1)
        assertNotNull(addressId)

        val stranger = exchange("/api/v1/customer/auth/register", HttpMethod.POST, """{"email":"stranger@example.com","password":"a-very-long-password","firstName":"Other","lastName":"Two"}""")
        val strangerCookie = stranger.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';')
        val strangerCsrf = stranger.headers.getFirst("X-CSRF-Token")
        val foreign = exchange("/api/v1/customer/me/addresses/$addressId", HttpMethod.PUT, """{"street":"Hack","number":"1","city":"City","province":"Province","postalCode":"1000","isDefault":true}""", strangerCookie, strangerCsrf)
        assertEquals(404, foreign.statusCode.value())
        assertEquals(true, foreign.body!!.contains("RESOURCE_NOT_FOUND"))
    }

    @Test
    fun `sixth failed login is rate limited with retry after`() {
        repeat(5) {
            val failed = exchange("/api/v1/customer/auth/login", HttpMethod.POST, """{"email":"limited@example.com","password":"wrong-password-xx"}""")
            assertEquals(401, failed.statusCode.value())
        }
        val limited = exchange("/api/v1/customer/auth/login", HttpMethod.POST, """{"email":"limited@example.com","password":"wrong-password-xx"}""")
        assertEquals(429, limited.statusCode.value())
        assertEquals(true, limited.body!!.contains("AUTH_RATE_LIMITED"))
        assertNotNull(limited.headers.getFirst("Retry-After"))
    }

    @Test
    fun `cors preflight exposes csrf header only for the installation origin`() {
        val allowed = http.exchange(
            URI("http://localhost:$port/api/v1/customer/me"),
            HttpMethod.OPTIONS,
            HttpEntity(null, HttpHeaders().apply {
                set(HttpHeaders.ORIGIN, "http://localhost:4200")
                set(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
                set(HttpHeaders.ACCESS_CONTROL_REQUEST_HEADERS, "X-CSRF-Token")
            }),
            String::class.java,
        )
        assertEquals(200, allowed.statusCode.value())
        assertEquals("http://localhost:4200", allowed.headers.accessControlAllowOrigin)
        assertEquals(true, allowed.headers.accessControlAllowCredentials)
        assertEquals(true, allowed.headers.accessControlExposeHeaders.any { it.equals("X-CSRF-Token", ignoreCase = true) })

        val denied = http.exchange(
            URI("http://localhost:$port/api/v1/customer/me"),
            HttpMethod.OPTIONS,
            HttpEntity(null, HttpHeaders().apply {
                set(HttpHeaders.ORIGIN, "https://evil.example")
                set(HttpHeaders.ACCESS_CONTROL_REQUEST_METHOD, "GET")
            }),
            String::class.java,
        )
        assertEquals(true, denied.headers.accessControlAllowOrigin == null || denied.headers.accessControlAllowOrigin == "null")
    }

    @Test
    fun `admin revoke is audited and role removal rejects the next request`() {
        val admin = provisionAdmin("revoke-admin@example.com")
        val login = exchange("/api/v1/internal/auth/login", HttpMethod.POST, """{"email":"revoke-admin@example.com","password":"a-very-long-password"}""")
        assertEquals(200, login.statusCode.value(), login.body)
        val cookie = login.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';')
        val csrf = login.headers.getFirst("X-CSRF-Token")
        val sessionId = jdbc.queryForObject("SELECT id::text FROM identity_sessions WHERE subject_kind='USER' AND revoked_at IS NULL ORDER BY issued_at DESC LIMIT 1", String::class.java)
        val customer = exchange("/api/v1/customer/auth/register", HttpMethod.POST, """{"email":"revoked-target@example.com","password":"a-very-long-password","firstName":"Revoked","lastName":"Target"}""")
        val targetCookie = customer.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';')
        val targetSession = jdbc.queryForObject("SELECT id::text FROM identity_sessions WHERE subject_kind='CUSTOMER' AND revoked_at IS NULL ORDER BY issued_at DESC LIMIT 1", String::class.java)
        val revoked = exchange("/api/v1/internal/admin/sessions/$targetSession/revoke", HttpMethod.POST, """{"reason":"security-review","correlationId":"11111111-1111-4111-8111-111111111111"}""", cookie, csrf)
        assertEquals(200, revoked.statusCode.value())
        val afterRevoke = exchange("/api/v1/customer/me", HttpMethod.GET, null, targetCookie)
        assertEquals(401, afterRevoke.statusCode.value())
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE event_type='IDENTITY_SESSION_REVOKED' AND reason_code='ADMIN_REQUESTED' AND aggregate_reference=?::uuid", Int::class.java, targetSession))

        jdbc.update("DELETE FROM user_roles WHERE user_id=(SELECT id FROM users WHERE email=?)", "revoke-admin@example.com")
        val deauthorized = exchange("/api/v1/internal/me", HttpMethod.GET, null, cookie)
        assertEquals(401, deauthorized.statusCode.value())
        assertEquals(true, deauthorized.body!!.contains("AUTHENTICATION_FAILED"))
        assertNotNull(sessionId)
    }

    @Test
    fun expiredCsrfCanBeRenewedWhileSessionIsLive() {
        val email = "csrf-expired-${System.nanoTime()}@example.com"
        val registered = exchange("/api/v1/customer/auth/register", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password","firstName":"Csrf","lastName":"Expired"}""")
        val cookie = registered.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(59.toChar())
        val sessionId = jdbc.queryForObject("SELECT s.id FROM identity_sessions s JOIN customers c ON c.id=s.customer_id WHERE c.email=? ORDER BY s.issued_at DESC LIMIT 1", java.util.UUID::class.java, email)!!
        jdbc.update("UPDATE identity_session_csrf_tokens SET retired_at=clock_timestamp() WHERE session_id=?::uuid AND retired_at IS NULL", sessionId)
        val staleToken = "stale-csrf-${System.nanoTime()}"
        val generation = jdbc.queryForObject("SELECT COALESCE(MAX(generation),0)+1 FROM identity_session_csrf_tokens WHERE session_id=?::uuid", Int::class.java, sessionId)!!
        jdbc.update("INSERT INTO identity_session_csrf_tokens(session_id,token_hash,generation,issued_at,expires_at) VALUES(?::uuid,?,?,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour')", sessionId, com.storecore.identity.infrastructure.security.OpaqueTokenFactory().sha256(staleToken), generation)
        val renewed = exchange("/api/v1/customer/auth/csrf", HttpMethod.GET, null, cookie)
        assertEquals(200, renewed.statusCode.value())
        assertEquals("no-store", renewed.headers.cacheControl)
        val freshToken = renewed.headers.getFirst("X-CSRF-Token")
        assertNotNull(freshToken)
        org.junit.jupiter.api.Assertions.assertNotEquals(staleToken, freshToken)
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM identity_session_csrf_tokens WHERE session_id=?::uuid AND retired_at IS NULL AND expires_at>clock_timestamp()", Int::class.java, sessionId))
    }

    @Test
    fun requestHostIsNotAcceptedAsCsrfOriginFallback() {
        val email = "origin-${System.nanoTime()}@example.com"
        val registered = exchange("/api/v1/customer/auth/register", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password","firstName":"Origin","lastName":"Test"}""")
        val cookie = registered.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(59.toChar())
        val csrf = registered.headers.getFirst("X-CSRF-Token")!!
        val forged = exchange("/api/v1/customer/me", HttpMethod.PUT, """{"email":"changed@example.com","firstName":"Changed","lastName":"Test","phone":null}""", cookie, csrf, "http://localhost:$port")
        assertEquals(403, forged.statusCode.value())
        assertEquals(true, forged.body!!.contains("CSRF_INVALID"))
    }

    @Test
    fun adminCanRemoveAndReplaceExpiredCapabilityKills() {
        val email = "kill-admin-${System.nanoTime()}@example.com"
        provisionAdmin(email)
        val login = exchange("/api/v1/internal/auth/login", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password"}""")
        val cookie = login.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';')
        var csrf = login.headers.getFirst("X-CSRF-Token")!!
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='STOREFRONT'", Int::class.java)
        val userId = jdbc.queryForObject("SELECT id FROM users WHERE email=?", Long::class.java, email)
        jdbc.query("SELECT capability_admin_change_configuration(?,?,?,?,?::jsonb,?,?)", { _, _ -> }, userId, "STOREFRONT", version, "ACTIVE", "{}", java.util.UUID.randomUUID(), "test")
        val expires = java.time.Instant.now().plusSeconds(3600)
        val created = exchange(
            "/api/v1/user/capabilities/STOREFRONT/kills",
            HttpMethod.POST,
            """{"action":"SERVE","owner":"ops","reason":"freeze","expiresAt":"$expires","ticket":"TICKET-HTTP-1","correlationId":"11111111-1111-4111-8111-111111111111"}""",
            cookie,
            csrf,
        )
        assertEquals(200, created.statusCode.value(), created.body)
        csrf = created.headers.getFirst("X-CSRF-Token")!!
        val killId = Regex(""""id"\s*:\s*(\d+)""").find(created.body!!)!!.groupValues[1]
        val replaced = exchange(
            "/api/v1/user/capabilities/STOREFRONT/kills/$killId/replace",
            HttpMethod.POST,
            """{"action":"SERVE","owner":"ops-2","reason":"replace","expiresAt":"$expires","ticket":"TICKET-HTTP-2","correlationId":"22222222-2222-4222-8222-222222222222"}""",
            cookie,
            csrf,
        )
        assertEquals(200, replaced.statusCode.value(), replaced.body)
        csrf = replaced.headers.getFirst("X-CSRF-Token")!!
        val nextId = Regex(""""id"\s*:\s*(\d+)""").find(replaced.body!!)!!.groupValues[1]
        val removed = exchange(
            "/api/v1/user/capabilities/STOREFRONT/kills/$nextId/remove",
            HttpMethod.POST,
            """{"reason":"thaw","correlationId":"33333333-3333-4333-8333-333333333333"}""",
            cookie,
            csrf,
        )
        assertEquals(200, removed.statusCode.value(), removed.body)
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM capability_kill_switches WHERE module_code='STOREFRONT' AND action_code='SERVE' AND active", Int::class.java))
    }

    @Test
    fun internalLoginWithoutRoleDoesNotIssueSessionCookie() {
        val email = "no-role-${System.nanoTime()}@example.com"
        jdbc.update("INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'No','Role')", email, passwords.hash("a-very-long-password".toCharArray()))
        val response = exchange("/api/v1/internal/auth/login", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password"}""")
        assertEquals(401, response.statusCode.value())
        assertEquals("no-store", response.headers.cacheControl)
        assertEquals(null, response.headers.getFirst(HttpHeaders.SET_COOKIE))
    }
    private fun provisionAdmin(email: String) {
        val hash = passwords.hash("a-very-long-password".toCharArray())
        val userId = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id", Long::class.java, email, hash)
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", userId)
    }

    private fun exchange(path: String, method: HttpMethod, body: String?, cookie: String? = null, csrf: String? = null, origin: String = "http://localhost:4200") = http.exchange(
        URI("http://localhost:$port$path"), method,
        HttpEntity(body, HttpHeaders().apply {
            contentType = MediaType.APPLICATION_JSON
            set(HttpHeaders.ORIGIN, origin)
            cookie?.let { set(HttpHeaders.COOKIE, it) }
            csrf?.let { set("X-CSRF-Token", it) }
        }), String::class.java,
    )

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