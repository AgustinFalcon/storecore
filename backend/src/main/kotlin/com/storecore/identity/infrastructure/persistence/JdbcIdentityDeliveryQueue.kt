package com.storecore.identity.infrastructure.persistence

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID

/** Each operation commits before returning. Network work must never enter these transactions. */
class JdbcIdentityDeliveryQueue(
    private val jdbc: JdbcTemplate,
    private val installationId: String,
    private val tokens: VerificationTokenPort,
    private val policy: IdentityDeliveryPolicy,
    transactions: TransactionTemplate = TransactionTemplate(DataSourceTransactionManager(requireNotNull(jdbc.dataSource))),
) : IdentityDeliveryQueue {
    // A surrounding request transaction must not postpone the durable marker until after SMTP.
    private val transactions = TransactionTemplate(requireNotNull(transactions.transactionManager)).apply {
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
    }
    override fun acquire(owner: UUID, now: Instant, duration: Duration): IdentityDeliveryLease? = transactions.execute {
        require(!duration.isNegative && !duration.isZero)
        reap(now)
        val row = jdbc.queryForList(
            """SELECT d.event_id FROM identity_message_delivery d JOIN identity_message_outbox o ON o.id=d.event_id
               WHERE d.state IN ('PENDING','RETRY') AND d.available_at<=GREATEST(clock_timestamp(),?::timestamptz)
               AND o.expires_at>GREATEST(clock_timestamp(),?::timestamptz)
               ORDER BY d.available_at,d.event_id LIMIT 1 FOR UPDATE OF d SKIP LOCKED""",
            Timestamp.from(now), Timestamp.from(now),
        ).singleOrNull() ?: return@execute null
        val id = row["event_id"] as UUID
        jdbc.update(
            """UPDATE identity_message_delivery SET state='LEASED',attempts=attempts+1,lease_owner=?,
               lease_until=GREATEST(clock_timestamp(),?::timestamptz)+?*interval '1 millisecond',updated_at=clock_timestamp()
               WHERE event_id=? AND state IN ('PENDING','RETRY')""", owner, Timestamp.from(now), duration.toMillis(), id,
        )
        val event = jdbc.queryForMap(
            """SELECT o.*,d.attempts,d.lease_until,s.key_id,s.ciphertext,s.nonce,s.wrapped_dek,s.wrap_nonce
               FROM identity_message_outbox o JOIN identity_message_delivery d ON d.event_id=o.id
               LEFT JOIN identity_message_secret s ON s.event_id=o.id WHERE o.id=?""", id,
        )
        val kind = IdentityMessageKind.fromWire(event["kind"] as? String)
        val realm = RecoveryRealm.fromWire(event["realm"] as? String)
        if (kind == IdentityMessageKind.Unknown || realm == RecoveryRealm.Unknown || event["key_id"] == null) {
            finish(id, owner, IdentityDeliverySettlement(IdentityOutboxState.DEAD, IdentityDeliveryError.PAYLOAD_INVALID), now)
            return@execute null
        }
        IdentityDeliveryLease(id, owner, (event["attempts"] as Number).toInt(), event.instant("lease_until"),
            IdentityMessageEncryptionContext(installationId, id, kind), realm, event.instant("expires_at"),
            IdentityMessageEnvelope(event["key_id"] as String, event["ciphertext"] as ByteArray, event["nonce"] as ByteArray,
                event["wrapped_dek"] as ByteArray, event["wrap_nonce"] as ByteArray))
    }

    override fun revalidate(lease: IdentityDeliveryLease, now: Instant): IdentityDeliveryEligibility {
        val row = jdbc.queryForList(
            """SELECT o.*,d.state AS delivery_state,d.lease_owner,d.lease_until,d.attempts,clock_timestamp() AS checked_at
               FROM identity_message_outbox o JOIN identity_message_delivery d ON d.event_id=o.id WHERE o.id=?""", lease.eventId,
        ).singleOrNull() ?: return IdentityDeliveryEligibility.LEASE_LOST
        val checked = maxOf(now, row.instant("checked_at"))
        if (IdentityOutboxState.fromWire(row["delivery_state"] as? String) != IdentityOutboxState.LEASED ||
            row["lease_owner"] != lease.owner || (row["attempts"] as Number).toInt() != lease.attempt ||
            row.instant("lease_until") != lease.expiresAt || row.instant("lease_until") <= checked) return IdentityDeliveryEligibility.LEASE_LOST
        if (row.instant("expires_at") <= checked) return IdentityDeliveryEligibility.EXPIRED
        val realm = RecoveryRealm.fromWire(row["realm"] as? String).identityRealm ?: return IdentityDeliveryEligibility.INVALIDATED
        val kind = IdentityMessageKind.fromWire(row["kind"] as? String)
        val column = when (realm) { IdentityRealm.USER -> "user_id"; IdentityRealm.CUSTOMER -> "customer_id" }
        val table = when (realm) { IdentityRealm.USER -> "users"; IdentityRealm.CUSTOMER -> "customers" }
        val id = (row[column] as Number).toLong()
        val account = jdbc.queryForList("SELECT active,email,email_version,credential_version FROM $table WHERE id=?", id).singleOrNull()
            ?: return IdentityDeliveryEligibility.INVALIDATED
        val roles = if (realm == IdentityRealm.USER) jdbc.queryForList(
            "SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=?", id,
        ).mapTo(linkedSetOf()) { InternalRole.fromWire(it["code"] as? String) } else emptySet()
        if (!RecoveryAccountEligibility.evaluate(realm, account["active"] as? Boolean, roles).permitsRecovery)
            return IdentityDeliveryEligibility.INVALIDATED
        val token = when (kind) {
            IdentityMessageKind.EMAIL_VERIFICATION -> jdbc.queryForList("SELECT * FROM identity_email_verification_tokens WHERE id=?", row["verification_token_id"])
            IdentityMessageKind.PASSWORD_RECOVERY -> jdbc.queryForList("SELECT * FROM identity_recovery_tokens WHERE id=?", row["recovery_token_id"])
            IdentityMessageKind.Unknown -> return IdentityDeliveryEligibility.INVALIDATED
        }.singleOrNull() ?: return IdentityDeliveryEligibility.INVALIDATED
        if (token.instant("expires_at") <= checked) return IdentityDeliveryEligibility.EXPIRED
        val digest = tokens.sha256(account["email"] as String)
        val pending = when (kind) {
            IdentityMessageKind.EMAIL_VERIFICATION -> EmailVerificationTokenState.fromWire(token["state"] as? String) == EmailVerificationTokenState.PENDING && token["email_version"] == account["email_version"]
            IdentityMessageKind.PASSWORD_RECOVERY -> RecoveryTokenState.fromWire(token["state"] as? String) == RecoveryTokenState.PENDING && token["credential_version"] == account["credential_version"]
            IdentityMessageKind.Unknown -> false
        }
        if (!pending || token["email_digest"] != digest || token["realm"] != row["realm"] || token[column] != row[column])
            return IdentityDeliveryEligibility.INVALIDATED
        if (kind == IdentityMessageKind.PASSWORD_RECOVERY && jdbc.queryForObject(
                """SELECT EXISTS(SELECT 1 FROM identity_email_verification_evidence WHERE realm=? AND $column=?
                   AND email_version=? AND email_digest=?)""", Boolean::class.java, realm.name, id, account["email_version"], digest,
            ) != true) return IdentityDeliveryEligibility.INVALIDATED
        return IdentityDeliveryEligibility.READY
    }

    override fun beginHandoff(lease: IdentityDeliveryLease, now: Instant): Boolean = transactions.execute { jdbc.update(
        """UPDATE identity_message_delivery d SET handoff_started_at=clock_timestamp(),updated_at=clock_timestamp()
           FROM identity_message_outbox o WHERE o.id=d.event_id AND d.event_id=? AND d.state='LEASED'
           AND d.lease_owner=? AND d.attempts=? AND d.lease_until=? AND d.handoff_started_at IS NULL AND d.lease_until>GREATEST(clock_timestamp(),?::timestamptz)
           AND o.expires_at>GREATEST(clock_timestamp(),?::timestamptz)""", lease.eventId, lease.owner, lease.attempt, Timestamp.from(lease.expiresAt), Timestamp.from(now), Timestamp.from(now),
    ) == 1 } == true

    override fun settle(lease: IdentityDeliveryLease, settlement: IdentityDeliverySettlement, now: Instant): Boolean =
        transactions.execute { finish(lease.eventId, lease.owner, settlement, now, expectedLease = lease) } == true

    /** Run at least once per minute, including while SMTP is disabled. Locks are bounded and skip other workers. */
    override fun reapExpired(now: Instant): Int = transactions.execute { reap(now) } ?: 0

    private fun reap(now: Instant): Int {
        val rows = jdbc.queryForList(
            """SELECT d.*,o.expires_at FROM identity_message_delivery d JOIN identity_message_outbox o ON o.id=d.event_id
               WHERE (d.state IN ('PENDING','RETRY') AND o.expires_at<=GREATEST(clock_timestamp(),?::timestamptz))
               OR (d.state='LEASED' AND (d.lease_until<=GREATEST(clock_timestamp(),?::timestamptz)
                   OR o.expires_at<=GREATEST(clock_timestamp(),?::timestamptz)))
               ORDER BY d.event_id LIMIT 100 FOR UPDATE OF d SKIP LOCKED""", Timestamp.from(now), Timestamp.from(now), Timestamp.from(now),
        )
        rows.forEach { row ->
            val state = IdentityOutboxState.fromWire(row["state"] as? String)
            val settlement = when {
                state == IdentityOutboxState.LEASED && row["handoff_started_at"] != null -> policy.recoverExpiredLease(IdentityHandoffProgress.STARTED, (row["attempts"] as Number).toInt(), now)
                row.instant("expires_at") <= maxOf(now, databaseNow()) -> IdentityDeliverySettlement(IdentityOutboxState.CANCELLED, IdentityDeliveryError.EXPIRED)
                else -> policy.recoverExpiredLease(IdentityHandoffProgress.NOT_STARTED, (row["attempts"] as Number).toInt(), maxOf(now, databaseNow()))
            }
            if (state == IdentityOutboxState.LEASED) finish(row["event_id"] as UUID, row["lease_owner"] as UUID, settlement, now, expired = true)
            else jdbc.update("""UPDATE identity_message_delivery SET state='CANCELLED',last_error='EXPIRED',updated_at=clock_timestamp(),terminal_at=clock_timestamp()
                WHERE event_id=? AND state IN ('PENDING','RETRY')""", row["event_id"])
        }
        return rows.size
    }

    private fun finish(id: UUID, owner: UUID, settlement: IdentityDeliverySettlement, now: Instant, expired: Boolean = false, expectedLease: IdentityDeliveryLease? = null): Boolean {
        val deadline = if (expired)
            "(lease_until<=GREATEST(clock_timestamp(),?::timestamptz) OR EXISTS(SELECT 1 FROM identity_message_outbox o WHERE o.id=event_id AND o.expires_at<=GREATEST(clock_timestamp(),?::timestamptz)))"
        else "lease_until>GREATEST(clock_timestamp(),?::timestamptz)"
        val parameters = mutableListOf<Any?>(settlement.state.name, errorWire(settlement.error), settlement.retryAt?.let(Timestamp::from), settlement.destroySecret,
            settlement.state == IdentityOutboxState.RETRY, id, owner)
        val expected = if (expectedLease != null) {
            parameters.add(expectedLease.attempt)
            parameters.add(Timestamp.from(expectedLease.expiresAt))
            "AND attempts=? AND lease_until=?"
        } else ""
        parameters.add(Timestamp.from(now))
        if (expired) parameters.add(Timestamp.from(now))
        return jdbc.update(
            """UPDATE identity_message_delivery SET state=?,last_error=?,available_at=COALESCE(?::timestamptz,available_at),
               lease_owner=NULL,lease_until=NULL,updated_at=clock_timestamp(),terminal_at=CASE WHEN ? THEN clock_timestamp() ELSE NULL END,
               handoff_started_at=CASE WHEN ? THEN NULL ELSE handoff_started_at END
               WHERE event_id=? AND state='LEASED' AND lease_owner=? $expected AND $deadline""", *parameters.toTypedArray(),
        ) == 1
    }

    private fun databaseNow() = jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)!!.toInstant()
    private fun Map<String, Any?>.instant(key: String) = (get(key) as Timestamp).toInstant()
    private fun errorWire(error: IdentityDeliveryError): String? = when (error) {
        IdentityDeliveryError.NONE -> null
        IdentityDeliveryError.PRE_DATA_TRANSIENT -> "TRANSIENT"
        IdentityDeliveryError.SMTP_UNCERTAIN -> "AMBIGUOUS"
        IdentityDeliveryError.INVALIDATED -> "OBSOLETE"
        else -> error.name
    }
}
