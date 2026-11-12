package com.storecore.identity.domain

/** Wire translation is exact: malformed, future and absent values fail closed. */
enum class EmailOwnershipState(val permitsRecovery: Boolean) {
    VERIFIED(true), Unknown(false);
    companion object { fun fromWire(raw: String?) = if (raw == "VERIFIED") VERIFIED else Unknown }
}

enum class VerificationRequestState {
    IDLE, SUBMITTING, ACCEPTED, RATE_LIMITED, UNAVAILABLE, Unknown;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it != Unknown && it.name == raw } ?: Unknown }
}

enum class EmailVerificationTokenState {
    PENDING, CONSUMED, SUPERSEDED, Unknown;
    val isTerminal: Boolean get() = this != PENDING
    fun permitsTransitionTo(next: EmailVerificationTokenState): Boolean =
        this == PENDING && (next == CONSUMED || next == SUPERSEDED)
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it != Unknown && it.name == raw } ?: Unknown }
}

enum class IdentityMessageKind {
    EMAIL_VERIFICATION, PASSWORD_RECOVERY, Unknown;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it != Unknown && it.name == raw } ?: Unknown }
}

enum class IdentityOutboxState {
    PENDING, LEASED, RETRY, SENT, UNCERTAIN, DEAD, CANCELLED, Unknown;
    val isTerminal: Boolean get() = when (this) {
        SENT, UNCERTAIN, DEAD, CANCELLED, Unknown -> true
        else -> false
    }
    fun permitsTransitionTo(next: IdentityOutboxState): Boolean = when (this) {
        PENDING, RETRY -> next == LEASED || next == CANCELLED
        LEASED -> next == SENT || next == RETRY || next == UNCERTAIN || next == DEAD || next == CANCELLED
        else -> false
    }
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it != Unknown && it.name == raw } ?: Unknown }
}

/** Only an unequivocal failure before handoff can authorize an automatic retry. */
enum class SmtpDeliveryResult(val resultingState: IdentityOutboxState) {
    ACCEPTED(IdentityOutboxState.SENT),
    RETRYABLE_BEFORE_HANDOFF(IdentityOutboxState.RETRY),
    ACCEPTANCE_UNCERTAIN(IdentityOutboxState.UNCERTAIN),
    AUTHENTICATION_FAILED(IdentityOutboxState.DEAD),
    CONFIGURATION_FAILED(IdentityOutboxState.DEAD),
    PERMANENT_REJECTION(IdentityOutboxState.DEAD),
    EXPIRED(IdentityOutboxState.CANCELLED),
    INVALIDATED(IdentityOutboxState.CANCELLED),
    Unknown(IdentityOutboxState.UNCERTAIN);
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it != Unknown && it.name == raw } ?: Unknown }
}

enum class EmailDeliveryCapability {
    EMAIL_VERIFICATION, PASSWORD_RECOVERY, Unknown;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it != Unknown && it.name == raw } ?: Unknown }
}

enum class EmailDeliveryReadiness {
    READY, UNAVAILABLE, Unknown;
    val permitsEnqueue: Boolean get() = this == READY
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it != Unknown && it.name == raw } ?: Unknown }
}

enum class EmailDeliveryMode {
    UNCONFIGURED, VERIFICATION_ONLY, RECOVERY_ENABLED, Unknown;
    /** Configuration/rollout validation remains the responsibility of the startup adapter. */
    fun readiness(capability: EmailDeliveryCapability): EmailDeliveryReadiness = when (this) {
        VERIFICATION_ONLY -> if (capability == EmailDeliveryCapability.EMAIL_VERIFICATION) EmailDeliveryReadiness.READY else EmailDeliveryReadiness.UNAVAILABLE
        RECOVERY_ENABLED -> if (capability != EmailDeliveryCapability.Unknown) EmailDeliveryReadiness.READY else EmailDeliveryReadiness.UNAVAILABLE
        UNCONFIGURED, Unknown -> EmailDeliveryReadiness.UNAVAILABLE
    }
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it != Unknown && it.name == raw } ?: Unknown }
}
