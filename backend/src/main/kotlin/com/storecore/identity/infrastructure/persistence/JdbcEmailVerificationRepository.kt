package com.storecore.identity.infrastructure.persistence

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import java.sql.Timestamp
import java.util.UUID

/** Call issue/complete inside the transaction boundary; subject locks precede token locks. */
class JdbcEmailVerificationRepository(
    private val jdbc: JdbcTemplate, private val locks: IdentityMutationLocks, private val tokens: VerificationTokenPort,
) : EmailVerificationRepository {
    override fun ownership(subject: IdentitySubject): EmailOwnershipState {
        val account = account(subject) ?: return EmailOwnershipState.Unknown
        val found = jdbc.queryForObject(
            """SELECT EXISTS(SELECT 1 FROM identity_email_verification_evidence
               WHERE realm=? AND ${column(subject.realm)}=? AND email_version=? AND email_digest=?)""",
            Boolean::class.java, subject.realm.name, subject.id, account.emailVersion, account.emailDigest,
        ) == true
        return if (found) EmailOwnershipState.VERIFIED else EmailOwnershipState.Unknown
    }

    override fun issue(principal: AuthenticatedPrincipal): EmailVerificationDispatch? {
        val subject = IdentitySubject.of(principal)
        locks.acquire(IdentityMutationScope.Own(subject))
        locks.revalidateActor(principal)
        val current = jdbc.queryForMap("SELECT email,email_version FROM ${table(subject.realm)} WHERE id=?", subject.id)
        val email = CanonicalEmail.fromWire(current["email"] as? String ?: "") ?: return null
        val digest = tokens.sha256(email.value)
        val version = current.number("email_version")
        val live = jdbc.queryForObject(
            """SELECT count(*) FROM identity_email_verification_tokens WHERE realm=? AND ${column(subject.realm)}=?
               AND state=? AND expires_at>clock_timestamp() AND email_version=? AND email_digest=?""",
            Int::class.java, subject.realm.name, subject.id, EmailVerificationTokenState.PENDING.name, version, digest,
        ) ?: 0
        if (live >= EmailVerificationPolicy.MAX_LIVE_TOKENS) return null
        val secret = VerificationSecret.fromWire(tokens.nextRawToken()) ?: error("VERIFICATION_TOKEN_FACTORY_INVALID")
        val id = UUID.randomUUID()
        val correlation = UUID.randomUUID()
        val row = jdbc.queryForMap(
            """WITH issued AS (SELECT clock_timestamp() value)
               INSERT INTO identity_email_verification_tokens(id,realm,user_id,customer_id,token_hash,email_version,email_digest,issued_at,expires_at,correlation_id)
               SELECT ?,?,?,?,?,?,?,value,value+interval '30 minutes',? FROM issued RETURNING expires_at""",
            id, subject.realm.name, subject.id.takeIf { subject.realm == IdentityRealm.USER },
            subject.id.takeIf { subject.realm == IdentityRealm.CUSTOMER }, tokens.sha256(secret.value), version, digest, correlation,
        )
        return EmailVerificationDispatch(id, subject, email, secret, row.instant("expires_at"), correlation)
    }

    override fun inspect(realm: RecoveryRealm, secret: VerificationSecret): EmailVerificationInspection {
        val identityRealm = realm.identityRealm ?: return invalid()
        val row = token(realm, secret, false) ?: return invalid()
        val authorization = authorization(identityRealm, row)
        val status = authorization.inspect(account(authorization.subject), now())
        return if (status == EmailVerificationStatus.READY) EmailVerificationInspection.ready(authorization.expiresAt)
            else EmailVerificationInspection.terminal(status)
    }

    override fun complete(realm: RecoveryRealm, secret: VerificationSecret): EmailVerificationCompletion {
        val identityRealm = realm.identityRealm ?: return EmailVerificationCompletion.INVALID_LINK
        val preflight = token(realm, secret, false) ?: return EmailVerificationCompletion.INVALID_LINK
        val subject = IdentitySubject(identityRealm, preflight.number(column(identityRealm)))
        locks.acquire(IdentityMutationScope.Own(subject))
        val row = token(realm, secret, true) ?: return EmailVerificationCompletion.INVALID_LINK
        val status = authorization(identityRealm, row).inspect(account(subject), now())
        if (status != EmailVerificationStatus.READY) return status.completion
        val changed = jdbc.update(
            """UPDATE identity_email_verification_tokens SET state=?,terminal_at=clock_timestamp(),terminal_correlation_id=?
               WHERE id=? AND state=? AND expires_at>clock_timestamp()""",
            EmailVerificationTokenState.CONSUMED.name, row["correlation_id"], row["id"], EmailVerificationTokenState.PENDING.name,
        )
        if (changed != 1) return EmailVerificationCompletion.EXPIRED_LINK
        jdbc.update(
            """INSERT INTO identity_email_verification_evidence(id,verification_token_id,realm,user_id,customer_id,email_version,email_digest,verified_at,correlation_id)
               SELECT ?,id,realm,user_id,customer_id,email_version,email_digest,terminal_at,terminal_correlation_id
               FROM identity_email_verification_tokens WHERE id=? AND state=?""",
            UUID.randomUUID(), row["id"], EmailVerificationTokenState.CONSUMED.name,
        )
        return EmailVerificationCompletion.VERIFIED
    }

    private fun account(subject: IdentitySubject): EmailVerificationAccount? {
        val row = jdbc.queryForList("SELECT active,email,email_version FROM ${table(subject.realm)} WHERE id=?", subject.id).singleOrNull() ?: return null
        return EmailVerificationAccount(subject, row["active"] == true, row.number("email_version"), tokens.sha256(row["email"] as String))
    }
    private fun token(realm: RecoveryRealm, secret: VerificationSecret, lock: Boolean) = jdbc.queryForList(
        "SELECT * FROM identity_email_verification_tokens WHERE realm=? AND token_hash=?" + if (lock) " FOR UPDATE" else "",
        realm.name, tokens.sha256(secret.value),
    ).singleOrNull()
    private fun authorization(realm: IdentityRealm, row: Map<String, Any?>) = EmailVerificationAuthorization(
        IdentitySubject(realm, row.number(column(realm))), EmailVerificationTokenState.fromWire(row["state"] as? String),
        row.number("email_version"), row["email_digest"] as String, row.instant("expires_at"),
    )
    private fun now() = jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)!!.toInstant()
    private fun invalid() = EmailVerificationInspection.terminal(EmailVerificationStatus.INVALID_LINK)
    private fun table(realm: IdentityRealm) = when (realm) { IdentityRealm.USER -> "users"; IdentityRealm.CUSTOMER -> "customers" }
    private fun column(realm: IdentityRealm) = when (realm) { IdentityRealm.USER -> "user_id"; IdentityRealm.CUSTOMER -> "customer_id" }
    private fun Map<String, Any?>.number(key: String) = (get(key) as Number).toLong()
    private fun Map<String, Any?>.instant(key: String) = (get(key) as Timestamp).toInstant()
}
