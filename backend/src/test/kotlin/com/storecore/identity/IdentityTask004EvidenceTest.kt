package com.storecore.identity

import com.storecore.identity.application.AuthenticationFailed
import com.storecore.identity.application.ResourceNotFound
import com.storecore.identity.domain.CustomerPrincipal
import com.storecore.identity.domain.IdentityRealm
import com.storecore.identity.infrastructure.bootstrap.BootstrapAdminRunner
import com.storecore.identity.infrastructure.persistence.JdbcIdentityService
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import com.storecore.identity.infrastructure.security.LoginRateLimiter
import com.storecore.identity.infrastructure.security.OpaqueTokenFactory
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.util.concurrent.Executors

class IdentityTask004EvidenceTest {
    @Test
    fun `bootstrap is once-only and concurrent callers leave one admin and one immutable marker`() {
        val transactions = TransactionTemplate(Companion.transactionManager)
        val runner = BootstrapAdminRunner(jdbc, passwords, transactions)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val futures = (1..2).map { index ->
                executor.submit<Throwable?> {
                    try {
                        transactions.executeWithoutResult {
                            runner.bootstrap("bootstrap-${index}@example.com", "a-strong-bootstrap-password".toCharArray())
                        }
                        null
                    } catch (failure: Throwable) {
                        failure
                    }
                }
            }
            val failures = futures.mapNotNull { it.get() }
            assertEquals(1, failures.size)
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE email LIKE 'bootstrap-%@example.com'", Int::class.java))
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM installation_bootstrap_markers", Int::class.java))
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE event_type='BOOTSTRAP_ADMIN_CREATED'", Int::class.java))
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `default address remains unique and foreign ownership is hidden`() {
        val owner = identity.registerCustomer("owner-${System.nanoTime()}@example.com", "a-very-long-password", "Owner", "One")
        val ownerPrincipal = owner.principal as CustomerPrincipal
        val first = identity.addCustomerAddress(ownerPrincipal, "Main", "1", "City", "Province", "1000", true)
        val second = identity.addCustomerAddress(ownerPrincipal, "Second", "2", "City", "Province", "1000", true)

        assertEquals(false, jdbc.queryForObject("SELECT is_default FROM customer_addresses WHERE id=?", Boolean::class.java, first.id))
        assertEquals(true, jdbc.queryForObject("SELECT is_default FROM customer_addresses WHERE id=?", Boolean::class.java, second.id))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM customer_addresses WHERE customer_id=? AND is_default", Int::class.java, ownerPrincipal.customerId))
        assertEquals(second.id, jdbc.queryForObject("SELECT id FROM customer_addresses WHERE customer_id=? AND is_default", Long::class.java, ownerPrincipal.customerId))

        val stranger = identity.registerCustomer("stranger-${System.nanoTime()}@example.com", "a-very-long-password", "Other", "Two")
        val strangerPrincipal = stranger.principal as CustomerPrincipal
        assertThrows(ResourceNotFound::class.java) {
            identity.updateCustomerAddress(strangerPrincipal, first.id, "Tampered", "9", "City", "Province", "1000", true)
        }
        assertEquals("Main", jdbc.queryForObject("SELECT street FROM customer_addresses WHERE id=?", String::class.java, first.id))
    }

    @Test
    fun `logout revocation is auditable and idempotent`() {
        val issued = identity.registerCustomer("revocation-${System.nanoTime()}@example.com", "a-very-long-password", "Revoked", "User")
        val principal = issued.principal as CustomerPrincipal
        identity.logout(principal)
        identity.logout(principal)

        assertThrows(AuthenticationFailed::class.java) {
            identity.authenticate(IdentityRealm.CUSTOMER, issued.sessionToken)
        }
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM identity_sessions WHERE id=? AND revoked_at IS NOT NULL", Int::class.java, principal.sessionId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE event_type='IDENTITY_SESSION_REVOKED' AND aggregate_reference=?", Int::class.java, principal.sessionId))
        assertTrue(jdbc.queryForObject("SELECT reason_code FROM audit_events WHERE event_type='IDENTITY_SESSION_REVOKED' AND aggregate_reference=?", String::class.java, principal.sessionId) == "SELF_LOGOUT")
    }

    @Test
    fun `system revoke and expired sessions cannot be revived`() {
        val issued = identity.registerCustomer("system-${System.nanoTime()}@example.com", "a-very-long-password", "System", "Revoke")
        val principal = issued.principal as CustomerPrincipal
        identity.revokeAsSystem(principal.sessionId, "idle-expired", java.util.UUID.fromString("22222222-2222-4222-8222-222222222222"))
        assertThrows(AuthenticationFailed::class.java) { identity.authenticate(IdentityRealm.CUSTOMER, issued.sessionToken) }
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE event_type='IDENTITY_SESSION_REVOKED' AND reason_code='SYSTEM_REVOKED' AND aggregate_reference=?", Int::class.java, principal.sessionId))
        assertEquals("SYSTEM", jdbc.queryForObject("SELECT actor_type FROM audit_events WHERE event_type='IDENTITY_SESSION_REVOKED' AND aggregate_reference=?", String::class.java, principal.sessionId))

        val expired = identity.registerCustomer("idle-${System.nanoTime()}@example.com", "a-very-long-password", "Idle", "User")
        val expiredPrincipal = expired.principal as CustomerPrincipal
        val tokens = OpaqueTokenFactory()
        val raw = tokens.nextRawToken()
        jdbc.update(
            """INSERT INTO identity_sessions(id,subject_kind,customer_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
               VALUES(?,?,?,?,clock_timestamp()-interval '2 hours',clock_timestamp()-interval '90 minutes',clock_timestamp()-interval '60 minutes',clock_timestamp()+interval '10 hours')""",
            java.util.UUID.fromString("33333333-3333-4333-8333-333333333333"),
            "CUSTOMER",
            expiredPrincipal.customerId,
            tokens.sha256(raw),
        )
        assertThrows(AuthenticationFailed::class.java) { identity.authenticate(IdentityRealm.CUSTOMER, raw) }
    }

    @Test
    fun `argon constraint names and csrf concurrent replay are enforced`() {
        val names = jdbc.queryForList("SELECT conname FROM pg_constraint WHERE conrelid IN ('users'::regclass,'customers'::regclass) AND contype='c'", String::class.java)
        assertTrue(names.contains("ck_users_email_canonical"))
        assertTrue(names.contains("ck_customers_email_canonical"))

        val issued = identity.registerCustomer("csrf-${System.nanoTime()}@example.com", "a-very-long-password", "Csrf", "Race")
        val principal = issued.principal as CustomerPrincipal
        val executor = Executors.newFixedThreadPool(2)
        try {
            val results = (1..2).map {
                executor.submit<Throwable?> {
                    try {
                        identity.verifyCsrf(principal, issued.csrfToken)
                        identity.rotateCsrf(principal)
                        null
                    } catch (failure: Throwable) {
                        failure
                    }
                }
            }.map { it.get() }
            assertEquals(true, results.count { it == null } >= 1)
            assertEquals(true, results.any { it != null })
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `concurrent default selection is serialized per customer`() {
        val issued = identity.registerCustomer("concurrent-${System.nanoTime()}@example.com", "a-very-long-password", "Concurrent", "Default")
        val principal = issued.principal as CustomerPrincipal
        val executor = Executors.newFixedThreadPool(4)
        try {
            val futures = (1..4).map { index -> executor.submit {
                org.springframework.transaction.support.TransactionTemplate(transactionManager).execute { identity.addCustomerAddress(principal, "Concurrent", index.toString(), "City", "Province", "1000", true) }
            } }
            futures.forEach { it.get() }
        } finally {
            executor.shutdownNow()
        }
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM customer_addresses WHERE customer_id=? AND is_default", Int::class.java, principal.customerId))
        assertEquals(4, jdbc.queryForObject("SELECT COUNT(*) FROM customer_addresses WHERE customer_id=?", Int::class.java, principal.customerId))
    }

    @Test
    fun `registration enforces code point bounds and login keeps uniform authentication failure`() {
        assertThrows(com.storecore.identity.application.RegistrationRejected::class.java) {
            identity.registerCustomer("short-${System.nanoTime()}@example.com", "12345678901", "Short", "Password")
        }
        val validPassword = "12345678901😀"
        val email = "bounds-${System.nanoTime()}@example.com"
        val issued = identity.registerCustomer(email, validPassword, "Unicode", "Bounds")
        assertTrue(identity.authenticate(IdentityRealm.CUSTOMER, issued.sessionToken) is CustomerPrincipal)
        assertThrows(AuthenticationFailed::class.java) {
            identity.login(IdentityRealm.CUSTOMER, email, "12345678901")
        }
        assertThrows(AuthenticationFailed::class.java) {
            identity.login(IdentityRealm.CUSTOMER, "missing-${System.nanoTime()}@example.com", "x".repeat(129))
        }
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        private lateinit var jdbc: JdbcTemplate
        private lateinit var identity: JdbcIdentityService
        private lateinit var passwords: Argon2PasswordHasher
        private lateinit var transactionManager: DataSourceTransactionManager

        @JvmStatic
        @BeforeAll
        fun startDatabase() {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
            val dataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            jdbc = JdbcTemplate(dataSource)
            passwords = Argon2PasswordHasher()
            transactionManager = DataSourceTransactionManager(dataSource)
            identity = JdbcIdentityService(jdbc, passwords, OpaqueTokenFactory(), LoginRateLimiter())
        }

        @JvmStatic
        @AfterAll
        fun stopDatabase() = postgres.stop()
    }
}
