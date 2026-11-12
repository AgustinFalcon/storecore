package com.storecore.schema

import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.sql.SQLException
import java.util.UUID

class RecoveryDeliveryMigrationTest {
    @Test fun `V18 upgrade preserves history and starts with unknown ownership`() = database("18") { jdbc, flyway ->
        val user = account(jdbc, "users")
        val customer = account(jdbc, "customers")
        val history = jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history ORDER BY installed_rank")
        assertEquals("19", flyway(null).migrate().targetSchemaVersion.toString())
        assertEquals(history, jdbc.queryForList("SELECT version,script,checksum FROM flyway_schema_history WHERE version::int<=18 ORDER BY installed_rank"))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM identity_email_verification_evidence", Int::class.java))
        for ((table, id) in listOf("users" to user, "customers" to customer)) {
            assertEquals(1L, jdbc.queryForObject("SELECT email_version FROM $table WHERE id=?", Long::class.java, id))
            jdbc.update("UPDATE $table SET password_hash=?,email_version=99 WHERE id=?", "${'$'}argon2id${'$'}new", id)
            assertEquals(1L, jdbc.queryForObject("SELECT email_version FROM $table WHERE id=?", Long::class.java, id))
            jdbc.update("UPDATE $table SET email=? WHERE id=?", "${UUID.randomUUID()}@example.test", id)
            assertEquals(2L, jdbc.queryForObject("SELECT email_version FROM $table WHERE id=?", Long::class.java, id))
        }
        flyway(null).validate()
        assertEquals(0, flyway(null).migrate().migrationsExecuted)
    }

    @Test fun `clean migration enforces deferred identity and immutable token evidence`() = database { jdbc, _ ->
        val user = account(jdbc, "users")
        val otherUser = account(jdbc, "users")
        val customer = account(jdbc, "customers")
        val token = token(jdbc, user)
        reject { jdbc.update("UPDATE identity_email_verification_tokens SET token_hash=repeat('f',64) WHERE id=?", token) }
        reject { jdbc.update("DELETE FROM identity_email_verification_tokens WHERE id=?", token) }
        reject { outbox(jdbc, token, otherUser) }
        reject { jdbc.update("INSERT INTO identity_message_outbox(id,kind,realm,customer_id,verification_token_id,expires_at,correlation_id) SELECT ?,'EMAIL_VERIFICATION','CUSTOMER',?,id,expires_at,? FROM identity_email_verification_tokens WHERE id=?", UUID.randomUUID(), customer, UUID.randomUUID(), token) }
        // A real deferred constraint permits outbox first, then its token in one transaction.
        jdbc.dataSource!!.connection.use { connection ->
            connection.autoCommit = false
            val deferredJdbc = JdbcTemplate(org.springframework.jdbc.datasource.SingleConnectionDataSource(connection, true))
            val lateToken = UUID.randomUUID()
            val event = UUID.randomUUID()
            deferredJdbc.update("INSERT INTO identity_message_outbox(id,kind,realm,user_id,verification_token_id,created_at,expires_at,correlation_id) VALUES (?,'EMAIL_VERIFICATION','USER',?,?,now(),now()+interval '30 minutes',?)", event, user, lateToken, UUID.randomUUID())
            deferredJdbc.update("INSERT INTO identity_email_verification_tokens(id,realm,user_id,token_hash,email_version,email_digest,issued_at,expires_at,correlation_id) VALUES (?,'USER',?,?,1,repeat('b',64),now(),now()+interval '30 minutes',?)", lateToken, user, hash(), UUID.randomUUID())
            connection.commit()
        }
        jdbc.update("UPDATE identity_email_verification_tokens SET state='CONSUMED',terminal_at=clock_timestamp(),terminal_correlation_id=? WHERE id=?", UUID.randomUUID(), token)
        jdbc.update("INSERT INTO identity_email_verification_evidence(id,verification_token_id,realm,user_id,email_version,email_digest,verified_at,correlation_id) SELECT ?,id,realm,user_id,email_version,email_digest,terminal_at,terminal_correlation_id FROM identity_email_verification_tokens WHERE id=?", UUID.randomUUID(), token)
        reject { jdbc.update("UPDATE identity_email_verification_tokens SET state='PENDING',terminal_at=NULL,terminal_correlation_id=NULL WHERE id=?", token) }
        reject { jdbc.update("UPDATE identity_email_verification_evidence SET email_version=2") }
        reject { jdbc.update("DELETE FROM identity_email_verification_evidence") }
        val expired = token(jdbc, user, expired = true)
        reject { jdbc.update("UPDATE identity_email_verification_tokens SET state='CONSUMED',terminal_at=clock_timestamp(),terminal_correlation_id=? WHERE id=?", UUID.randomUUID(), expired) }
    }

