package com.storecore.identity.domain

import java.time.Instant
import java.util.UUID

enum class IdentityRealm { USER, CUSTOMER }

enum class InternalRole { ADMIN, OPERATOR }

sealed interface AuthenticatedPrincipal {
    val sessionId: UUID
    val realm: IdentityRealm
}

data class CustomerPrincipal(
    override val sessionId: UUID,
    val customerId: Long,
) : AuthenticatedPrincipal {
    override val realm = IdentityRealm.CUSTOMER
}

data class InternalUserPrincipal(
    override val sessionId: UUID,
    val userId: Long,
    val roles: Set<InternalRole>,
) : AuthenticatedPrincipal {
    override val realm = IdentityRealm.USER
}

data class IssuedCredentials(
    val principal: AuthenticatedPrincipal,
    val sessionToken: String,
    val csrfToken: String,
)

data class CustomerProfile(val id: Long, val email: String, val firstName: String, val lastName: String, val phone: String?)

data class CustomerAddress(
    val id: Long,
    val street: String,
    val number: String,
    val city: String,
    val province: String,
    val postalCode: String,
    val isDefault: Boolean,
)

data class SessionSummary(
    val id: UUID,
    val realm: IdentityRealm,
    val subjectId: Long,
    val expiresAt: Instant,
)