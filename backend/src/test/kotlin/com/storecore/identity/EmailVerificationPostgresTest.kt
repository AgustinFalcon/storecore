package com.storecore.identity

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.persistence.*
import com.storecore.identity.infrastructure.security.*
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.Executors

class EmailVerificationPostgresTest {
    @Test fun `scanner cannot consume token and concurrent explicit confirmation credits once with realm isolation`() = database { jdbc, tx, repository ->
        val email = "${UUID.randomUUID()}@example.test"
        val customer = customer(jdbc, email)
        val user = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,'Verify','User') RETURNING id", Long::class.java, email, "\$argon2id\$fixture")!!
        val dispatch = tx.execute { repository.issue(CustomerPrincipal(UUID.randomUUID(), customer)) }!!
        val before = jdbc.queryForList("SELECT * FROM identity_email_verification_tokens WHERE id=?", dispatch.id)
        repeat(3) { assertEquals(EmailVerificationStatus.READY, repository.inspect(RecoveryRealm.CUSTOMER, dispatch.secret).status) }
        assertEquals(before, jdbc.queryForList("SELECT * FROM identity_email_verification_tokens WHERE id=?", dispatch.id))
        assertEquals(EmailVerificationStatus.INVALID_LINK, repository.inspect(RecoveryRealm.USER, dispatch.secret).status)
        assertEquals(EmailOwnershipState.Unknown, repository.ownership(IdentitySubject(IdentityRealm.CUSTOMER, customer)))
        val executor = Executors.newFixedThreadPool(2)
        val results = try {
            executor.invokeAll(List(2) { Callable { tx.execute { repository.complete(RecoveryRealm.CUSTOMER, dispatch.secret) } } }).map { it.get() }
        } finally { executor.shutdownNow() }
        assertEquals(1, results.count { it == EmailVerificationCompletion.VERIFIED })
        assertEquals(1, results.count { it == EmailVerificationCompletion.USED_LINK })
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM identity_email_verification_evidence", Int::class.java))
        assertEquals(EmailOwnershipState.VERIFIED, repository.ownership(IdentitySubject(IdentityRealm.CUSTOMER, customer)))
        assertEquals(EmailOwnershipState.Unknown, repository.ownership(IdentitySubject(IdentityRealm.USER, user)))
        jdbc.update("UPDATE customers SET password_hash=? WHERE id=?", "\$argon2id\$changed", customer)
        assertEquals(EmailOwnershipState.VERIFIED, repository.ownership(IdentitySubject(IdentityRealm.CUSTOMER, customer)))
        val pending = tx.execute { repository.issue(CustomerPrincipal(UUID.randomUUID(), customer)) }!!
        jdbc.update("UPDATE customers SET email=? WHERE id=?", "${UUID.randomUUID()}@example.test", customer)
        assertEquals(EmailOwnershipState.Unknown, repository.ownership(IdentitySubject(IdentityRealm.CUSTOMER, customer)))
        assertEquals(EmailVerificationStatus.SUPERSEDED_LINK, repository.inspect(RecoveryRealm.CUSTOMER, pending.secret).status)
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM identity_email_verification_evidence", Int::class.java))
        assertFalse(jdbc.queryForMap("SELECT * FROM identity_email_verification_tokens WHERE id=?", dispatch.id).values.any { it?.toString()?.contains(dispatch.secret.value) == true })
    }

    @Test fun `live token cap is serialized and failed enqueue rolls token back`() = database { jdbc, tx, repository ->
        val principal = CustomerPrincipal(UUID.randomUUID(), customer(jdbc, "${UUID.randomUUID()}@example.test"))
        val boundary = object : EmailVerificationTransactions {
            override fun <T : Any> execute(effect: () -> T): T = tx.execute { effect() }!!
        }
        val rejected = object : EmailVerificationDeliveryPort {
            override val readiness = EmailDeliveryReadiness.READY
            override fun enqueue(dispatch: EmailVerificationDispatch): EmailDeliveryReadiness = error("fixture enqueue unavailable")
        }
        assertEquals(VerificationRequestState.ACCEPTED, RequestEmailVerificationStep(repository, rejected, EmailVerificationAttemptBudget(), boundary).execute(principal))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM identity_email_verification_tokens", Int::class.java))
        val executor = Executors.newFixedThreadPool(4)
        val issued = try {
            executor.invokeAll(List(4) { Callable { tx.execute { repository.issue(principal) } } }).map { it.get() }
        } finally { executor.shutdownNow() }
        assertEquals(3, issued.count { it != null })
        assertEquals(3, jdbc.queryForObject("SELECT count(*) FROM identity_email_verification_tokens", Int::class.java))
    }

    private fun customer(jdbc: JdbcTemplate, email: String) = jdbc.queryForObject(
        "INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Verify','Customer') RETURNING id", Long::class.java, email, "\$argon2id\$fixture",
    )!!
    private fun database(action: (JdbcTemplate, TransactionTemplate, JdbcEmailVerificationRepository) -> Unit) {
        PostgreSQLContainer<Nothing>("postgres:16-alpine").use { pg ->
            pg.start()
            val dataSource = DriverManagerDataSource(pg.jdbcUrl, pg.username, pg.password)
            Flyway.configure().dataSource(dataSource).locations("classpath:db/migration").load().migrate()
            val jdbc = JdbcTemplate(dataSource)
            action(jdbc, TransactionTemplate(DataSourceTransactionManager(dataSource)), JdbcEmailVerificationRepository(jdbc, IdentityMutationLocks(jdbc), VerificationTokens()))
        }
    }
}