    @Test fun `delivery graph shreds terminal payload and never reopens uncertain`() = database { jdbc, _ ->
        val user = account(jdbc, "users")
        val token = token(jdbc, user)
        val event = outbox(jdbc, token, user)
        jdbc.update("INSERT INTO identity_message_delivery(event_id) VALUES (?)", event)
        secret(jdbc, event)
        jdbc.queryForObject("SELECT shred_identity_message_secret(?) IS NULL", Boolean::class.java, event)
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM identity_message_secret", Int::class.java))
        reject { jdbc.update("UPDATE identity_message_delivery SET state='SENT',terminal_at=clock_timestamp() WHERE event_id=?", event) }
        val lease = UUID.randomUUID()
        jdbc.update("UPDATE identity_message_delivery SET state='LEASED',attempts=attempts+1,lease_owner=?,lease_until=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp() WHERE event_id=? AND state='PENDING'", lease, event)
        assertEquals(0, jdbc.update("UPDATE identity_message_delivery SET state='RETRY',lease_owner=NULL,lease_until=NULL WHERE event_id=? AND lease_owner=?", event, UUID.randomUUID()))
        jdbc.update("UPDATE identity_message_delivery SET state='RETRY',lease_owner=NULL,lease_until=NULL,last_error='TRANSIENT',updated_at=clock_timestamp() WHERE event_id=? AND lease_owner=?", event, lease)
        jdbc.update("UPDATE identity_message_delivery SET state='LEASED',attempts=attempts+1,lease_owner=?,lease_until=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp() WHERE event_id=?", lease, event)
        reject { jdbc.update("UPDATE identity_message_delivery SET state='UNCERTAIN',lease_owner=NULL,lease_until=NULL,last_error='AMBIGUOUS',terminal_at=clock_timestamp(),updated_at=clock_timestamp() WHERE event_id=? AND lease_owner=?", event, lease) }
        jdbc.update("UPDATE identity_message_delivery SET handoff_started_at=clock_timestamp(),updated_at=clock_timestamp() WHERE event_id=? AND state='LEASED' AND lease_owner=? AND handoff_started_at IS NULL", event, lease)
        reject { jdbc.update("UPDATE identity_message_delivery SET state='RETRY',lease_owner=NULL,lease_until=NULL,last_error='TRANSIENT',updated_at=clock_timestamp() WHERE event_id=? AND lease_owner=?", event, lease) }
        jdbc.update("UPDATE identity_message_delivery SET state='RETRY',lease_owner=NULL,lease_until=NULL,handoff_started_at=NULL,last_error='TRANSIENT',updated_at=clock_timestamp() WHERE event_id=? AND lease_owner=?", event, lease)
        jdbc.update("UPDATE identity_message_delivery SET state='LEASED',attempts=attempts+1,lease_owner=?,lease_until=clock_timestamp()+interval '60 seconds',updated_at=clock_timestamp() WHERE event_id=?", lease, event)
        jdbc.update("UPDATE identity_message_delivery SET handoff_started_at=clock_timestamp(),updated_at=clock_timestamp() WHERE event_id=? AND state='LEASED' AND lease_owner=? AND handoff_started_at IS NULL", event, lease)
        jdbc.update("UPDATE identity_message_delivery SET state='UNCERTAIN',lease_owner=NULL,lease_until=NULL,last_error='AMBIGUOUS',terminal_at=clock_timestamp(),updated_at=clock_timestamp() WHERE event_id=? AND lease_owner=?", event, lease)
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM identity_message_secret", Int::class.java))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM identity_message_outbox", Int::class.java))
        reject { jdbc.update("UPDATE identity_message_delivery SET state='RETRY',terminal_at=NULL WHERE event_id=?", event) }
        reject { secret(jdbc, event) }
        reject { jdbc.update("DELETE FROM identity_message_outbox WHERE id=?", event) }
        reject { outbox(jdbc, token, user) }
    }

    @Test fun `recovery references enforce kind subject and realm and unknown states fail closed`() = database { jdbc, _ ->
        val user = account(jdbc, "users")
        val other = account(jdbc, "users")
        val recovery = UUID.randomUUID()
        jdbc.update("WITH t AS (SELECT clock_timestamp() issued) INSERT INTO identity_recovery_tokens(id,realm,user_id,token_hash,credential_version,email_digest,issued_at,expires_at,correlation_id) SELECT ?,'USER',?,?,1,repeat('a',64),issued,issued+interval '15 minutes',? FROM t", recovery, user, hash(), UUID.randomUUID())
        fun message(subject: Long, kind: String = "PASSWORD_RECOVERY"): UUID {
            val event = UUID.randomUUID()
            jdbc.update("INSERT INTO identity_message_outbox(id,kind,realm,user_id,recovery_token_id,expires_at,correlation_id) SELECT ?,?,'USER',?,id,expires_at,? FROM identity_recovery_tokens WHERE id=?", event, kind, subject, UUID.randomUUID(), recovery)
            return event
        }
        reject { message(other) }
        reject { message(user, "EMAIL_VERIFICATION") }
        reject { message(user, "UNKNOWN") }
        val event = message(user)
        reject { jdbc.update("INSERT INTO identity_message_delivery(event_id,state) VALUES (?,'UNKNOWN')", event) }
        reject { jdbc.update("INSERT INTO identity_message_delivery(event_id,state,terminal_at) VALUES (?,'SENT',clock_timestamp())", event) }
        jdbc.update("INSERT INTO identity_message_delivery(event_id) VALUES (?)", event)
        reject { jdbc.update("UPDATE identity_message_delivery SET last_error='raw exception with PII' WHERE event_id=?", event) }
    }

    @Test fun `email change retires pending links and payload without manufacturing evidence`() = database { jdbc, _ ->
        val user = account(jdbc, "users")
        val token = token(jdbc, user)
        val recovery = UUID.randomUUID()
        jdbc.update("WITH t AS (SELECT clock_timestamp() issued) INSERT INTO identity_recovery_tokens(id,realm,user_id,token_hash,credential_version,email_digest,issued_at,expires_at,correlation_id) SELECT ?,'USER',?,?,1,repeat('a',64),issued,issued+interval '15 minutes',? FROM t", recovery, user, hash(), UUID.randomUUID())
        val event = outbox(jdbc, token, user)
        jdbc.update("INSERT INTO identity_message_delivery(event_id) VALUES (?)", event)
        secret(jdbc, event)
        jdbc.update("UPDATE users SET email=? WHERE id=?", "${UUID.randomUUID()}@example.test", user)
        assertEquals("SUPERSEDED", jdbc.queryForObject("SELECT state FROM identity_email_verification_tokens WHERE id=?", String::class.java, token))
        assertEquals("SUPERSEDED", jdbc.queryForObject("SELECT state FROM identity_recovery_tokens WHERE id=?", String::class.java, recovery))
        assertEquals("CANCELLED", jdbc.queryForObject("SELECT state FROM identity_message_delivery WHERE event_id=?", String::class.java, event))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM identity_message_secret", Int::class.java))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM identity_email_verification_evidence", Int::class.java))
    }

    @Test fun `ACL restricts secrets and immutable metadata with pinned definer ownership`() = database { jdbc, _ ->
        for (table in listOf("identity_email_verification_tokens", "identity_email_verification_evidence", "identity_message_outbox", "identity_message_secret", "identity_message_delivery")) {
            assertEquals("storecore_migrator", jdbc.queryForObject("SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename=?", String::class.java, table))
            assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime',?,'DELETE')", Boolean::class.java, table)!!)
        }
        for (table in listOf("identity_email_verification_evidence", "identity_message_outbox", "identity_message_secret")) {
            assertFalse(jdbc.queryForObject("SELECT has_table_privilege('storecore_runtime',?,'UPDATE')", Boolean::class.java, table)!!)
        }
        assertTrue(jdbc.queryForObject("SELECT has_function_privilege('storecore_runtime','shred_identity_message_secret(uuid)','EXECUTE')", Boolean::class.java)!!)
        assertFalse(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a WHERE p.oid='shred_identity_message_secret(uuid)'::regprocedure AND a.grantee=0 AND a.privilege_type='EXECUTE')", Boolean::class.java)!!)
        val user = account(jdbc, "users")
        val event = outbox(jdbc, token(jdbc, user), user)
        jdbc.update("INSERT INTO identity_message_delivery(event_id) VALUES (?)", event)
        secret(jdbc, event)
        jdbc.dataSource!!.connection.use { c -> c.createStatement().use { s ->
            s.execute("SET ROLE storecore_runtime")
            assertThrows(SQLException::class.java) { s.executeUpdate("DELETE FROM identity_message_secret") }
            s.execute("SELECT shred_identity_message_secret('$event')")
            s.execute("RESET ROLE")
        } }
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM identity_message_secret", Int::class.java))
    }

    private fun account(jdbc: JdbcTemplate, table: String): Long = jdbc.queryForObject("INSERT INTO $table(email,password_hash,first_name,last_name) VALUES (?,?,'Schema','RD') RETURNING id", Long::class.java, "${UUID.randomUUID()}@example.test", "${'$'}argon2id${'$'}fixture")!!
    private fun hash() = UUID.randomUUID().toString().replace("-", "").repeat(2)
    private fun token(jdbc: JdbcTemplate, user: Long, expired: Boolean = false): UUID {
        val id = UUID.randomUUID()
        val age = if (expired) "interval '1 hour'" else "interval '0 seconds'"
        jdbc.update("WITH t AS (SELECT clock_timestamp()-$age issued) INSERT INTO identity_email_verification_tokens(id,realm,user_id,token_hash,email_version,email_digest,issued_at,expires_at,correlation_id) SELECT ?,'USER',?,?,1,repeat('a',64),issued,issued+interval '30 minutes',? FROM t", id, user, hash(), UUID.randomUUID())
        return id
    }
    private fun outbox(jdbc: JdbcTemplate, token: UUID, user: Long): UUID {
        val id = UUID.randomUUID()
        jdbc.update("INSERT INTO identity_message_outbox(id,kind,realm,user_id,verification_token_id,expires_at,correlation_id) SELECT ?,'EMAIL_VERIFICATION','USER',?,id,expires_at,? FROM identity_email_verification_tokens WHERE id=?", id, user, UUID.randomUUID(), token)
        return id
    }
    private fun secret(jdbc: JdbcTemplate, event: UUID) = jdbc.update("INSERT INTO identity_message_secret(event_id,key_id,ciphertext,nonce,wrapped_dek,wrap_nonce) VALUES (?,'fixture',decode(repeat('00',16),'hex'),decode(repeat('00',12),'hex'),decode(repeat('00',48),'hex'),decode(repeat('00',12),'hex'))", event)
    private fun reject(action: () -> Unit) { assertThrows(DataAccessException::class.java) { action() } }
    private fun database(target: String? = null, action: (JdbcTemplate, (String?) -> Flyway) -> Unit) {
        PostgreSQLContainer<Nothing>("postgres:16-alpine").use { pg ->
            pg.start()
            val flyway = { version: String? -> Flyway.configure().dataSource(pg.jdbcUrl, pg.username, pg.password).locations("classpath:db/migration").apply { if (version != null) target(version) }.load() }
            flyway(target).migrate()
            action(JdbcTemplate(DriverManagerDataSource(pg.jdbcUrl, pg.username, pg.password)), flyway)
        }
    }
}
