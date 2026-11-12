package com.storecore.identity.infrastructure.persistence

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.sql.Timestamp
import java.util.UUID

@Repository
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class JdbcRecoveryRepository(
    private val jdbc: JdbcTemplate, private val locks: IdentityMutationLocks,
    private val tokens: RecoveryTokenPort, private val passwords: RecoveryPasswordHasher,
) : RecoveryRepository {
    override fun issue(realm: RecoveryRealm, email: CanonicalEmail): RecoveryDispatch? {
        val identityRealm = realm.identityRealm ?: return null
        val table = table(identityRealm)
        val id = jdbc.queryForList("SELECT id FROM $table WHERE email=?", email.value).singleOrNull()?.number("id") ?: return null
        val subject = IdentitySubject(identityRealm, id)
        locks.acquire(IdentityMutationScope.Own(subject))
        val current = subject(subject)
        if (!snapshot(subject, current).eligibility.permitsRecovery || current["email"] != email.value) return null
        val count = jdbc.queryForObject(
            """SELECT count(*) FROM identity_recovery_tokens WHERE realm=? AND ${subjectColumn(identityRealm)}=?
               AND state=? AND expires_at>clock_timestamp() AND credential_version=? AND email_digest=?""",
            Int::class.java, realm.name, id, RecoveryTokenState.PENDING.name, current.number("credential_version"), tokens.sha256(email.value),
        ) ?: 0
        if (count >= 3) return null
        val secret = RecoverySecret.fromWire(tokens.nextRawToken()) ?: error("RECOVERY_TOKEN_FACTORY_INVALID")
        val tokenId = UUID.randomUUID()
        val row = jdbc.queryForMap(
            """WITH issued AS (SELECT clock_timestamp() value)
               INSERT INTO identity_recovery_tokens(id,realm,user_id,customer_id,token_hash,credential_version,email_digest,issued_at,expires_at,correlation_id)
               SELECT ?,?,?,?,?,?,?,value,value+interval '15 minutes',? FROM issued RETURNING expires_at""",
            tokenId, realm.name, if (identityRealm == IdentityRealm.USER) id else null,
            if (identityRealm == IdentityRealm.CUSTOMER) id else null,
            tokens.sha256(secret.value), current.number("credential_version"), tokens.sha256(email.value), UUID.randomUUID(),
        )
        return RecoveryDispatch(tokenId, realm, email, secret, (row["expires_at"] as Timestamp).toInstant())
    }

    override fun inspect(realm: RecoveryRealm, token: RecoverySecret): RecoveryInspection {
        val identityRealm = realm.identityRealm ?: return RecoveryInspection.terminal(RecoveryTokenStatus.INVALID_LINK)
        val row = token(realm, token, false) ?: return RecoveryInspection.terminal(RecoveryTokenStatus.INVALID_LINK)
        val subject = IdentitySubject(identityRealm, row.number(subjectColumn(identityRealm)))
        val status = status(subject, row, subject(subject))
        return if (status == RecoveryTokenStatus.READY) RecoveryInspection.ready((row["expires_at"] as Timestamp).toInstant())
            else RecoveryInspection.terminal(status)
    }

    override fun complete(realm: RecoveryRealm, token: RecoverySecret, password: RecoveryPassword): RecoveryCompletionResult {
        val identityRealm = realm.identityRealm ?: return RecoveryCompletionResult.INVALID_LINK
        val preflight = token(realm, token, false) ?: return RecoveryCompletionResult.INVALID_LINK
        val subject = IdentitySubject(identityRealm, preflight.number(subjectColumn(identityRealm)))
        val scope = IdentityMutationScope.Own(subject)
        locks.acquire(scope)
        val row = token(realm, token, true) ?: return RecoveryCompletionResult.INVALID_LINK
        val state = status(subject, row, subject(subject))
        if (state != RecoveryTokenStatus.READY) return state.completion
        val hash = passwords.hash(password.copyChars())
        // Hashing is intentionally inside the authorization transaction. Check the
        // database clock once more so expiry while hashing cannot authorize a reset.
        val changed = jdbc.update(
            """UPDATE identity_recovery_tokens SET state=?,terminal_at=clock_timestamp(),terminal_reason=?,terminal_correlation_id=?
               WHERE id=? AND state=? AND expires_at>clock_timestamp()""",
            RecoveryTokenState.CONSUMED.name, RecoveryInvalidationReason.PASSWORD_RECOVERY.name, row.uuid("correlation_id"),
            row.uuid("id"), RecoveryTokenState.PENDING.name,
        )
        if (changed != 1) return RecoveryCompletionResult.EXPIRED_LINK
        jdbc.update("UPDATE ${table(identityRealm)} SET password_hash=?,credential_version=credential_version+1,updated_at=clock_timestamp() WHERE id=?", hash, subject.id)
        val correlation = row.uuid("correlation_id")
        jdbc.update(
            """UPDATE identity_recovery_tokens SET state=?,terminal_at=clock_timestamp(),terminal_reason=?,terminal_correlation_id=?
               WHERE realm=? AND ${subjectColumn(identityRealm)}=? AND state=?""",
            RecoveryTokenState.SUPERSEDED.name, RecoveryInvalidationReason.PASSWORD_RECOVERY.name, correlation,
            realm.name, subject.id, RecoveryTokenState.PENDING.name,
        )
        locks.lockSessions(scope)
        val sessions = jdbc.queryForList(
            """UPDATE identity_sessions SET revoked_at=clock_timestamp(),revocation_kind='SYSTEM',
               revocation_correlation_id=?,revoked_reason=?
               WHERE subject_kind=? AND ${subjectColumn(identityRealm)}=? AND revoked_at IS NULL
                 AND idle_expires_at>clock_timestamp() AND absolute_expires_at>clock_timestamp() RETURNING id""",
            correlation, RecoveryInvalidationReason.PASSWORD_RECOVERY.name, identityRealm.name, subject.id,
        )
        sessions.forEach { session ->
            audit(RecoveryAuditEvent.IDENTITY_SESSION_REVOKED, session.uuid("id"), subject, correlation, """{"revocationKind":"SYSTEM","result":"REVOKED"}""")
        }
        audit(RecoveryAuditEvent.IDENTITY_PASSWORD_RECOVERED, row.uuid("id"), subject, correlation, """{"revokedSessionCount":${sessions.size}}""")
        return RecoveryCompletionResult.COMPLETED
    }

    private fun token(realm: RecoveryRealm, secret: RecoverySecret, lock: Boolean): Map<String, Any?>? =
        jdbc.queryForList("SELECT * FROM identity_recovery_tokens WHERE realm=? AND token_hash=?" + if (lock) " FOR UPDATE" else "", realm.name, tokens.sha256(secret.value)).singleOrNull()

    private fun subject(subject: IdentitySubject): Map<String, Any?> =
        jdbc.queryForList("SELECT email,active,credential_version FROM ${table(subject.realm)} WHERE id=?", subject.id).singleOrNull() ?: emptyMap()

    private fun snapshot(subject: IdentitySubject, current: Map<String, Any?>): RecoveryAccountSnapshot {
        val roles = when (subject.realm) {
            IdentityRealm.CUSTOMER -> emptySet()
            IdentityRealm.USER -> jdbc.queryForList(
                "SELECT r.code FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=? FOR SHARE OF ur,r", subject.id,
            ).mapTo(linkedSetOf()) { InternalRole.fromWire(it["code"] as? String) }
        }
        return RecoveryAccountSnapshot(
            RecoveryAccountEligibility.evaluate(subject.realm, current["active"] as? Boolean, roles),
            (current["credential_version"] as? Number)?.toLong() ?: 0,
            tokens.sha256(current["email"] as? String ?: ""),
        )
    }

    private fun status(subject: IdentitySubject, token: Map<String, Any?>, current: Map<String, Any?>): RecoveryTokenStatus {
        val account = snapshot(subject, current)
        val authorization = RecoveryAuthorization(
            RecoveryTokenState.fromWire(token["state"] as? String), token.number("credential_version"),
            token["email_digest"] as String, (token["expires_at"] as Timestamp).toInstant(),
        )
        return authorization.inspect(account, jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)!!.toInstant())
    }

    private fun audit(event: RecoveryAuditEvent, reference: UUID, subject: IdentitySubject, correlation: UUID, payload: String) {
        jdbc.update(
            """INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_reference,subject_kind,subject_reference,correlation_id,reason_code,payload_redacted)
               VALUES('SYSTEM',NULL,?,?,?,?,?,?,?,?::jsonb)""",
            event.name, event.aggregate.name, reference, subject.realm.name, subject.id, correlation, RecoveryInvalidationReason.PASSWORD_RECOVERY.name, payload,
        )
    }
    private fun table(realm: IdentityRealm) = when (realm) { IdentityRealm.USER -> "users"; IdentityRealm.CUSTOMER -> "customers" }
    private fun subjectColumn(realm: IdentityRealm) = when (realm) { IdentityRealm.USER -> "user_id"; IdentityRealm.CUSTOMER -> "customer_id" }
    private fun Map<String, Any?>.number(key: String) = (get(key) as Number).toLong()
    private fun Map<String, Any?>.uuid(key: String) = get(key) as UUID
}
