package com.storecore.identity.domain

import java.time.Instant
import java.util.UUID

enum class RecoveryRealm(val identityRealm: IdentityRealm?) {
    CUSTOMER(IdentityRealm.CUSTOMER), USER(IdentityRealm.USER), Unknown(null);
    companion object {
        fun fromWire(raw: String?): RecoveryRealm = when (raw) {
            "CUSTOMER" -> CUSTOMER
            "USER" -> USER
            else -> Unknown
        }
    }
}

enum class RecoveryTokenState {
    PENDING, CONSUMED, SUPERSEDED, Unknown;
    companion object {
        fun fromWire(raw: String?): RecoveryTokenState = when (raw) {
            "PENDING" -> PENDING
            "CONSUMED" -> CONSUMED
            "SUPERSEDED" -> SUPERSEDED
            else -> Unknown
        }
    }
}

enum class RecoveryInvalidationReason { PASSWORD_RECOVERY, EMAIL_CHANGED }
enum class RecoveryAuditAggregate { IDENTITY_SESSION, IDENTITY_RECOVERY }
enum class RecoveryAuditEvent(val aggregate: RecoveryAuditAggregate) {
    IDENTITY_SESSION_REVOKED(RecoveryAuditAggregate.IDENTITY_SESSION),
    IDENTITY_PASSWORD_RECOVERED(RecoveryAuditAggregate.IDENTITY_RECOVERY),
}
enum class RecoveryDeliveryState { UNCONFIGURED, READY, ACCEPTED, FAILED, Unknown }
enum class RecoveryRequestResult { ACCEPTED }
enum class RecoveryCompletionResult { COMPLETED, INVALID_LINK, EXPIRED_LINK, USED_LINK, SUPERSEDED_LINK, Unknown }

enum class RecoveryTokenStatus(val completion: RecoveryCompletionResult) {
    READY(RecoveryCompletionResult.Unknown),
    INVALID_LINK(RecoveryCompletionResult.INVALID_LINK),
    EXPIRED_LINK(RecoveryCompletionResult.EXPIRED_LINK),
    USED_LINK(RecoveryCompletionResult.USED_LINK),
    SUPERSEDED_LINK(RecoveryCompletionResult.SUPERSEDED_LINK),
    Unknown(RecoveryCompletionResult.Unknown);
}

enum class RecoveryAccountEligibility(val permitsRecovery: Boolean) {
    ELIGIBLE(true), DISABLED(false), NO_KNOWN_ROLE(false), Unknown(false);
    companion object {
        fun evaluate(realm: IdentityRealm, active: Boolean?, roles: Set<InternalRole>): RecoveryAccountEligibility = when {
            active == null -> Unknown
            !active -> DISABLED
            realm == IdentityRealm.USER && !InternalRole.hasKnownRole(roles) -> NO_KNOWN_ROLE
            else -> ELIGIBLE
        }
    }
}

data class RecoveryAccountSnapshot(val eligibility: RecoveryAccountEligibility, val credentialVersion: Long, val emailDigest: String)

/** Expiry and terminal-state precedence are domain rules shared by inspect/complete. */
data class RecoveryAuthorization(
    val state: RecoveryTokenState, val credentialVersion: Long, val emailDigest: String, val expiresAt: Instant,
) {
    fun inspect(account: RecoveryAccountSnapshot, now: Instant): RecoveryTokenStatus = when (state) {
        RecoveryTokenState.CONSUMED -> RecoveryTokenStatus.USED_LINK
        RecoveryTokenState.SUPERSEDED -> RecoveryTokenStatus.SUPERSEDED_LINK
        RecoveryTokenState.Unknown -> RecoveryTokenStatus.Unknown
        RecoveryTokenState.PENDING -> when {
            now >= expiresAt -> RecoveryTokenStatus.EXPIRED_LINK
            !account.eligibility.permitsRecovery || credentialVersion != account.credentialVersion || emailDigest != account.emailDigest -> RecoveryTokenStatus.SUPERSEDED_LINK
            else -> RecoveryTokenStatus.READY
        }
    }
}

class RecoveryInspection private constructor(val status: RecoveryTokenStatus, val expiresAt: Instant?) {
    companion object {
        fun ready(expiresAt: Instant) = RecoveryInspection(RecoveryTokenStatus.READY, expiresAt)
        fun terminal(status: RecoveryTokenStatus): RecoveryInspection {
            require(status != RecoveryTokenStatus.READY)
            return RecoveryInspection(status, null)
        }
    }
}

object PasswordPolicy {
    fun accepts(value: String): Boolean = value.codePointCount(0, value.length) in 12..128
}

/** Secret-bearing values deliberately have no data-class/string representation. */
class RecoverySecret private constructor(val value: String) {
    override fun toString() = "RecoverySecret(REDACTED)"
    companion object {
        fun fromWire(raw: String?): RecoverySecret? =
            raw?.takeIf { it.length == 43 && it.all { char -> char in 'a'..'z' || char in 'A'..'Z' || char in '0'..'9' || char == '_' || char == '-' } }?.let(::RecoverySecret)
    }
}

class RecoveryPassword private constructor(private val value: String) {
    fun copyChars(): CharArray = value.toCharArray()
    override fun toString() = "RecoveryPassword(REDACTED)"
    companion object { fun fromWire(raw: String): RecoveryPassword? = raw.takeIf(PasswordPolicy::accepts)?.let(::RecoveryPassword) }
}

class RecoveryDispatch(
    val id: UUID, val realm: RecoveryRealm, val email: CanonicalEmail,
    val secret: RecoverySecret, val expiresAt: Instant,
) {
    override fun toString() = "RecoveryDispatch(id=$id, realm=$realm)"
}
