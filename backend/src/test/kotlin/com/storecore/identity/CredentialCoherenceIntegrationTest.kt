package com.storecore.identity

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.persistence.*
import com.storecore.identity.infrastructure.security.*
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID
import java.util.concurrent.*
import java.util.concurrent.atomic.AtomicBoolean

class CredentialCoherenceIntegrationTest {
    @Test fun `upgrade preserves all legacy evidence without granting authority`() {
        assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM unified_access_challenges WHERE credential_evidence='LEGACY_UNVERIFIABLE' AND customer_credential_version IS NULL AND user_credential_version IS NULL", Int::class.java))
        legacy.forEach { (raw, consumed) ->
            assertEquals(consumed, jdbc.queryForObject("SELECT consumed_at IS NOT NULL FROM unified_access_challenges WHERE challenge_hash=?", Boolean::class.java, tokens.sha256(raw)))
            assertThrows(AccessChallengeRejected::class.java) { tx { challenges.consume(raw, "$raw-nonce", origin, AccessContext.CUSTOMER) } }
        }
        assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) {
            jdbc.update("UPDATE unified_access_challenges SET credential_evidence='VERIFIED',customer_credential_version=1,user_credential_version=1 WHERE challenge_hash=?", tokens.sha256(legacy.first().first))
        }
        flyway().validate()
    }

    @Test fun `email changes invalidate old candidates and only selected challenge realm`() {
        val pair = pair()
        val pending = tx { challenges.create(pair.first, pair.second, ReturnDestination.HOME, origin) }
        val issued = tx { identity.issue(pair.first) }
        val principal = issued.principal as CustomerPrincipal
        val coordinator = IdentityMutationCoordinator(transactions, identity, locks)
        coordinator.execute(principal, issued.csrfToken) {
            identity.updateCustomerProfile(principal, "changed-${UUID.randomUUID()}@example.test", "Changed", "Customer", null)
        }
        assertThrows(AuthenticationFailed::class.java) { tx { identity.issue(pair.first) } }
        assertThrows(AuthenticationFailed::class.java) {
            tx { val selected = challenges.consume(pending.challenge, pending.bindingNonce, origin, AccessContext.CUSTOMER); identity.issue(selected.candidate) }
        }
        assertEquals(false, jdbc.queryForObject("SELECT consumed_at IS NOT NULL FROM unified_access_challenges WHERE challenge_hash=?", Boolean::class.java, tokens.sha256(pending.challenge)))
        val user = tx { val selected = challenges.consume(pending.challenge, pending.bindingNonce, origin, AccessContext.USER); identity.issue(selected.candidate) }
        assertTrue(user.principal is InternalUserPrincipal)
        assertEquals(1L, jdbc.queryForObject("SELECT credential_version FROM users WHERE id=?", Long::class.java, pair.second.subjectId))
        assertEquals(2L, jdbc.queryForObject("SELECT credential_version FROM customers WHERE id=?", Long::class.java, pair.first.subjectId))
        assertThrows(org.springframework.dao.DataIntegrityViolationException::class.java) {
            jdbc.update("UPDATE unified_access_challenges SET user_credential_version=2 WHERE challenge_hash=?", tokens.sha256(pending.challenge))
        }
    }

    @Test fun `issuance waiting on subject root rejects version changed before lock release`() {
        val candidate = pair().first
        val executor = Executors.newSingleThreadExecutor()
        try {
            lateinit var result: Future<Boolean>
            tx {
                locks.acquire(IdentityMutationScope.Own(IdentitySubject(IdentityRealm.CUSTOMER, candidate.subjectId)))
                result = executor.submit<Boolean> {
                    try { tx { identity.issue(candidate) }; false } catch (_: AuthenticationFailed) { true }
                }
                awaitAdvisoryWait()
                jdbc.update("UPDATE customers SET credential_version=credential_version+1 WHERE id=?", candidate.subjectId)
            }
            assertTrue(result.get(10, TimeUnit.SECONDS))
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM identity_sessions WHERE customer_id=?", Int::class.java, candidate.subjectId))
        } finally { executor.shutdownNow() }
    }

    @Test fun `crossed admin revocations serialize and revoked actor has no effects`() {
        val a = tx { identity.issue(pair().second) }
        val b = tx { identity.issue(pair().second) }
        val coordinator = IdentityMutationCoordinator(transactions, identity, locks)
        val gate = CyclicBarrier(2)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val results = listOf(a to b, b to a).map { (actor, target) ->
                executor.submit<Boolean> {
                    gate.await(5, TimeUnit.SECONDS)
                    try {
                        val principal = actor.principal as InternalUserPrincipal
                        coordinator.executeForSession(principal, actor.csrfToken, target.principal.sessionId) {
                            identity.revokeAsAdmin(principal, target.principal.sessionId, "CROSSED_TEST", UUID.randomUUID())
                        }
                        true
                    } catch (_: CsrfInvalid) { false } catch (_: AuthenticationFailed) { false }
                }
            }.map { it.get(15, TimeUnit.SECONDS) }
            assertEquals(1, results.count { it })
        } finally { executor.shutdownNow() }
    }

    @Test fun `actor revoked while waiting cannot publish mutation or rotate csrf`() {
        val issued = tx { identity.issue(pair().first) }
        val effect = AtomicBoolean(false)
        val executor = Executors.newSingleThreadExecutor()
        val coordinator = IdentityMutationCoordinator(transactions, identity, locks)
        try {
            lateinit var result: Future<Boolean>
            tx {
                locks.acquire(locks.own(issued.principal))
                result = executor.submit<Boolean> {
                    try { coordinator.execute(issued.principal, issued.csrfToken) { effect.set(true) }; false }
                    catch (_: CsrfInvalid) { true } catch (_: AuthenticationFailed) { true }
                }
                awaitAdvisoryWait()
                identity.revokeAsSystem(issued.principal.sessionId, "WAIT_TEST", UUID.randomUUID())
            }
            assertTrue(result.get(10, TimeUnit.SECONDS))
            assertFalse(effect.get())
            assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM identity_session_csrf_tokens WHERE session_id=?", Int::class.java, issued.principal.sessionId))
        } finally { executor.shutdownNow() }
    }

    @Test fun `unchanged canonical email leaves credential version intact`() {
        val candidate = pair().first
        val issued = tx { identity.issue(candidate) }
        val principal = issued.principal as CustomerPrincipal
        val email = jdbc.queryForObject("SELECT email FROM customers WHERE id=?", String::class.java, candidate.subjectId)!!
        IdentityMutationCoordinator(transactions, identity, locks).execute(principal, issued.csrfToken) {
            identity.updateCustomerProfile(principal, " ${email.uppercase()} ", "Name", "Only", null)
        }
        assertEquals(1L, jdbc.queryForObject("SELECT credential_version FROM customers WHERE id=?", Long::class.java, candidate.subjectId))
        assertNotNull(tx { identity.issue(candidate) })
    }

    @Test fun `customer suspension waits for credential mutation root without deadlock`() {
        val pair = pair()
        val customerSession = tx { identity.issue(pair.first) }
        val adminSession = tx { identity.issue(pair.second) }
        val actor = adminSession.principal as InternalUserPrincipal
        val repository = com.storecore.customers.infrastructure.JdbcCustomerAdministrationRepository(jdbc, locks)
        val coordinator = IdentityMutationCoordinator(transactions, identity, locks)
        val executor = Executors.newSingleThreadExecutor()
        try {
            lateinit var result: Future<com.storecore.customers.domain.CustomerSummary>
            tx {
                locks.acquire(locks.own(customerSession.principal))
                result = executor.submit<com.storecore.customers.domain.CustomerSummary> {
                    coordinator.executeForCustomer(actor, adminSession.csrfToken, pair.first.subjectId) {
                        repository.changeState(actor, pair.first.subjectId, com.storecore.customers.domain.CustomerAccountState.SUSPENDED)
                    }.value
                }
                awaitAdvisoryWait()
                // Corte A exercises the version-change transaction; recovery itself belongs to V18.
                jdbc.update("UPDATE customers SET credential_version=credential_version+1 WHERE id=?", pair.first.subjectId)
                identity.revokeAsSystem(customerSession.principal.sessionId, "CREDENTIAL_CHANGE_TEST", UUID.randomUUID())
            }
            assertEquals(com.storecore.customers.domain.CustomerAccountState.SUSPENDED, result.get(10, TimeUnit.SECONDS).state)
            assertEquals(false, jdbc.queryForObject("SELECT active FROM customers WHERE id=?", Boolean::class.java, pair.first.subjectId))
            assertThrows(AuthenticationFailed::class.java) { tx { identity.issue(pair.first) } }
        } finally { executor.shutdownNow() }
    }

    @Test fun `identity roots do not collide with domain bigint command locks`() {
        val candidate = pair().first
        val executor = Executors.newSingleThreadExecutor()
        try {
            tx {
                jdbc.query("SELECT pg_advisory_xact_lock(?)", { _, _ -> true }, candidate.subjectId)
                val issued = executor.submit<IssuedCredentials> { tx { identity.issue(candidate) } }
                assertTrue(issued.get(5, TimeUnit.SECONDS).principal is CustomerPrincipal)
            }
        } finally { executor.shutdownNow() }
    }

    @Test fun `direct capability definer shares identity root and rechecks revoked authority`() {
        val issued = tx { identity.issue(pair().second) }
        val actor = issued.principal as InternalUserPrincipal
        val executor = Executors.newSingleThreadExecutor()
        try {
            lateinit var result: Future<Boolean>
            tx {
                locks.acquire(locks.own(actor))
                result = executor.submit<Boolean> {
                    try {
                        tx { jdbc.query("SELECT capability_assert_live_admin_session(?,?)", { _, _ -> true }, actor.userId, actor.sessionId) }
                        false
                    } catch (_: org.springframework.dao.DataAccessException) { true }
                }
                awaitAdvisoryWait()
                identity.revokeAsSystem(actor.sessionId, "DEFINER_WAIT_TEST", UUID.randomUUID())
            }
            assertTrue(result.get(10, TimeUnit.SECONDS))
        } finally { executor.shutdownNow() }
    }

    private fun awaitAdvisoryWait() {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5)
        while (System.nanoTime() < deadline) {
            if ((jdbc.queryForObject("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND NOT granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())", Int::class.java) ?: 0) > 0) return
            Thread.sleep(10)
        }
        fail<Unit>("Worker did not reach the advisory root")
    }

    private fun pair(): Pair<VerifiedAccessCandidate.Customer, VerifiedAccessCandidate.User> {
        val email = "${UUID.randomUUID()}@example.test"
        val hash = passwords.hash(password.toCharArray())
        jdbc.update("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Test','Customer')", email, hash)
        val id = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Test','Admin') RETURNING id", Long::class.java, email, hash)!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code='ADMIN'", id)
        return (identity.verify(IdentityRealm.CUSTOMER, CanonicalEmail.fromWire(email)!!, password) as VerifiedAccessCandidate.Customer) to
            (identity.verify(IdentityRealm.USER, CanonicalEmail.fromWire(email)!!, password) as VerifiedAccessCandidate.User)
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        private lateinit var jdbc: JdbcTemplate
        private lateinit var transactions: TransactionTemplate
        private lateinit var identity: JdbcIdentityService
        private lateinit var locks: IdentityMutationLocks
        private lateinit var challenges: JdbcAccessChallengeStore
        private val passwords = Argon2PasswordHasher()
        private val tokens = OpaqueTokenFactory()
        private val legacy = mutableListOf<Pair<String, Boolean>>()
        private const val password = "a-very-long-password"
        private const val origin = "https://example.test"
        private fun <T : Any> tx(block: () -> T): T = transactions.execute { block() }!!
        private fun flyway(target: String? = null): Flyway {
            val config = Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration")
            if (target != null) config.target(target)
            return config.load()
        }
        @JvmStatic @BeforeAll fun start() {
            postgres.start()
            flyway("16").migrate()
            jdbc = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
            transactions = TransactionTemplate(DataSourceTransactionManager(jdbc.dataSource!!))
            val hash = passwords.hash(password.toCharArray())
            val customer = jdbc.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES ('legacy@example.test',?,'Legacy','Customer') RETURNING id", Long::class.java, hash)!!
            val user = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES ('legacy@example.test',?,'Legacy','User') RETURNING id", Long::class.java, hash)!!
            repeat(3) { index ->
                val raw = "legacy-${UUID.randomUUID()}"
                val consumed = index == 1
                val issued = if (index == 2) "clock_timestamp()-interval '180 seconds'" else "clock_timestamp()-interval '1 second'"
                jdbc.update(
                    """WITH issued AS (SELECT $issued AS value)
                       INSERT INTO unified_access_challenges(id,challenge_hash,binding_nonce_hash,accepted_origin,customer_id,user_id,return_destination,issued_at,expires_at,consumed_at)
                       SELECT ?,?,?,?,?,?,'HOME',value,value+interval '120 seconds',CASE WHEN ? THEN value ELSE NULL END FROM issued""",
                    UUID.randomUUID(), tokens.sha256(raw), tokens.sha256("$raw-nonce"), origin, customer, user, consumed,
                )
                legacy += raw to consumed
            }
            val history = jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history ORDER BY installed_rank")
            flyway().migrate()
            assertEquals(history, jdbc.queryForList("SELECT version,checksum FROM flyway_schema_history WHERE version<>'17' ORDER BY installed_rank"))
            locks = IdentityMutationLocks(jdbc)
            identity = JdbcIdentityService(jdbc, passwords, tokens, LoginRateLimiter(), LoginAttemptBudget(), locks)
            challenges = JdbcAccessChallengeStore(jdbc, tokens, locks)
        }
        @JvmStatic @AfterAll fun stop() = postgres.stop()
    }
}
