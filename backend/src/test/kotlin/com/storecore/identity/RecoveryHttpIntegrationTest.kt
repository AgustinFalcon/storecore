package com.storecore.identity

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.persistence.IdentityMutationLocks
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.AfterEach
import org.apache.hc.client5.http.impl.classic.HttpClients
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory
import org.junit.jupiter.api.Assertions.*
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Import
import org.springframework.http.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Instant
import java.net.URI
import java.util.UUID
import java.util.concurrent.*

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
@Import(RecoveryCaptureConfiguration::class)
class RecoveryHttpIntegrationTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val mapper: ObjectMapper,
    @Autowired private val passwords: Argon2PasswordHasher,
    @Autowired private val capture: RecoveryCaptureDelivery,
    @Autowired private val identity: IdentityUseCases,
    @Autowired private val verifier: CandidateAuthenticationPort,
    @Autowired private val issuer: RealmSessionIssuer,
    @Autowired private val challenges: AccessChallengePort,
    @Autowired private val unified: UnifiedAccessUseCases,
    @Autowired private val recovery: RecoveryUseCases,
    @Autowired private val transactions: TransactionTemplate,
    @Autowired private val locks: IdentityMutationLocks,
    @LocalServerPort private val port: Int,
) {
    private val noRetryClient = HttpClients.custom().disableAutomaticRetries().build()
    @BeforeEach fun disableRetries() { http.restTemplate.requestFactory = HttpComponentsClientHttpRequestFactory(noRetryClient) }
    @AfterEach fun closeClient() { noRetryClient.close() }
    @Test fun `request is neutral for absent inactive roleless and eligible accounts and stores only hashes`() {
        val eligible = fixture()
        val inactive = fixture()
        jdbc.update("UPDATE customers SET active=false WHERE id=?", inactive.customer)
        val roleless = fixture()
        jdbc.update("DELETE FROM user_roles WHERE user_id=?", roleless.user)
        val responses = listOf(
            request(RecoveryRealm.CUSTOMER, eligible.email),
            request(RecoveryRealm.CUSTOMER, "absent-${UUID.randomUUID()}@example.test"),
            request(RecoveryRealm.CUSTOMER, inactive.email),
            request(RecoveryRealm.USER, roleless.email),
        )
        responses.forEach {
            assertEquals(202, it.statusCode.value()); assertEquals("no-store", it.headers.cacheControl)
            assertFalse(it.headers.containsKey(HttpHeaders.SET_COOKIE))
            assertEquals(responses.first().body, it.body)
        }
        val dispatch = capture.latest(RecoveryRealm.CUSTOMER, eligible.email)
        val row = jdbc.queryForMap("SELECT * FROM identity_recovery_tokens WHERE id=?", dispatch.id)
        assertEquals(64, row["token_hash"].toString().length)
        assertFalse(row.values.any { it?.toString()?.contains(dispatch.secret.value) == true })
        assertFalse(responses.first().body!!.contains(dispatch.secret.value))
        val before = jdbc.queryForObject("SELECT count(*) FROM identity_recovery_tokens", Int::class.java)
        val ready = inspect(RecoveryRealm.CUSTOMER, dispatch.secret.value)
        assertEquals("READY", kind(ready)); assertEquals(dispatch.expiresAt, Instant.parse(mapper.readTree(ready.body)["data"]["expiresAt"].asText()))
        assertEquals(before, jdbc.queryForObject("SELECT count(*) FROM identity_recovery_tokens", Int::class.java))
        assertEquals("PENDING", jdbc.queryForObject("SELECT state FROM identity_recovery_tokens WHERE id=?", String::class.java, dispatch.id))
    }

    @Test fun `completion is single realm no autologin revokes live sessions and preserves expired evidence`() {
        val account = fixture()
        val customer1 = identity.login(IdentityRealm.CUSTOMER, account.email, original, "login-${UUID.randomUUID()}")
        val customer2 = identity.login(IdentityRealm.CUSTOMER, account.email, original, "login-${UUID.randomUUID()}")
        val user = identity.login(IdentityRealm.USER, account.email, original, "login-${UUID.randomUUID()}")
        val expiredId = UUID.randomUUID()
        jdbc.update("""INSERT INTO identity_sessions(id,subject_kind,customer_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
            VALUES(?,'CUSTOMER',?,repeat('9',64),clock_timestamp()-interval '2 hours',clock_timestamp()-interval '90 minutes',clock_timestamp()-interval '60 minutes',clock_timestamp()+interval '10 hours')""", expiredId, account.customer)
        val token = token(account)
        val csrfBefore = jdbc.queryForObject("SELECT count(*) FROM identity_session_csrf_tokens", Int::class.java)
        val response = complete(RecoveryRealm.CUSTOMER, token.secret.value)
        assertEquals("COMPLETED", kind(response))
        val cookies = response.headers[HttpHeaders.SET_COOKIE] ?: emptyList()
        assertEquals(1, cookies.size); assertTrue(cookies.single().contains("__Host-storecore-customer=")); assertTrue(cookies.single().contains("Max-Age=0"))
        assertFalse(response.headers.containsKey("X-CSRF-Token"))
        assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM identity_sessions WHERE customer_id=?", Int::class.java, account.customer))
        assertEquals(2, jdbc.queryForObject("SELECT count(*) FROM identity_sessions WHERE customer_id=? AND revocation_kind='SYSTEM' AND revoked_reason='PASSWORD_RECOVERY'", Int::class.java, account.customer))
        assertEquals(false, jdbc.queryForObject("SELECT revoked_at IS NOT NULL FROM identity_sessions WHERE id=?", Boolean::class.java, expiredId))
        listOf(customer1, customer2).forEach {
            assertThrows(AuthenticationFailed::class.java) { identity.authenticate(IdentityRealm.CUSTOMER, it.sessionToken) }
            assertThrows(CsrfInvalid::class.java) { identity.verifyCsrf(it.principal, it.csrfToken) }
        }
        assertNotNull(identity.authenticate(IdentityRealm.USER, user.sessionToken))
        assertEquals(csrfBefore, jdbc.queryForObject("SELECT count(*) FROM identity_session_csrf_tokens", Int::class.java))
        assertThrows(AuthenticationFailed::class.java) { identity.login(IdentityRealm.CUSTOMER, account.email, original, "login-${UUID.randomUUID()}") }
        assertNotNull(identity.login(IdentityRealm.CUSTOMER, account.email, replacement, "login-${UUID.randomUUID()}"))
        assertNotNull(identity.login(IdentityRealm.USER, account.email, original, "login-${UUID.randomUUID()}"))
        assertEquals("USED_LINK", kind(inspect(RecoveryRealm.CUSTOMER, token.secret.value)))
    }

    @Test fun `same email user recovery preserves customer password session csrf and version`() {
        val account = fixture()
        val customer = identity.login(IdentityRealm.CUSTOMER, account.email, original, "login-${UUID.randomUUID()}")
        val user = identity.login(IdentityRealm.USER, account.email, original, "login-${UUID.randomUUID()}")
        val token = token(account, RecoveryRealm.USER)
        val response = complete(RecoveryRealm.USER, token.secret.value)
        assertEquals("COMPLETED", kind(response))
        assertTrue(response.headers.getFirst(HttpHeaders.SET_COOKIE)!!.contains("__Host-storecore-internal="))
        assertNotNull(identity.authenticate(IdentityRealm.CUSTOMER, customer.sessionToken))
        identity.verifyCsrf(customer.principal, customer.csrfToken)
        assertThrows(AuthenticationFailed::class.java) { identity.authenticate(IdentityRealm.USER, user.sessionToken) }
        assertEquals(1L, jdbc.queryForObject("SELECT credential_version FROM customers WHERE id=?", Long::class.java, account.customer))
        assertEquals(2L, jdbc.queryForObject("SELECT credential_version FROM users WHERE id=?", Long::class.java, account.user))
        assertNotNull(identity.login(IdentityRealm.USER, account.email, replacement, "login-${UUID.randomUUID()}"))
    }

    @Test fun `wrong realm malformed tokens and invalid password never mutate credentials`() {
        val account = fixture()
        val token = token(account)
        assertEquals("INVALID_LINK", kind(inspect(RecoveryRealm.USER, token.secret.value)))
        assertEquals("INVALID_LINK", kind(complete(RecoveryRealm.USER, token.secret.value)))
        assertEquals("INVALID_LINK", kind(inspect(RecoveryRealm.CUSTOMER, "malformed")))
        assertEquals(422, complete(RecoveryRealm.CUSTOMER, token.secret.value, "short").statusCode.value())
        assertEquals("READY", kind(inspect(RecoveryRealm.CUSTOMER, token.secret.value)))
        assertEquals(1L, jdbc.queryForObject("SELECT credential_version FROM customers WHERE id=?", Long::class.java, account.customer))
        val missingExpiry = mapper.readTree(inspect(RecoveryRealm.USER, token.secret.value).body)["data"]
        assertFalse(missingExpiry.has("expiresAt"))
    }

    @Test fun `concurrent completion and replay perform exactly one reset and audit even with zero sessions`() {
        val account = fixture()
        val token = token(account)
        val executor = Executors.newFixedThreadPool(2)
        val gate = CyclicBarrier(2)
        try {
            val results = (1..2).map {
                executor.submit<RecoveryCompletionResult> { gate.await(5, TimeUnit.SECONDS); recovery.complete(RecoveryRealm.CUSTOMER, token.secret.value, replacement, "race-${UUID.randomUUID()}") }
            }.map { it.get(15, TimeUnit.SECONDS) }
            assertEquals(1, results.count { it == RecoveryCompletionResult.COMPLETED })
            assertEquals(1, results.count { it == RecoveryCompletionResult.USED_LINK })
        } finally { executor.shutdownNow() }
        assertEquals("USED_LINK", kind(complete(RecoveryRealm.CUSTOMER, token.secret.value)))
        assertEquals(2L, jdbc.queryForObject("SELECT credential_version FROM customers WHERE id=?", Long::class.java, account.customer))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='IDENTITY_PASSWORD_RECOVERED' AND subject_kind='CUSTOMER' AND subject_reference=?", Int::class.java, account.customer))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM identity_sessions WHERE customer_id=?", Int::class.java, account.customer))
        assertTrue(jdbc.queryForObject("SELECT payload_redacted::text FROM audit_events WHERE event_type='IDENTITY_PASSWORD_RECOVERED' AND subject_reference=?", String::class.java, account.customer)!!.contains("0"))
    }

    @Test fun `three live tokens are bounded and email change atomically supersedes them without blocking new requests`() {
        val account = fixture()
        repeat(4) { request(RecoveryRealm.CUSTOMER, account.email) }
        assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM identity_recovery_tokens WHERE customer_id=?", Int::class.java, account.customer))
        val old = capture.latest(RecoveryRealm.CUSTOMER, account.email)
        val session = identity.login(IdentityRealm.CUSTOMER, account.email, original, "login-${UUID.randomUUID()}")
        val nextEmail = "new-${UUID.randomUUID()}@example.test"
        transactions.executeWithoutResult {
            identity.verifyCsrf(session.principal, session.csrfToken)
            identity.updateCustomerProfile(session.principal as CustomerPrincipal, nextEmail, "New", "Email", null)
        }
        assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM identity_recovery_tokens WHERE customer_id=? AND state='SUPERSEDED' AND terminal_reason='EMAIL_CHANGED'", Int::class.java, account.customer))
        assertEquals("SUPERSEDED_LINK", kind(inspect(RecoveryRealm.CUSTOMER, old.secret.value)))
        request(RecoveryRealm.CUSTOMER, nextEmail)
        assertEquals("READY", kind(inspect(RecoveryRealm.CUSTOMER, capture.latest(RecoveryRealm.CUSTOMER, nextEmail).secret.value)))
    }

    @Test fun `successful reset supersedes siblings and stale login challenge can only select unaffected realm`() {
        val account = fixture()
        val canonical = CanonicalEmail.fromWire(account.email)!!
        val customer = verifier.verify(IdentityRealm.CUSTOMER, canonical, original) as VerifiedAccessCandidate.Customer
        val user = verifier.verify(IdentityRealm.USER, canonical, original) as VerifiedAccessCandidate.User
        val challenge = transactions.execute { challenges.create(customer, user, ReturnDestination.HOME, origin) }!!
        val first = token(account)
        val second = token(account)
        assertEquals("COMPLETED", kind(complete(RecoveryRealm.CUSTOMER, first.secret.value)))
        assertEquals("SUPERSEDED_LINK", kind(inspect(RecoveryRealm.CUSTOMER, second.secret.value)))
        assertThrows(AuthenticationFailed::class.java) { issuer.issue(customer) }
        assertThrows(AccessChallengeRejected::class.java) { unified.select(challenge.challenge, challenge.bindingNonce, AccessContext.CUSTOMER.name, "challenge-a", origin) }
        assertEquals(AccessContext.USER, unified.select(challenge.challenge, challenge.bindingNonce, AccessContext.USER.name, "challenge-b", origin).context)
    }

    @Test fun `expiry is checked after waiting on token row lock`() {
        val account = fixture()
        val raw = "x".repeat(43)
        insertToken(account, raw, 899)
        val executor = Executors.newSingleThreadExecutor()
        try {
            lateinit var result: Future<RecoveryCompletionResult>
            transactions.executeWithoutResult {
                jdbc.queryForList("SELECT id FROM identity_recovery_tokens WHERE customer_id=? FOR UPDATE", account.customer)
                result = executor.submit<RecoveryCompletionResult> { recovery.complete(RecoveryRealm.CUSTOMER, raw, replacement, "expiry-test") }
                awaitLock()
                Thread.sleep(1300)
            }
            assertEquals(RecoveryCompletionResult.EXPIRED_LINK, result.get(10, TimeUnit.SECONDS))
            assertEquals(1L, jdbc.queryForObject("SELECT credential_version FROM customers WHERE id=?", Long::class.java, account.customer))
            assertEquals("EXPIRED_LINK", kind(inspect(RecoveryRealm.CUSTOMER, raw)))
        } finally { executor.shutdownNow() }
    }

    @Test fun `audit failure rolls back password token sibling revocations and version`() {
        val account = fixture()
        val session = identity.login(IdentityRealm.CUSTOMER, account.email, original, "login-${UUID.randomUUID()}")
        val token = token(account)
        jdbc.execute("""CREATE FUNCTION reject_recovery_test_audit() RETURNS TRIGGER LANGUAGE plpgsql AS 'BEGIN IF NEW.event_type=''IDENTITY_PASSWORD_RECOVERED'' THEN RAISE EXCEPTION ''forced test audit failure''; END IF; RETURN NEW; END;'""")
        jdbc.execute("CREATE TRIGGER reject_recovery_test_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_recovery_test_audit()")
        try { assertEquals(500, complete(RecoveryRealm.CUSTOMER, token.secret.value).statusCode.value()) }
        finally { jdbc.execute("DROP TRIGGER reject_recovery_test_audit ON audit_events"); jdbc.execute("DROP FUNCTION reject_recovery_test_audit()") }
        assertEquals(1L, jdbc.queryForObject("SELECT credential_version FROM customers WHERE id=?", Long::class.java, account.customer))
        assertEquals("READY", kind(inspect(RecoveryRealm.CUSTOMER, token.secret.value)))
        assertNotNull(identity.authenticate(IdentityRealm.CUSTOMER, session.sessionToken))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='IDENTITY_SESSION_REVOKED' AND aggregate_reference=?", Int::class.java, session.principal.sessionId))
    }

    @Test fun `delivery failure remains neutral and rolls back authorization`() {
        val account = fixture()
        capture.outcome = RecoveryDeliveryState.FAILED
        try { assertEquals(202, request(RecoveryRealm.CUSTOMER, account.email).statusCode.value()) }
        finally { capture.outcome = RecoveryDeliveryState.ACCEPTED }
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM identity_recovery_tokens WHERE customer_id=?", Int::class.java, account.customer))
    }

    @Test fun `customer suspension winning the root prevents pending reset effects`() {
        val account = fixture()
        val customer = identity.login(IdentityRealm.CUSTOMER, account.email, original, "login-${UUID.randomUUID()}")
        val admin = identity.login(IdentityRealm.USER, account.email, original, "login-${UUID.randomUUID()}").principal as InternalUserPrincipal
        val token = token(account)
        val repository = com.storecore.customers.infrastructure.JdbcCustomerAdministrationRepository(jdbc, locks)
        val executor = Executors.newSingleThreadExecutor()
        try {
            lateinit var result: Future<RecoveryCompletionResult>
            transactions.executeWithoutResult {
                locks.acquire(locks.customerTarget(admin, account.customer))
                result = executor.submit<RecoveryCompletionResult> { recovery.complete(RecoveryRealm.CUSTOMER, token.secret.value, replacement, "suspension-race") }
                awaitLock()
                repository.changeState(admin, account.customer, com.storecore.customers.domain.CustomerAccountState.SUSPENDED)
            }
            assertEquals(RecoveryCompletionResult.SUPERSEDED_LINK, result.get(10, TimeUnit.SECONDS))
            assertEquals(1L, jdbc.queryForObject("SELECT credential_version FROM customers WHERE id=?", Long::class.java, account.customer))
            assertEquals("PENDING", jdbc.queryForObject("SELECT state FROM identity_recovery_tokens WHERE id=?", String::class.java, token.id))
            assertThrows(AuthenticationFailed::class.java) { identity.authenticate(IdentityRealm.CUSTOMER, customer.sessionToken) }
        } finally { executor.shutdownNow() }
    }

    @Test fun `role removal and inactivity revoke token eligibility without inspection writes`() {
        val inactive = fixture()
        val customer = token(inactive)
        jdbc.update("UPDATE customers SET active=false WHERE id=?", inactive.customer)
        assertEquals("SUPERSEDED_LINK", kind(inspect(RecoveryRealm.CUSTOMER, customer.secret.value)))
        val roleless = fixture()
        val user = token(roleless, RecoveryRealm.USER)
        jdbc.update("DELETE FROM user_roles WHERE user_id=?", roleless.user)
        assertEquals("SUPERSEDED_LINK", kind(complete(RecoveryRealm.USER, user.secret.value)))
        assertEquals("PENDING", jdbc.queryForObject("SELECT state FROM identity_recovery_tokens WHERE id=?", String::class.java, user.id))
    }

    @Test fun `strict HTTP origin body and size contracts fail closed`() {
        val path = "/api/v1/customer/auth/recovery/requests"
        assertEquals(400, send(path, mapOf("email" to "valid@example.test", "realm" to "USER")).statusCode.value())
        assertEquals(400, send(path, mapOf("email" to 42)).statusCode.value())
        assertEquals(403, send(path, mapOf("email" to "valid@example.test"), "https://forged.example.test").statusCode.value())
        assertEquals(413, send(path, mapOf("email" to "x".repeat(5000))).statusCode.value())
    }

    @Test fun `V17 upgrade preserves history and recovery privileges constraints and immutable evidence`() {
        assertEquals(baselineHistory, jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE version NOT IN ('18','19') ORDER BY installed_rank"))
        assertEquals("19", jdbc.queryForObject("SELECT version FROM flyway_schema_history ORDER BY installed_rank DESC LIMIT 1", String::class.java))
        assertEquals(true, jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','identity_recovery_tokens','SELECT,INSERT,UPDATE')", Boolean::class.java))
        assertEquals(false, jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime','identity_recovery_tokens','DELETE')", Boolean::class.java))
        val token = token(fixture())
        assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) { jdbc.update("UPDATE identity_recovery_tokens SET token_hash=repeat('f',64) WHERE id=?", token.id) }
        assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) { jdbc.update("DELETE FROM identity_recovery_tokens WHERE id=?", token.id) }
    }

    private data class Account(val email: String, val customer: Long, val user: Long)
    private fun fixture(): Account {
        val email = "${UUID.randomUUID()}@example.test"
        val hash = passwords.hash(original.toCharArray())
        val customer = jdbc.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Recovery','Customer') RETURNING id", Long::class.java, email, hash)!!
        val user = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Recovery','User') RETURNING id", Long::class.java, email, hash)!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='ADMIN'", user)
        return Account(email, customer, user)
    }
    private fun token(account: Account, realm: RecoveryRealm = RecoveryRealm.CUSTOMER): RecoveryDispatch {
        assertEquals(202, request(realm, account.email).statusCode.value())
        return capture.latest(realm, account.email)
    }
    private fun request(realm: RecoveryRealm, email: String) = send(path(realm, "requests"), mapOf("email" to email))
    private fun inspect(realm: RecoveryRealm, token: String) = send(path(realm, "inspect"), mapOf("token" to token))
    private fun complete(realm: RecoveryRealm, token: String, password: String = replacement) = send(path(realm, "complete"), mapOf("token" to token, "newPassword" to password))
    private fun path(realm: RecoveryRealm, action: String) = "/api/v1/" + when (realm) { RecoveryRealm.CUSTOMER -> "customer"; RecoveryRealm.USER -> "internal"; RecoveryRealm.Unknown -> error("No unknown route") } + "/auth/recovery/$action"
    private fun send(path: String, body: Any, requestOrigin: String = origin): ResponseEntity<String> {
        val headers = HttpHeaders().apply { contentType = MediaType.APPLICATION_JSON; setOrigin(requestOrigin) }
        return http.exchange(URI("http://localhost:$port$path"), HttpMethod.POST, HttpEntity(mapper.writeValueAsString(body), headers), String::class.java)
    }
    private fun kind(response: ResponseEntity<String>) = mapper.readTree(response.body)["data"]?.get("kind")?.asText()
    private fun insertToken(account: Account, raw: String, ageSeconds: Int) {
        val tokens = com.storecore.identity.infrastructure.security.OpaqueTokenFactory()
        jdbc.update("""WITH issued AS (SELECT clock_timestamp()-make_interval(secs=>?) value)
            INSERT INTO identity_recovery_tokens(id,realm,customer_id,token_hash,credential_version,email_digest,issued_at,expires_at,correlation_id)
            SELECT ?,'CUSTOMER',?,?,1,?,value,value+interval '15 minutes',? FROM issued""", ageSeconds, UUID.randomUUID(), account.customer, tokens.sha256(raw), tokens.sha256(account.email), UUID.randomUUID())
    }
    private fun awaitLock() {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (System.nanoTime() < deadline) {
            if ((jdbc.queryForObject("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'", Int::class.java) ?: 0) > 0) return
            Thread.sleep(10)
        }
        fail<Unit>("Recovery did not reach lock wait")
    }
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        private lateinit var baselineHistory: List<Map<String, Any>>
        private const val origin = "http://localhost:4200"
        private const val original = "original-long-password"
        private const val replacement = "replacement-long-password"
        @JvmStatic @DynamicPropertySource fun database(registry: DynamicPropertyRegistry) {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").target("17").load().migrate()
            baselineHistory = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)).queryForList("SELECT version,checksum FROM flyway_schema_history ORDER BY installed_rank")
            registry.add("spring.datasource.url") { postgres.jdbcUrl }
            registry.add("spring.datasource.username") { postgres.username }
            registry.add("spring.datasource.password") { postgres.password }
        }
    }
}
