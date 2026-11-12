package com.storecore.identity

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.persistence.*
import com.storecore.identity.infrastructure.security.*
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID

class RecoveryEnqueuePostgresTest {
    @Test fun `recovery requires current ownership and commits token with encrypted outbox or rolls back everything`() {
        PostgreSQLContainer<Nothing>("postgres:16-alpine").use { pg ->
            pg.start()
            Flyway.configure().dataSource(pg.jdbcUrl, pg.username, pg.password).locations("classpath:db/migration").load().migrate()
            val ds = DriverManagerDataSource(pg.jdbcUrl, pg.username, pg.password)
            val jdbc = JdbcTemplate(ds)
            val template = TransactionTemplate(DataSourceTransactionManager(ds))
            val transactions = object : RecoveryTransactions {
                override fun <T : Any> execute(effect: () -> T): T = template.execute { effect() }!!
            }
            val tokens = OpaqueTokenFactory()
            val repository = JdbcRecoveryRepository(jdbc, IdentityMutationLocks(jdbc), tokens, mock(RecoveryPasswordHasher::class.java))
            IdentityMessageKeyring("test", mapOf("test" to ByteArray(32) { 7 })).use { ring ->
                val crypto = AesGcmIdentityMessageEncryption(ring)
                val codec = JsonIdentityMessagePayloadCodec()
                val delivery = JdbcRecoveryDelivery(jdbc, EmailDeliveryMode.RECOVERY_ENABLED, "fixture", crypto, codec)
                val step = RequestRecoveryStep(repository, delivery, RecoveryAttemptBudget(), tokens, transactions)
                val email = "${UUID.randomUUID()}@example.test"
                val customer = jdbc.queryForObject("INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,'\$argon2id\$fixture','Test','Recovery') RETURNING id", Long::class.java, email)!!
                val user = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,'\$argon2id\$fixture','Test','Recovery') RETURNING id", Long::class.java, email)!!
                jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?", user, InternalRole.ADMIN.name)
                fun request() = step.execute(RecoveryRealm.CUSTOMER, email, UUID.randomUUID().toString())
                fun count(table: String) = jdbc.queryForObject("SELECT count(*) FROM $table", Int::class.java)!!
                assertEquals(RecoveryRequestResult.ACCEPTED, request())
                assertEquals(0, count("identity_recovery_tokens"))
                // A real consumed verification token backs append-only evidence.
                val verification = UUID.randomUUID()
                jdbc.update("WITH t AS (SELECT clock_timestamp() issued) INSERT INTO identity_email_verification_tokens(id,realm,customer_id,token_hash,email_version,email_digest,issued_at,expires_at,correlation_id) SELECT ?,'CUSTOMER',?,?,1,?,issued,issued+interval '30 minutes',? FROM t", verification, customer, tokens.sha256(tokens.nextRawToken()), tokens.sha256(email), UUID.randomUUID())
                jdbc.update("UPDATE identity_email_verification_tokens SET state='CONSUMED',terminal_at=clock_timestamp(),terminal_correlation_id=? WHERE id=?", UUID.randomUUID(), verification)
                jdbc.update("INSERT INTO identity_email_verification_evidence(id,verification_token_id,realm,customer_id,email_version,email_digest,verified_at,correlation_id) SELECT ?,id,realm,customer_id,email_version,email_digest,terminal_at,terminal_correlation_id FROM identity_email_verification_tokens WHERE id=?", UUID.randomUUID(), verification)
                assertEquals(RecoveryRequestResult.ACCEPTED, step.execute(RecoveryRealm.USER, email, "user-ip"))
                assertEquals(0, count("identity_recovery_tokens")) // Same email does not transfer ownership across realms.
                jdbc.update("UPDATE customers SET password_hash=? WHERE id=?", "\$argon2id\$changed-fixture", customer)
                assertEquals(RecoveryRequestResult.ACCEPTED, request())
                assertEquals(1, count("identity_recovery_tokens"))
                assertEquals(1, count("identity_message_outbox"))
                assertEquals(1, count("identity_message_delivery"))
                val row = jdbc.queryForMap("SELECT * FROM identity_message_secret")
                val event = row["event_id"] as UUID
                val envelope = IdentityMessageEnvelope(row["key_id"] as String, row["ciphertext"] as ByteArray, row["nonce"] as ByteArray, row["wrapped_dek"] as ByteArray, row["wrap_nonce"] as ByteArray)
                crypto.decrypt(IdentityMessageEncryptionContext("fixture", event, IdentityMessageKind.PASSWORD_RECOVERY), envelope).use { plaintext ->
                    codec.decode(plaintext).use { payload -> payload.usePlaintext { recipient, secret ->
                        assertEquals(email, String(recipient))
                        assertEquals(tokens.sha256(String(secret)), jdbc.queryForObject("SELECT token_hash FROM identity_recovery_tokens", String::class.java))
                    } }
                }
                // Force persistence failure after token/outbox insertion, proving the common rollback.
                jdbc.execute("CREATE FUNCTION reject_recovery_secret() RETURNS TRIGGER LANGUAGE plpgsql AS 'BEGIN RAISE EXCEPTION ''fixture''; END;'")
                jdbc.execute("CREATE TRIGGER reject_recovery_secret BEFORE INSERT ON identity_message_secret FOR EACH ROW EXECUTE FUNCTION reject_recovery_secret()")
                assertEquals(RecoveryRequestResult.ACCEPTED, request())
                assertEquals(1, count("identity_recovery_tokens"))
                assertEquals(1, count("identity_message_outbox"))
                assertEquals(1, count("identity_message_secret"))
                jdbc.update("UPDATE customers SET email=? WHERE id=?", "new-$email", customer)
                jdbc.update("UPDATE customers SET email=? WHERE id=?", email, customer)
                assertEquals(RecoveryRequestResult.ACCEPTED, request())
                assertEquals(1, count("identity_recovery_tokens"))
                assertEquals(0, count("identity_message_secret"))
            }
        }
    }
}
