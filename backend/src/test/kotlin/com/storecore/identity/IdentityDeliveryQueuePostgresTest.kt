package com.storecore.identity

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.persistence.*
import com.storecore.identity.infrastructure.security.VerificationTokens
import com.storecore.identity.infrastructure.ConfiguredIdentityDeliveryBeans
import com.storecore.identity.infrastructure.IdentityDeliverySettings
import com.storecore.identity.infrastructure.IdentitySmtpTls
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Duration
import java.time.Instant
import java.sql.Timestamp
import java.util.Base64
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class IdentityDeliveryQueuePostgresTest {
    @Test fun `lease handoff marker and settlement commit independently of ambient transaction rollback`() = database { jdbc, tx, queue ->
        val id = event(jdbc, tx)
        val lease = tx.execute { outer ->
            val acquired = queue.acquire(UUID.randomUUID(), Instant.now(), Duration.ofSeconds(60))!!
            outer.setRollbackOnly()
            acquired
        }!!
        assertEquals(IdentityOutboxState.LEASED, state(jdbc, id))
        tx.execute { outer ->
            assertTrue(queue.beginHandoff(lease, Instant.now()))
            outer.setRollbackOnly()
        }
        assertNotNull(jdbc.queryForMap("SELECT handoff_started_at FROM identity_message_delivery WHERE event_id=?", id)["handoff_started_at"])
        tx.execute { outer ->
            assertTrue(queue.settle(lease, IdentityDeliverySettlement(IdentityOutboxState.SENT, IdentityDeliveryError.NONE), Instant.now()))
            outer.setRollbackOnly()
        }
        assertEquals(IdentityOutboxState.SENT, state(jdbc, id))
        assertEquals(0, secretCount(jdbc, id))
    }

    @Test fun `two workers lease distinct messages and skip a locked candidate`() = database { jdbc, tx, queue ->
        val first = event(jdbc, tx)
        val second = event(jdbc, tx)
        val locked = CountDownLatch(1)
        val release = CountDownLatch(1)
        val executor = Executors.newFixedThreadPool(2)
        try {
            val lock = executor.submit { tx.execute {
                jdbc.queryForMap("SELECT * FROM identity_message_delivery WHERE event_id=? FOR UPDATE", first)
                locked.countDown()
                check(release.await(10, TimeUnit.SECONDS))
            } }
            assertTrue(locked.await(5, TimeUnit.SECONDS))
            val next = executor.submit(Callable { queue.acquire(UUID.randomUUID(), Instant.now(), Duration.ofSeconds(60)) }).get(5, TimeUnit.SECONDS)!!
            assertEquals(second, next.eventId)
            release.countDown()
            lock.get(5, TimeUnit.SECONDS)
            val other = queue.acquire(UUID.randomUUID(), Instant.now(), Duration.ofSeconds(60))!!
            assertEquals(first, other.eventId)
            assertNotEquals(next.owner, other.owner)
            assertNull(queue.acquire(UUID.randomUUID(), Instant.now(), Duration.ofSeconds(60)))
            assertEquals(1, next.attempt)
            val concurrentIds = setOf(event(jdbc, tx), event(jdbc, tx))
            val start = CountDownLatch(1)
            val claims = List(2) { executor.submit(Callable {
                check(start.await(5, TimeUnit.SECONDS))
                queue.acquire(UUID.randomUUID(), Instant.now(), Duration.ofSeconds(60))!!.eventId
            }) }
            start.countDown()
            assertEquals(concurrentIds, claims.map { it.get(5, TimeUnit.SECONDS) }.toSet())
        } finally { release.countDown(); executor.shutdownNow() }
    }

    @Test fun `CAS rejects wrong owner duplicate handoff and stale settlement and terminal destroys all secret metadata`() = database { jdbc, tx, queue ->
        val id = event(jdbc, tx)
        val lease = queue.acquire(UUID.randomUUID(), Instant.now(), Duration.ofSeconds(60))!!
        assertEquals(IdentityDeliveryEligibility.READY, queue.revalidate(lease, Instant.now()))
        val wrong = IdentityDeliveryLease(lease.eventId, UUID.randomUUID(), lease.attempt, lease.expiresAt, lease.context, lease.realm, lease.tokenExpiresAt, lease.envelope)
        assertFalse(queue.beginHandoff(wrong, Instant.now()))
        assertFalse(queue.settle(wrong, IdentityDeliverySettlement(IdentityOutboxState.CANCELLED, IdentityDeliveryError.INVALIDATED), Instant.now()))
        assertTrue(queue.beginHandoff(lease, Instant.now()))
        assertFalse(queue.beginHandoff(lease, Instant.now()))
        assertTrue(queue.settle(lease, IdentityDeliverySettlement(IdentityOutboxState.SENT, IdentityDeliveryError.NONE), Instant.now()))
        assertFalse(queue.settle(lease, IdentityDeliverySettlement(IdentityOutboxState.CANCELLED, IdentityDeliveryError.INVALIDATED), Instant.now()))
        assertEquals(0, secretCount(jdbc, id))
        assertEquals(IdentityOutboxState.SENT, state(jdbc, id))
        assertNull(queue.acquire(UUID.randomUUID(), Instant.now().plusSeconds(120), Duration.ofSeconds(60)))
    }

    @Test fun `expired lease without handoff retries with backoff and crash after marker becomes uncertain without resend`() = database { jdbc, tx, queue ->
        val retryId = event(jdbc, tx)
        val now = Instant.now()
        val before = queue.acquire(UUID.randomUUID(), now, Duration.ofSeconds(60))!!
        assertEquals(1, queue.reapExpired(now.plusSeconds(61)))
        assertEquals(IdentityOutboxState.RETRY, state(jdbc, retryId))
        assertEquals(1, secretCount(jdbc, retryId))
        assertFalse(queue.beginHandoff(before, now.plusSeconds(61)))
        assertFalse(queue.settle(before, IdentityDeliverySettlement(IdentityOutboxState.CANCELLED, IdentityDeliveryError.EXPIRED), now.plusSeconds(61)))
        assertNull(queue.acquire(UUID.randomUUID(), now.plusSeconds(80), Duration.ofSeconds(60)))
        val retry = queue.acquire(before.owner, now.plusSeconds(92), Duration.ofSeconds(60))!!
        assertEquals(2, retry.attempt)
        assertEquals(IdentityDeliveryEligibility.LEASE_LOST, queue.revalidate(before, now.plusSeconds(92)))
        assertFalse(queue.beginHandoff(before, now.plusSeconds(92)))
        assertFalse(queue.settle(before, IdentityDeliverySettlement(IdentityOutboxState.CANCELLED, IdentityDeliveryError.INVALIDATED), now.plusSeconds(92)))
        assertTrue(queue.beginHandoff(retry, now.plusSeconds(92)))
        assertEquals(1, queue.reapExpired(now.plusSeconds(153)))
        assertEquals(IdentityOutboxState.UNCERTAIN, state(jdbc, retryId))
        assertEquals(0, secretCount(jdbc, retryId))
        assertNull(queue.acquire(UUID.randomUUID(), now.plusSeconds(300), Duration.ofSeconds(60)))
    }

    @Test fun `proven pre DATA retry clears marker and exhausted fifth attempt destroys secret`() = database { jdbc, tx, queue ->
        val id = event(jdbc, tx)
        var now = Instant.now()
        repeat(5) { index ->
            val lease = queue.acquire(UUID.randomUUID(), now, Duration.ofSeconds(60))!!
            assertEquals(index + 1, lease.attempt)
            assertTrue(queue.beginHandoff(lease, now))
            // Exercise the persistence attempt bound without waiting beyond the verification token TTL.
            val settlement = if (index < 4) IdentityDeliverySettlement(IdentityOutboxState.RETRY, IdentityDeliveryError.PRE_DATA_TRANSIENT, now.plusSeconds(1))
                else IdentityDeliveryPolicy { 0.5 }.settle(SmtpDeliveryResult.RETRYABLE_BEFORE_HANDOFF, lease.attempt, now)
            assertTrue(queue.settle(lease, settlement, now))
            if (index < 4) {
                assertNull(jdbc.queryForMap("SELECT handoff_started_at FROM identity_message_delivery WHERE event_id=?", id)["handoff_started_at"])
                assertEquals(1, secretCount(jdbc, id))
                now = settlement.retryAt!!.plusMillis(1)
            }
        }
        assertEquals(IdentityOutboxState.DEAD, state(jdbc, id))
        assertEquals(0, secretCount(jdbc, id))
    }

    @Test fun `revalidation rejects inactive subject consumed token and email change while expiry reaper shreds pending message`() = database { jdbc, tx, queue ->
        val id = event(jdbc, tx)
        val lease = queue.acquire(UUID.randomUUID(), Instant.now(), Duration.ofSeconds(60))!!
        val subject = jdbc.queryForObject("SELECT customer_id FROM identity_message_outbox WHERE id=?", Long::class.java, id)!!
        jdbc.update("UPDATE customers SET active=false WHERE id=?", subject)
        assertEquals(IdentityDeliveryEligibility.INVALIDATED, queue.revalidate(lease, Instant.now()))
        jdbc.update("UPDATE customers SET active=true WHERE id=?", subject)
        jdbc.update("UPDATE identity_email_verification_tokens SET state='CONSUMED',terminal_at=clock_timestamp(),terminal_correlation_id=? WHERE id=(SELECT verification_token_id FROM identity_message_outbox WHERE id=?)", UUID.randomUUID(), id)
        assertEquals(IdentityDeliveryEligibility.INVALIDATED, queue.revalidate(lease, Instant.now()))
        jdbc.update("UPDATE customers SET email=? WHERE id=?", "${UUID.randomUUID()}@example.test", subject)
        assertEquals(IdentityDeliveryEligibility.LEASE_LOST, queue.revalidate(lease, Instant.now()))
        assertEquals(0, secretCount(jdbc, id))
        val pending = event(jdbc, tx)
        val pendingDeadline = jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)!!.toInstant().plusSeconds(1801)
        assertEquals(1, queue.reapExpired(pendingDeadline))
        assertEquals(IdentityOutboxState.CANCELLED, state(jdbc, pending))
        assertEquals(0, secretCount(jdbc, pending))
        val active = event(jdbc, tx)
        val activeLease = queue.acquire(UUID.randomUUID(), Instant.now(), Duration.ofHours(1))!!
        assertEquals(active, activeLease.eventId)
        val activeDeadline = jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)!!.toInstant().plusSeconds(1801)
        assertEquals(1, queue.reapExpired(activeDeadline))
        assertEquals(IdentityOutboxState.CANCELLED, state(jdbc, active))
        assertEquals(0, secretCount(jdbc, active))
    }

    @Test fun `recovery revalidation requires current ownership and credential version and keeps realms isolated`() = database { jdbc, tx, queue ->
        val verification = event(jdbc, tx)
        val token = jdbc.queryForMap("SELECT t.* FROM identity_email_verification_tokens t JOIN identity_message_outbox o ON o.verification_token_id=t.id WHERE o.id=?", verification)
        val id = UUID.randomUUID()
        tx.execute {
            jdbc.update("UPDATE identity_message_delivery SET state='CANCELLED',last_error='OBSOLETE',updated_at=clock_timestamp(),terminal_at=clock_timestamp() WHERE event_id=?", verification)
            jdbc.update("""INSERT INTO identity_recovery_tokens(id,realm,customer_id,token_hash,credential_version,email_digest,issued_at,expires_at,correlation_id)
                SELECT ?,'CUSTOMER',?,?,1,?,t,t+interval '15 minutes',? FROM (SELECT clock_timestamp() t) n""",
                id, token["customer_id"], VerificationTokens().sha256(UUID.randomUUID().toString()), token["email_digest"], UUID.randomUUID())
            jdbc.update("""INSERT INTO identity_message_outbox(id,kind,realm,customer_id,recovery_token_id,expires_at,correlation_id)
                SELECT ?,'PASSWORD_RECOVERY','CUSTOMER',customer_id,id,expires_at,? FROM identity_recovery_tokens WHERE id=?""", id, UUID.randomUUID(), id)
            jdbc.update("INSERT INTO identity_message_delivery(event_id) VALUES (?)", id)
            jdbc.update("INSERT INTO identity_message_secret(event_id,key_id,ciphertext,nonce,wrapped_dek,wrap_nonce) VALUES (?,'fixture-key',?,?,?,?)", id, ByteArray(16), ByteArray(12), ByteArray(48), ByteArray(12))
        }
        val lease = queue.acquire(UUID.randomUUID(), Instant.now(), Duration.ofSeconds(60))!!
        assertEquals(IdentityDeliveryEligibility.INVALIDATED, queue.revalidate(lease, Instant.now()))
        tx.execute {
            jdbc.update("UPDATE identity_email_verification_tokens SET state='CONSUMED',terminal_at=clock_timestamp(),terminal_correlation_id=? WHERE id=?", UUID.randomUUID(), token["id"])
            jdbc.update("""INSERT INTO identity_email_verification_evidence(id,verification_token_id,realm,customer_id,email_version,email_digest,verified_at,correlation_id)
                SELECT ?,id,realm,customer_id,email_version,email_digest,terminal_at,terminal_correlation_id FROM identity_email_verification_tokens WHERE id=?""", UUID.randomUUID(), token["id"])
        }
        assertEquals(IdentityDeliveryEligibility.READY, queue.revalidate(lease, Instant.now()))
        jdbc.update("UPDATE customers SET credential_version=credential_version+1 WHERE id=?", token["customer_id"])
        assertEquals(IdentityDeliveryEligibility.INVALIDATED, queue.revalidate(lease, Instant.now()))
    }

    @Test fun `startup shreds expired old key payload but refuses a key required by live work`() = database { jdbc, tx, _ ->
        val databaseNow = jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)!!.toInstant()
        val expired = eventAt(jdbc, tx, databaseNow.plusSeconds(2), "retired-key")
        Thread.sleep(2_500)
        val settings = IdentityDeliverySettings(
            EmailDeliveryMode.VERIFICATION_ONLY, true, "smtp.example.test", 465, IdentitySmtpTls.IMPLICIT,
            "fixture", "fixture-secret", "sender@example.test", "https://store.example.test", "queue-test",
            "current-key", mapOf("current-key" to Base64.getEncoder().encodeToString(ByteArray(32) { 4 })),
        )
        ConfiguredIdentityDeliveryBeans().identityMessageKeyring(settings, jdbc).close()
        assertEquals(IdentityOutboxState.CANCELLED, state(jdbc, expired))
        assertEquals(0, secretCount(jdbc, expired))

        val liveNow = jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)!!.toInstant()
        val live = eventAt(jdbc, tx, liveNow.plusSeconds(1800), "retired-key")
        val failure = assertThrows(IllegalStateException::class.java) {
            ConfiguredIdentityDeliveryBeans().identityMessageKeyring(settings, jdbc)
        }
        assertEquals("IDENTITY_DELIVERY_PREFLIGHT_FAILED", failure.message)
        assertEquals(IdentityOutboxState.PENDING, state(jdbc, live))
        assertEquals(1, secretCount(jdbc, live))
    }

    private fun event(jdbc: JdbcTemplate, tx: TransactionTemplate): UUID = tx.execute {
        val tokens = VerificationTokens()
        val email = "${UUID.randomUUID()}@example.test"
        val subject = jdbc.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Queue','Fixture') RETURNING id", Long::class.java, email, "\$argon2id\$fixture")!!
        val token = UUID.randomUUID()
        jdbc.update("""INSERT INTO identity_email_verification_tokens(id,realm,customer_id,token_hash,email_version,email_digest,issued_at,expires_at,correlation_id)
            SELECT ?,'CUSTOMER',?,?,1,?,t,t+interval '30 minutes',? FROM (SELECT clock_timestamp() t) n""", token, subject, tokens.sha256(UUID.randomUUID().toString()), tokens.sha256(email), UUID.randomUUID())
        val id = UUID.randomUUID()
        jdbc.update("""INSERT INTO identity_message_outbox(id,kind,realm,customer_id,verification_token_id,expires_at,correlation_id)
            SELECT ?,'EMAIL_VERIFICATION','CUSTOMER',?,?,expires_at,? FROM identity_email_verification_tokens WHERE id=?""", id, subject, token, UUID.randomUUID(), token)
        jdbc.update("INSERT INTO identity_message_delivery(event_id) VALUES (?)", id)
        jdbc.update("INSERT INTO identity_message_secret(event_id,key_id,ciphertext,nonce,wrapped_dek,wrap_nonce) VALUES (?,'fixture-key',?,?,?,?)", id, ByteArray(16), ByteArray(12), ByteArray(48), ByteArray(12))
        id
    }!!
    private fun eventAt(jdbc: JdbcTemplate, tx: TransactionTemplate, expiresAt: Instant, keyId: String): UUID = tx.execute {
        val tokens = VerificationTokens()
        val email = "${UUID.randomUUID()}@example.test"
        val subject = jdbc.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Queue','Rotation') RETURNING id", Long::class.java, email, "\$argon2id\$fixture")!!
        val token = UUID.randomUUID()
        jdbc.update(
            """INSERT INTO identity_email_verification_tokens
               (id,realm,customer_id,token_hash,email_version,email_digest,issued_at,expires_at,correlation_id)
               VALUES(?,'CUSTOMER',?,?,1,?,?,?,?)""",
            token, subject, tokens.sha256(UUID.randomUUID().toString()), tokens.sha256(email),
            Timestamp.from(expiresAt.minusSeconds(1800)), Timestamp.from(expiresAt), UUID.randomUUID(),
        )
        val id = UUID.randomUUID()
        jdbc.update(
            """INSERT INTO identity_message_outbox
               (id,kind,realm,customer_id,verification_token_id,created_at,expires_at,correlation_id)
               VALUES(?,'EMAIL_VERIFICATION','CUSTOMER',?,?,?,?,?)""",
            id, subject, token, Timestamp.from(expiresAt.minusSeconds(1800)), Timestamp.from(expiresAt), UUID.randomUUID(),
        )
        jdbc.update("INSERT INTO identity_message_delivery(event_id) VALUES (?)", id)
        jdbc.update("INSERT INTO identity_message_secret(event_id,key_id,ciphertext,nonce,wrapped_dek,wrap_nonce) VALUES (?,?,?,?,?,?)", id, keyId, ByteArray(16), ByteArray(12), ByteArray(48), ByteArray(12))
        id
    }!!
    private fun secretCount(jdbc: JdbcTemplate, id: UUID) = jdbc.queryForObject("SELECT count(*) FROM identity_message_secret WHERE event_id=?", Int::class.java, id)
    private fun state(jdbc: JdbcTemplate, id: UUID) = IdentityOutboxState.fromWire(jdbc.queryForObject("SELECT state FROM identity_message_delivery WHERE event_id=?", String::class.java, id))
    private fun database(action: (JdbcTemplate, TransactionTemplate, JdbcIdentityDeliveryQueue) -> Unit) {
        PostgreSQLContainer<Nothing>("postgres:16-alpine").use { pg ->
            pg.start()
            val ds = DriverManagerDataSource(pg.jdbcUrl, pg.username, pg.password)
            Flyway.configure().dataSource(ds).locations("classpath:db/migration").load().migrate()
            val jdbc = JdbcTemplate(ds)
            val tx = TransactionTemplate(DataSourceTransactionManager(ds))
            action(jdbc, tx, JdbcIdentityDeliveryQueue(jdbc, "queue-test", VerificationTokens(), IdentityDeliveryPolicy { 0.5 }, tx))
        }
    }
}
