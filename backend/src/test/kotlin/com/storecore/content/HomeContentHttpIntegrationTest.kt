package com.storecore.content

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.content.domain.HomeBlockKind
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
class HomeContentHttpIntegrationTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val mapper: ObjectMapper,
    @Autowired private val passwords: Argon2PasswordHasher,
    @LocalServerPort private val port: Int,
) {
    private lateinit var admin: Session

    @BeforeEach
    fun seed() {
        jdbc.update("DELETE FROM home_content_sections")
        jdbc.update("UPDATE home_content_compositions SET revision=0,updated_at=clock_timestamp() WHERE singleton_id=1")
        admin = provision("ADMIN")
        activate("STOREFRONT")
        activate("CATALOG")
        activate("PROFILE_CONTENT")
    }

    @AfterEach
    fun removeFailureTrigger() {
        jdbc.execute("DROP TRIGGER IF EXISTS trg_test_home_audit_failure ON audit_events")
        jdbc.execute("DROP FUNCTION IF EXISTS test_home_audit_failure()")
    }

    @Test
    fun `public omits inactive and unknown legacy while admin diagnoses both`() {
        jdbc.update("INSERT INTO home_content_sections(section_key,content,active,sort_order) VALUES ('hero',?::jsonb,true,0)", """{"title":"Real hero","body":"Stored"}""")
        jdbc.update("INSERT INTO home_content_sections(section_key,content,active,sort_order) VALUES ('legacy-grid',?::jsonb,true,1)", """{"title":"Legacy"}""")
        jdbc.update("INSERT INTO home_content_sections(section_key,content,active,sort_order) VALUES ('private-banner',?::jsonb,false,2)", """{"kind":"PROMO_BANNER","title":"Private","body":"Hidden"}""")

        val public = exchange("/api/v1/content/home", HttpMethod.GET)
        assertEquals(200, public.statusCode.value())
        val publicData = mapper.readTree(public.body!!).path("data")
        assertEquals(0, publicData.path("revision").asLong())
        assertEquals(listOf("hero"), publicData.path("sections").map { it.path("key").asText() })
        assertEquals("HERO", publicData.path("sections").first().path("kind").asText())
        assertFalse(public.body!!.contains("StoreCore"))

        val internal = exchange("/api/v1/user/content/home", HttpMethod.GET, cookie = admin.cookie)
        assertEquals(200, internal.statusCode.value())
        assertTrue(internal.headers.cacheControl.contains("no-store"))
        val sections = mapper.readTree(internal.body!!).path("data").path("sections")
        assertEquals(listOf("hero", "legacy-grid", "private-banner"), sections.map { it.path("key").asText() })
        assertEquals("UNKNOWN", sections[1].path("kind").asText())
        assertFalse(sections[2].path("active").asBoolean())
    }

    @Test
    fun `invalid legacy hero fails closed and is omitted from public composition`() {
        jdbc.update(
            "INSERT INTO home_content_sections(section_key,content,active,sort_order) VALUES ('hero',?::jsonb,true,0)",
            """{"title":"Legacy","body":"Stored","ctaPath":"https://evil.invalid"}""",
        )

        val public = exchange("/api/v1/content/home", HttpMethod.GET)
        assertEquals(200, public.statusCode.value())
        assertEquals(0, mapper.readTree(public.body!!).path("data").path("sections").size())

        val internal = exchange("/api/v1/user/content/home", HttpMethod.GET, cookie = admin.cookie)
        val section = mapper.readTree(internal.body!!).path("data").path("sections").single()
        assertEquals("UNKNOWN", section.path("kind").asText())
    }

    @Test
    fun `replace validates exact schemas references csrf and stale revision atomically`() {
        val categoryId = jdbc.queryForObject("INSERT INTO categories(name,slug) VALUES ('Tools',?) RETURNING id", Long::class.java, "tools-${UUID.randomUUID()}")!!
        val sku = "HOME-${UUID.randomUUID()}"
        val productId = jdbc.queryForObject("INSERT INTO products(name,slug,base_price,status) VALUES ('Drill',?,100,'ACTIVE') RETURNING id", Long::class.java, "drill-${UUID.randomUUID()}")!!
        jdbc.update("INSERT INTO product_variants(product_id,sku,label,active) VALUES (?,?,?,true)", productId, sku, "Drill")
        val body = replaceBody(0, categoryId, sku)

        val noCsrf = exchange("/api/v1/user/content/home", HttpMethod.PUT, body, admin.cookie)
        assertEquals(403, noCsrf.statusCode.value())
        val wrongOrigin = exchange("/api/v1/user/content/home", HttpMethod.PUT, body, admin.cookie, admin.csrf, "https://evil.invalid")
        assertEquals(403, wrongOrigin.statusCode.value())
        assertEquals(0, revision())

        val saved = exchange("/api/v1/user/content/home", HttpMethod.PUT, body, admin.cookie, admin.csrf)
        assertEquals(200, saved.statusCode.value(), saved.body)
        admin = admin.copy(csrf = saved.headers.getFirst("X-CSRF-Token")!!)
        assertEquals(1, revision())
        assertEquals(4, jdbc.queryForObject("SELECT count(*) FROM home_content_sections", Int::class.java))
        assertEquals("HERO", jdbc.queryForObject("SELECT content->>'kind' FROM home_content_sections WHERE section_key='hero'", String::class.java))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='HOME_CONTENT_REPLACED' AND actor_id=? AND payload_redacted->>'revision'='1'", Int::class.java, admin.userId.toString()))

        val stale = exchange("/api/v1/user/content/home", HttpMethod.PUT, body, admin.cookie, admin.csrf)
        assertEquals(409, stale.statusCode.value())
        assertTrue(stale.body!!.contains("HOME_CONTENT_REVISION_CONFLICT"))
        assertEquals(1, revision())

        val missingRef = """{"expectedRevision":1,"sections":[{"key":"rail","kind":"PRODUCT_RAIL","active":true,"sortOrder":0,"content":{"title":"Missing","skus":["NO-SUCH-SKU"]}}]}"""
        val rejected = exchange("/api/v1/user/content/home", HttpMethod.PUT, missingRef, admin.cookie, admin.csrf)
        assertEquals(400, rejected.statusCode.value())
        assertTrue(rejected.body!!.contains("HOME_CONTENT_REFERENCE_NOT_FOUND"))
        assertEquals(1, revision())
        assertEquals(4, jdbc.queryForObject("SELECT count(*) FROM home_content_sections", Int::class.java))

        val extraField = """{"expectedRevision":1,"sections":[{"key":"hero","kind":"HERO","active":true,"sortOrder":0,"content":{"title":"Bad","body":"","extra":true}}]}"""
        val invalid = exchange("/api/v1/user/content/home", HttpMethod.PUT, extraField, admin.cookie, admin.csrf)
        assertEquals(400, invalid.statusCode.value())
        assertTrue(invalid.body!!.contains("HOME_CONTENT_INVALID"))
        for (path in listOf("/%2fexternal", "/safe%5cpath", "/bad%0Apath")) {
            val dangerous = """{"expectedRevision":1,"sections":[{"key":"hero","kind":"HERO","active":true,"sortOrder":0,"content":{"title":"Bad path","body":"","ctaPath":"$path"}}]}"""
            val rejectedPath = exchange("/api/v1/user/content/home", HttpMethod.PUT, dangerous, admin.cookie, admin.csrf)
            assertEquals(400, rejectedPath.statusCode.value(), rejectedPath.body)
            assertTrue(rejectedPath.body!!.contains("HOME_CONTENT_INVALID"))
        }
        val oversizedPath = "/" + "a".repeat(2_048)
        val rejectedOversizedPath = exchange(
            "/api/v1/user/content/home", HttpMethod.PUT,
            """{"expectedRevision":1,"sections":[{"key":"hero","kind":"HERO","active":true,"sortOrder":0,"content":{"title":"Bad path","body":"","ctaPath":"$oversizedPath"}}]}""",
            admin.cookie, admin.csrf,
        )
        assertEquals(400, rejectedOversizedPath.statusCode.value())
        assertTrue(rejectedOversizedPath.body!!.contains("HOME_CONTENT_INVALID"))
    }

    @Test
    fun `concurrent replace with one revision permits exactly one winner`() {
        val second = provision("ADMIN")
        val auditsBefore = jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='HOME_CONTENT_REPLACED'", Int::class.java)!!
        val bodyA = heroBody(0, "First")
        val bodyB = heroBody(0, "Second")
        val ready = CountDownLatch(2)
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val calls = listOf(admin to bodyA, second to bodyB).map { (session, body) ->
                pool.submit<ResponseEntity<String>> {
                    ready.countDown(); start.await()
                    exchange("/api/v1/user/content/home", HttpMethod.PUT, body, session.cookie, session.csrf)
                }
            }
            ready.await(); start.countDown()
            val responses = calls.map { it.get() }
            assertEquals(listOf(200, 409), responses.map { it.statusCode.value() }.sorted())
            assertEquals(1, revision())
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM home_content_sections", Int::class.java))
            assertEquals(auditsBefore + 1, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='HOME_CONTENT_REPLACED'", Int::class.java))
        } finally { pool.shutdownNow() }
    }

    @Test
    fun `audit failure rolls back sections revision and csrf mutation`() {
        val auditsBefore = jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='HOME_CONTENT_REPLACED'", Int::class.java)!!
        jdbc.execute("""CREATE FUNCTION test_home_audit_failure() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN IF NEW.event_type=''HOME_CONTENT_REPLACED'' THEN RAISE EXCEPTION ''test audit failure''; END IF; RETURN NEW; END'""")
        jdbc.execute("CREATE TRIGGER trg_test_home_audit_failure BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION test_home_audit_failure()")
        val failed = exchange("/api/v1/user/content/home", HttpMethod.PUT, heroBody(0, "Rollback"), admin.cookie, admin.csrf)
        assertEquals(500, failed.statusCode.value())
        assertEquals(0, revision())
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM home_content_sections", Int::class.java))
        assertEquals(auditsBefore, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='HOME_CONTENT_REPLACED'", Int::class.java))
        jdbc.execute("DROP TRIGGER trg_test_home_audit_failure ON audit_events")
        jdbc.execute("DROP FUNCTION test_home_audit_failure()")
        val retry = exchange("/api/v1/user/content/home", HttpMethod.PUT, heroBody(0, "Rollback"), admin.cookie, admin.csrf)
        assertEquals(200, retry.statusCode.value(), retry.body)
    }

    @Test
    fun `operator cannot read or replace admin composition and unknown kind is closed`() {
        assertEquals(HomeBlockKind.UNKNOWN, HomeBlockKind.fromWire("SURPRISE"))
        val operator = provision("OPERATOR")
        assertEquals(403, exchange("/api/v1/user/content/home", HttpMethod.GET, cookie = operator.cookie).statusCode.value())
        assertEquals(403, exchange("/api/v1/user/content/home", HttpMethod.PUT, heroBody(0, "Denied"), operator.cookie, operator.csrf).statusCode.value())
        assertEquals(0, revision())
    }

    @Test
    fun `profile partial merge advances composition revision and rejects stale put and invalid profile content`() {
        val key = "profile-${UUID.randomUUID().toString().replace("-", "").take(12)}"
        val manifest = """{"profile_name":"universal-tools-profile","profile_version":"1.0.0","coreCompatibility":"1.x","content":{"homeSections":[{"sectionKey":"$key","content":{"kind":"HERO","title":"Profile hero","body":"Imported"},"active":true,"sortOrder":3}]},"mergeSelection":{"homeSections":["$key"]}}"""
        val merged = exchange("/api/v1/user/profiles/merge", HttpMethod.POST, mapper.writeValueAsString(mapOf("manifest" to manifest)), admin.cookie, admin.csrf)
        assertEquals(200, merged.statusCode.value(), merged.body)
        admin = admin.copy(csrf = merged.headers.getFirst("X-CSRF-Token")!!)
        assertEquals(1, revision())
        assertEquals("HERO", jdbc.queryForObject("SELECT content->>'kind' FROM home_content_sections WHERE section_key=?", String::class.java, key))

        val stale = exchange("/api/v1/user/content/home", HttpMethod.PUT, heroBody(0, "Stale"), admin.cookie, admin.csrf)
        assertEquals(409, stale.statusCode.value())
        assertEquals(1, revision())
        assertEquals("Profile hero", jdbc.queryForObject("SELECT content->>'title' FROM home_content_sections WHERE section_key=?", String::class.java, key))

        val invalidManifest = """{"profile_name":"universal-tools-profile","profile_version":"1.0.0","coreCompatibility":"1.x","content":{"homeSections":[{"sectionKey":"bad-profile","content":{"title":"Untyped"}}]},"mergeSelection":{"homeSections":["bad-profile"]}}"""
        val invalid = exchange("/api/v1/user/profiles/merge", HttpMethod.POST, mapper.writeValueAsString(mapOf("manifest" to invalidManifest)), admin.cookie, admin.csrf)
        assertEquals(400, invalid.statusCode.value())
        assertTrue(invalid.body!!.contains("PROFILE_CONTENT_INVALID"))
        assertEquals(1, revision())
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM home_content_sections WHERE section_key='bad-profile'", Int::class.java))

        val missingReferenceManifest = """{"profile_name":"universal-tools-profile","profile_version":"1.0.0","coreCompatibility":"1.x","content":{"homeSections":[{"sectionKey":"missing-reference","content":{"kind":"PRODUCT_RAIL","title":"Missing","skus":["NO-SUCH-SKU"]}}]},"mergeSelection":{"homeSections":["missing-reference"]}}"""
        val missingReference = exchange("/api/v1/user/profiles/merge", HttpMethod.POST, mapper.writeValueAsString(mapOf("manifest" to missingReferenceManifest)), admin.cookie, admin.csrf)
        assertEquals(400, missingReference.statusCode.value())
        assertTrue(missingReference.body!!.contains("PROFILE_CONTENT_INVALID"))
        assertEquals(1, revision())
    }

    @Test
    fun `replace and profile merge reject compositions above the shared section limit`() {
        val sections = (1..101).joinToString(",") { index ->
            """{"key":"hero-$index","kind":"HERO","active":true,"sortOrder":$index,"content":{"title":"Hero $index","body":""}}"""
        }
        val oversized = exchange(
            "/api/v1/user/content/home", HttpMethod.PUT,
            """{"expectedRevision":0,"sections":[$sections]}""", admin.cookie, admin.csrf,
        )
        assertEquals(400, oversized.statusCode.value())
        assertTrue(oversized.body!!.contains("HOME_CONTENT_INVALID"))
        assertEquals(0, revision())
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM home_content_sections", Int::class.java))

        (1..100).forEach { index ->
            jdbc.update(
                "INSERT INTO home_content_sections(section_key,content,active,sort_order) VALUES (?,?::jsonb,true,?)",
                "seed-$index", """{"kind":"HERO","title":"Seed $index","body":""}""", index,
            )
        }
        val manifest = """{"profile_name":"universal-tools-profile","profile_version":"1.0.0","coreCompatibility":"1.x","content":{"homeSections":[{"sectionKey":"overflow","content":{"kind":"HERO","title":"Overflow","body":""}}]},"mergeSelection":{"homeSections":["overflow"]}}"""
        val merge = exchange("/api/v1/user/profiles/merge", HttpMethod.POST, mapper.writeValueAsString(mapOf("manifest" to manifest)), admin.cookie, admin.csrf)
        assertEquals(400, merge.statusCode.value())
        assertTrue(merge.body!!.contains("PROFILE_CONTENT_INVALID"))
        assertEquals(0, revision())
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM home_content_sections WHERE section_key='overflow'", Int::class.java))
    }

    private fun replaceBody(revision: Long, categoryId: Long, sku: String) = """{"expectedRevision":$revision,"sections":[
      {"key":"hero","kind":"HERO","active":true,"sortOrder":0,"content":{"title":"Welcome","body":"Local","ctaLabel":"Shop","ctaPath":"/catalog?from=home"}},
      {"key":"categories","kind":"CATEGORY_RAIL","active":true,"sortOrder":1,"content":{"title":"Categories","categoryIds":[$categoryId]}},
      {"key":"products","kind":"PRODUCT_RAIL","active":true,"sortOrder":2,"content":{"title":"Products","skus":["$sku"]}},
      {"key":"promo","kind":"PROMO_BANNER","active":false,"sortOrder":3,"content":{"title":"Promo","body":"Later"}}
    ]}"""

    private fun heroBody(revision: Long, title: String) = """{"expectedRevision":$revision,"sections":[{"key":"hero","kind":"HERO","active":true,"sortOrder":0,"content":{"title":"$title","body":"Body"}}]}"""

    private fun revision() = jdbc.queryForObject("SELECT revision FROM home_content_compositions WHERE singleton_id=1", Long::class.java)!!

    private fun provision(role: String): Session {
        val email = "${role.lowercase()}-${UUID.randomUUID()}@example.com"
        val hash = passwords.hash("a-very-long-password".toCharArray())
        val userId = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Content','User') RETURNING id", Long::class.java, email, hash)!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?", userId, role)
        val login = exchange("/api/v1/internal/auth/login", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password"}""")
        return Session(login.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'), login.headers.getFirst("X-CSRF-Token")!!, userId)
    }

    private fun activate(module: String) {
        val state = jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code=?", String::class.java, module)
        if (state == "ACTIVE") return
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code=?", Int::class.java, module)!!
        val sessionId = jdbc.queryForObject("SELECT id FROM identity_sessions WHERE subject_kind='USER' AND user_id=? AND revoked_at IS NULL ORDER BY issued_at DESC LIMIT 1", UUID::class.java, admin.userId)!!
        jdbc.query("SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)", { _, _ -> }, admin.userId, sessionId, module, version, "ACTIVE", jdbc.queryForObject("SELECT config::text FROM module_configurations WHERE module_code=?",String::class.java,module), UUID.randomUUID(), "test")
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
