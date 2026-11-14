package com.storecore.branding

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.configuration.domain.CapabilityState
import com.storecore.identity.domain.InternalRole
import org.flywaydb.core.Flyway
import org.flywaydb.core.api.MigrationVersion
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.dao.DataIntegrityViolationException
import java.sql.DriverManager
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
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
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
class MerchantBrandingHttpIntegrationTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val mapper: ObjectMapper,
    @Autowired private val passwords: Argon2PasswordHasher,
    @LocalServerPort private val port: Int,
) {
    private lateinit var admin: Session

    @BeforeEach
    fun seed() {
        jdbc.update("INSERT INTO installation_settings(installation_id,business_name,allowed_host) VALUES(1,'StoreCore','localhost') ON CONFLICT(installation_id) DO NOTHING")
        jdbc.update("UPDATE installation_settings SET branding_revision=1,business_name='StoreCore',logo_url=NULL,primary_color='#0f172a',on_primary_color='#f8fafc' WHERE installation_id=1")
        admin = provision(InternalRole.ADMIN)
        activate("STOREFRONT")
        activate("CATALOG")
        activate("PROFILE_CONTENT")
    }

    @AfterEach
    fun removeFailureTrigger() {
        jdbc.execute("DROP TRIGGER IF EXISTS trg_test_branding_audit_failure ON audit_events")
        jdbc.execute("DROP FUNCTION IF EXISTS test_branding_audit_failure()")
    }

    @Test
    fun `public and admin reads expose canonical values with explicit cache policy`() {
        val public = exchange("/api/v1/storefront/branding", HttpMethod.GET)
        assertEquals(200, public.statusCode.value(), public.body)
        assertEquals("no-cache", public.headers.cacheControl)
        assertEquals(1, mapper.readTree(public.body!!).path("data").path("revision").asLong())
        val internal = exchange("/api/v1/user/settings/branding", HttpMethod.GET, cookie = admin.cookie)
        assertEquals(200, internal.statusCode.value())
        assertEquals("no-store", internal.headers.cacheControl)
        jdbc.update("UPDATE installation_settings SET logo_url='javascript:bad' WHERE installation_id=1")
        assertTrue(mapper.readTree(exchange("/api/v1/storefront/branding", HttpMethod.GET).body!!).path("data").path("logoUrl").isNull)
    }

    @Test
    fun `publish canonicalizes increments rotates csrf and audits only changed field names`() {
        val saved = exchange("/api/v1/user/settings/branding", HttpMethod.PUT, body(), admin.cookie, admin.csrf)
        assertEquals(200, saved.statusCode.value(), saved.body)
        assertEquals(2, revision())
        assertNotEquals(admin.csrf, saved.headers.getFirst("X-CSRF-Token"))
        val value = mapper.readTree(saved.body!!).path("data")
        assertEquals("Merchant private name", value.path("businessName").asText())
        assertEquals("https://example.com/private.png", value.path("logoUrl").asText())
        assertEquals("#000000", value.path("primaryColor").asText())
        val payload = jdbc.queryForObject("SELECT payload_redacted::text FROM audit_events WHERE event_type='MERCHANT_BRANDING_UPDATED' AND actor_id=?", String::class.java, admin.userId.toString())!!
        assertEquals(setOf("changedFields"), mapper.readTree(payload).fieldNames().asSequence().toSet())
        assertEquals(setOf("businessName","logoUrl","primaryColor","onPrimaryColor"), mapper.readTree(payload).path("changedFields").map { it.asText() }.toSet())
        assertFalse(payload.contains("private"))
        val staleCsrf = exchange("/api/v1/user/settings/branding", HttpMethod.PUT, body(2), admin.cookie, admin.csrf)
        assertEquals(403, staleCsrf.statusCode.value())
        admin = admin.copy(csrf = saved.headers.getFirst("X-CSRF-Token")!!)
        val stale = exchange("/api/v1/user/settings/branding", HttpMethod.PUT, body(), admin.cookie, admin.csrf)
        assertEquals(409, stale.statusCode.value(), stale.body)
        assertTrue(stale.body!!.contains("MERCHANT_BRANDING_REVISION_CONFLICT"))
        assertEquals(2, revision())
    }

    @Test
    fun `invalid input same origin csrf and admin boundaries preserve published settings`() {
        assertEquals(403, exchange("/api/v1/user/settings/branding", HttpMethod.PUT, body(), admin.cookie).statusCode.value())
        assertEquals(403, exchange("/api/v1/user/settings/branding", HttpMethod.PUT, body(), admin.cookie, admin.csrf, "https://evil.invalid").statusCode.value())
        val operator = provision(InternalRole.OPERATOR)
        assertEquals(403, exchange("/api/v1/user/settings/branding", HttpMethod.GET, cookie = operator.cookie).statusCode.value())
        assertEquals(403, exchange("/api/v1/user/settings/branding", HttpMethod.PUT, body(), operator.cookie, operator.csrf).statusCode.value())
        assertEquals(401, exchange("/api/v1/user/settings/branding", HttpMethod.GET).statusCode.value())
        for ((key,value) in listOf("businessName" to "a", "logoUrl" to "http://evil.invalid/a", "logoUrl" to "//evil.invalid/a", "primaryColor" to "red", "onPrimaryColor" to "#000000", "businessName" to "bad\nname")) {
            val input = mapper.readTree(body()).deepCopy<com.fasterxml.jackson.databind.node.ObjectNode>().put(key,value).toString()
            val rejected = exchange("/api/v1/user/settings/branding", HttpMethod.PUT, input, admin.cookie, admin.csrf)
            assertEquals(400, rejected.statusCode.value(), rejected.body)
            assertTrue(rejected.body!!.contains("MERCHANT_BRANDING_INVALID"))
        }
        assertEquals(1, revision())
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='MERCHANT_BRANDING_UPDATED' AND actor_id=?", Int::class.java, admin.userId.toString()))
    }

    @Test
    fun `concurrent compare and swap has one winner`() {
        val second = provision(InternalRole.ADMIN)
        val ready = CountDownLatch(2); val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val calls = listOf(admin, second).map { session -> pool.submit<ResponseEntity<String>> {
                ready.countDown(); start.await()
                exchange("/api/v1/user/settings/branding", HttpMethod.PUT, body(), session.cookie, session.csrf)
            } }
            ready.await(); start.countDown()
            assertEquals(listOf(200,409), calls.map { it.get().statusCode.value() }.sorted())
            assertEquals(2, revision())
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='MERCHANT_BRANDING_UPDATED' AND actor_id IN (?,?)", Int::class.java, admin.userId.toString(), second.userId.toString()))
        } finally { pool.shutdownNow() }
    }

    @Test
    fun `audit failure rolls back settings revision and csrf allowing same token retry`() {
        jdbc.execute("""CREATE FUNCTION test_branding_audit_failure() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN IF NEW.event_type=''MERCHANT_BRANDING_UPDATED'' THEN RAISE EXCEPTION ''test audit failure''; END IF; RETURN NEW; END'""")
        jdbc.execute("CREATE TRIGGER trg_test_branding_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION test_branding_audit_failure()")
        val failed = exchange("/api/v1/user/settings/branding", HttpMethod.PUT, body(), admin.cookie, admin.csrf)
        assertEquals(500, failed.statusCode.value())
        assertEquals(1, revision())
        assertEquals("StoreCore", jdbc.queryForObject("SELECT business_name FROM installation_settings", String::class.java))
        jdbc.execute("DROP TRIGGER trg_test_branding_audit_failure ON audit_events")
        jdbc.execute("DROP FUNCTION test_branding_audit_failure()")
        val retry = exchange("/api/v1/user/settings/branding", HttpMethod.PUT, body(), admin.cookie, admin.csrf)
        assertEquals(200, retry.statusCode.value(), retry.body)
    }

    @Test
    fun `capability lifecycle gates public reads and admin writes without rotating rejected csrf`() {
        activate("STOREFRONT", CapabilityState.DISABLED)
        assertEquals(409, exchange("/api/v1/storefront/branding", HttpMethod.GET).statusCode.value())
        activate("STOREFRONT")
        activate("PROFILE_CONTENT", CapabilityState.READ_ONLY)
        assertEquals(200, exchange("/api/v1/user/settings/branding", HttpMethod.GET, cookie = admin.cookie).statusCode.value())
        val blocked = exchange("/api/v1/user/settings/branding", HttpMethod.PUT, body(), admin.cookie, admin.csrf)
        assertEquals(409, blocked.statusCode.value(), blocked.body)
        assertEquals(1, revision())
        activate("PROFILE_CONTENT")
        val retry = exchange("/api/v1/user/settings/branding", HttpMethod.PUT, body(), admin.cookie, admin.csrf)
        assertEquals(200, retry.statusCode.value(), retry.body)
    }

    @Test
    fun `customer realm cannot read or publish internal settings`() {
        val email = "customer-${UUID.randomUUID()}@example.com"
        jdbc.update("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Brand','Customer')", email, passwords.hash("a-very-long-password".toCharArray()))
        val login = exchange("/api/v1/customer/auth/login", HttpMethod.POST, mapper.writeValueAsString(mapOf("email" to email, "password" to "a-very-long-password")))
        assertEquals(200, login.statusCode.value(), login.body)
        val cookie = login.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';')
        val csrf = login.headers.getFirst("X-CSRF-Token")!!
        assertEquals(401, exchange("/api/v1/user/settings/branding", HttpMethod.GET, cookie = cookie).statusCode.value())
        assertEquals(401, exchange("/api/v1/user/settings/branding", HttpMethod.PUT, body(), cookie, csrf).statusCode.value())
        assertEquals(1, revision())
    }

    @Test
    fun `malformed request shapes return bad request without modifying settings`() {
        for (input in listOf("{", "{}", body().replace("\"expectedRevision\":1", "\"expectedRevision\":1.2"), body().replace("\"primaryColor\":\"#000000\"", "\"primaryColor\":123"), body().replace("\"expectedRevision\":1", "\"expectedRevision\":0"), body().replace("\"businessName\":\"  Merchant private name  \"", "\"businessName\":null"))) {
            val response = exchange("/api/v1/user/settings/branding", HttpMethod.PUT, input, admin.cookie, admin.csrf)
            assertEquals(400, response.statusCode.value(), response.body)
        }
        assertEquals(1, revision())
    }

    @Test
    fun `V22 upgrade preserves installation and adds constrained branding defaults`() {
        val database = "branding_upgrade_" + UUID.randomUUID().toString().replace("-", "")
        DriverManager.getConnection(postgres.jdbcUrl, postgres.username, postgres.password).use { connection ->
            connection.createStatement().use { it.execute("CREATE DATABASE $database") }
        }
        val url = postgres.jdbcUrl.substringBefore('?').substringBeforeLast('/') + "/" + database
        fun migrate(target: String) = Flyway.configure().dataSource(url, postgres.username, postgres.password)
            .locations("classpath:db/migration").target(MigrationVersion.fromVersion(target)).load().migrate()
        migrate("22")
        val upgrade = JdbcTemplate(DriverManagerDataSource(url, postgres.username, postgres.password))
        upgrade.update("INSERT INTO installation_settings(business_name,allowed_host) VALUES('Existing merchant','existing.example')")
        val history = upgrade.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE version IS NOT NULL ORDER BY installed_rank")
        migrate("23")
        assertEquals(history, upgrade.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE version IS NOT NULL AND version<>'23' ORDER BY installed_rank"))
        val row = upgrade.queryForMap("SELECT * FROM installation_settings")
        assertEquals("Existing merchant", row["business_name"])
        assertEquals(1L, row["branding_revision"])
        assertEquals("#0f172a", row["primary_color"])
        assertEquals("#f8fafc", row["on_primary_color"])
        assertNull(row["logo_url"])
        assertThrows(DataIntegrityViolationException::class.java) { upgrade.update("UPDATE installation_settings SET branding_revision=0") }
        assertThrows(DataIntegrityViolationException::class.java) { upgrade.update("UPDATE installation_settings SET primary_color='#ABCDEF'") }
        assertThrows(DataIntegrityViolationException::class.java) { upgrade.update("UPDATE installation_settings SET on_primary_color='invalid'") }
    }

    private fun body(revision: Long = 1) = mapper.writeValueAsString(mapOf("expectedRevision" to revision, "businessName" to "  Merchant private name  ", "logoUrl" to "HTTPS://EXAMPLE.COM:443/private.png", "primaryColor" to "#000000", "onPrimaryColor" to "#FFFFFF"))
    private fun revision() = jdbc.queryForObject("SELECT branding_revision FROM installation_settings WHERE installation_id=1", Long::class.java)!!

    private fun provision(role: InternalRole): Session {
        val email = "${role.name.lowercase()}-${UUID.randomUUID()}@example.com"
        val hash = passwords.hash("a-very-long-password".toCharArray())
        val userId = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Content','User') RETURNING id", Long::class.java, email, hash)!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?", userId, role.name)
        val login = exchange("/api/v1/internal/auth/login", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password"}""")
        return Session(login.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'), login.headers.getFirst("X-CSRF-Token")!!, userId)
    }

    private fun activate(module: String, target: CapabilityState = CapabilityState.ACTIVE) {
        val state = jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code=?", String::class.java, module)
        if (CapabilityState.fromWire(state) == target) return
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code=?", Int::class.java, module)!!
        val sessionId = jdbc.queryForObject("SELECT id FROM identity_sessions WHERE subject_kind='USER' AND user_id=? AND revoked_at IS NULL ORDER BY issued_at DESC LIMIT 1", UUID::class.java, admin.userId)!!
        jdbc.query("SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)", { _, _ -> }, admin.userId, sessionId, module, version, target.wire, jdbc.queryForObject("SELECT config::text FROM module_configurations WHERE module_code=?",String::class.java,module), UUID.randomUUID(), "test")
    }

    private fun exchange(path: String, method: HttpMethod, body: String? = null, cookie: String? = null, csrf: String? = null, origin: String = "http://localhost:4200") = http.exchange(
        URI("http://localhost:$port$path"), method,
        HttpEntity(body, HttpHeaders().apply {
            contentType = MediaType.APPLICATION_JSON
            set(HttpHeaders.ORIGIN, origin)
            cookie?.let { set(HttpHeaders.COOKIE, it) }
            csrf?.let { set("X-CSRF-Token", it) }
        }), String::class.java,
    )

    private data class Session(val cookie: String, val csrf: String, val userId: Long)

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @DynamicPropertySource
        fun database(registry: DynamicPropertyRegistry) {
            postgres.start()
            registry.add("spring.datasource.url") { postgres.jdbcUrl }
            registry.add("spring.datasource.username") { postgres.username }
            registry.add("spring.datasource.password") { postgres.password }
        }
    }
}
