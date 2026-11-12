package com.storecore.identity.domain

import java.util.UUID

data class IdentitySubject(val realm: IdentityRealm, val id: Long) {
    init { require(id > 0) }

    companion object {
        fun of(principal: AuthenticatedPrincipal): IdentitySubject = when (principal) {
            is CustomerPrincipal -> IdentitySubject(IdentityRealm.CUSTOMER, principal.customerId)
            is InternalUserPrincipal -> IdentitySubject(IdentityRealm.USER, principal.userId)
        }
    }
}

/** A complete declaration of identity ownership before any mutable row is locked. */
sealed interface IdentityMutationScope {
    val subjects: Set<IdentitySubject>

    data class Own(val subject: IdentitySubject) : IdentityMutationScope {
        override val subjects = setOf(subject)
    }
    data class SessionTarget(val actor: IdentitySubject, val target: IdentitySubject, val sessionId: UUID) : IdentityMutationScope {
        override val subjects = setOf(actor, target)
    }
    data class CustomerTarget(val actor: IdentitySubject, val target: IdentitySubject) : IdentityMutationScope {
        init { require(target.realm == IdentityRealm.CUSTOMER) }
        override val subjects = setOf(actor, target)
    }
    data class Candidates(val customer: IdentitySubject, val user: IdentitySubject) : IdentityMutationScope {
        init { require(customer.realm == IdentityRealm.CUSTOMER && user.realm == IdentityRealm.USER) }
        override val subjects = setOf(customer, user)
    }
    data object Unknown : IdentityMutationScope {
        override val subjects = emptySet<IdentitySubject>()
    }
}

enum class ChallengeCredentialEvidence {
    LEGACY_UNVERIFIABLE, VERIFIED, Unknown;

    companion object {
        fun fromWire(raw: String?): ChallengeCredentialEvidence = when (raw) {
            "LEGACY_UNVERIFIABLE" -> LEGACY_UNVERIFIABLE
            "VERIFIED" -> VERIFIED
            else -> Unknown
        }
    }
}
