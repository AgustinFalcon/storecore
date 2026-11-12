package com.storecore.identity.domain

import java.time.Instant
import java.util.UUID

enum class EmailVerificationCompletion {
    VERIFIED, INVALID_LINK, EXPIRED_LINK, USED_LINK, SUPERSEDED_LINK, Unknown;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it != Unknown && it.name == raw } ?: Unknown }
}

enum class EmailVerificationStatus(val completion: EmailVerificationCompletion) {
    READY(EmailVerificationCompletion.Unknown), INVALID_LINK(EmailVerificationCompletion.INVALID_LINK),
    EXPIRED_LINK(EmailVerificationCompletion.EXPIRED_LINK), USED_LINK(EmailVerificationCompletion.USED_LINK),
    SUPERSEDED_LINK(EmailVerificationCompletion.SUPERSEDED_LINK), Unknown(EmailVerificationCompletion.INVALID_LINK);
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it != Unknown && it.name == raw } ?: Unknown }
}

data class EmailVerificationAccount(val subject: IdentitySubject, val active: Boolean, val emailVersion: Long, val emailDigest: String)

data class EmailVerificationAuthorization(
    val subject: IdentitySubject, val state: EmailVerificationTokenState,
    val emailVersion: Long, val emailDigest: String, val expiresAt: Instant,
) {
    fun inspect(account: EmailVerificationAccount?, now: Instant): EmailVerificationStatus = when (state) {
        EmailVerificationTokenState.CONSUMED -> EmailVerificationStatus.USED_LINK
        EmailVerificationTokenState.SUPERSEDED -> EmailVerificationStatus.SUPERSEDED_LINK
        EmailVerificationTokenState.Unknown -> EmailVerificationStatus.INVALID_LINK
        EmailVerificationTokenState.PENDING -> when {
            now >= expiresAt -> EmailVerificationStatus.EXPIRED_LINK
            account == null || !account.active || account.subject != subject || account.emailVersion != emailVersion || account.emailDigest != emailDigest -> EmailVerificationStatus.SUPERSEDED_LINK
            else -> EmailVerificationStatus.READY
        }
    }
}

class EmailVerificationInspection private constructor(val status: EmailVerificationStatus, val expiresAt: Instant?) {
    companion object {
        fun ready(expiresAt: Instant) = EmailVerificationInspection(EmailVerificationStatus.READY, expiresAt)
        fun terminal(status: EmailVerificationStatus): EmailVerificationInspection {
            require(status != EmailVerificationStatus.READY)
            return EmailVerificationInspection(status, null)
        }
    }
}

class EmailVerificationDispatch(
    val id: UUID, val subject: IdentitySubject, val email: CanonicalEmail,
    val secret: VerificationSecret, val expiresAt: Instant, val correlationId: UUID,
) {
    override fun toString() = "EmailVerificationDispatch(id=$id)"
}

object EmailVerificationPolicy {
    const val MAX_LIVE_TOKENS = 3
    const val COOLDOWN_SECONDS = 60L
}

class VerificationSecret private constructor(val value: String) {
    override fun toString() = "VerificationSecret(REDACTED)"
    companion object {
        fun fromWire(raw: String?): VerificationSecret? = raw?.takeIf {
            it.length == 43 && it.all { char -> char in 'a'..'z' || char in 'A'..'Z' || char in '0'..'9' || char == '_' || char == '-' }
        }?.let(::VerificationSecret)
    }
}
