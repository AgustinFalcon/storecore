package com.storecore.identity.domain

import java.time.Instant
import java.text.Normalizer
import java.util.Locale

@JvmInline
value class CanonicalEmail private constructor(val value: String) {
    companion object {
        fun fromWire(raw: String?): CanonicalEmail? {
            val value = raw?.let { Normalizer.normalize(it, Normalizer.Form.NFKC) }
                ?.trim()?.lowercase(Locale.ROOT) ?: return null
            return value.takeIf { it.isNotBlank() && it.length <= 320 && it.contains('@') }
                ?.let(::CanonicalEmail)
        }
    }
}

/** Unknown belongs to the input boundary and can never select an identity realm. */
enum class AccessContext(val realm: IdentityRealm?) {
    CUSTOMER(IdentityRealm.CUSTOMER), USER(IdentityRealm.USER), Unknown(null);

    val home: AccessHome get() = when (this) {
        CUSTOMER -> AccessHome.STOREFRONT
        USER -> AccessHome.OPERATIONS
        Unknown -> AccessHome.Unknown
    }

    companion object {
        fun fromWire(raw: String?): AccessContext = when (raw) {
            "CUSTOMER" -> CUSTOMER
            "USER" -> USER
            else -> Unknown
        }

        fun fromRealm(realm: IdentityRealm): AccessContext = when (realm) {
            IdentityRealm.CUSTOMER -> CUSTOMER
            IdentityRealm.USER -> USER
        }
    }
}

enum class AccessHome {
    STOREFRONT, OPERATIONS, Unknown;

    companion object {
        fun fromWire(raw: String?): AccessHome = when (raw) {
            "STOREFRONT" -> STOREFRONT
            "OPERATIONS" -> OPERATIONS
            else -> Unknown
        }
    }
}

/** The only v1 destination translator; arbitrary paths never survive this boundary. */
enum class ReturnDestination(private val context: AccessContext?) {
    HOME(null), CATALOG(null), CUSTOMER_PROFILE(AccessContext.CUSTOMER),
    CUSTOMER_ORDERS(AccessContext.CUSTOMER), USER_ORDERS(AccessContext.USER), Unknown(null);

    fun permittedFor(selected: AccessContext): ReturnDestination = when {
        selected == AccessContext.Unknown -> Unknown
        this == Unknown -> HOME
        context == null || context == selected -> this
        else -> HOME
    }

    companion object {
        const val POLICY_MAX_LENGTH = 2048
        const val TRANSPORT_MAX_LENGTH = 4096

        fun fromWire(raw: String?): ReturnDestination = when (raw) {
            "HOME" -> HOME
            "CATALOG" -> CATALOG
            "CUSTOMER_PROFILE" -> CUSTOMER_PROFILE
            "CUSTOMER_ORDERS" -> CUSTOMER_ORDERS
            "USER_ORDERS" -> USER_ORDERS
            else -> Unknown
        }

        /** Exact known routes only: encodings, query strings and fragments fail closed. */
        fun fromReturnPath(raw: String?): ReturnDestination {
            if (raw == null || raw.length > POLICY_MAX_LENGTH) return HOME
            return when (raw) {
                "/", "/user/home" -> HOME
                "/catalog" -> CATALOG
                "/customer/profile" -> CUSTOMER_PROFILE
                "/customer/orders" -> CUSTOMER_ORDERS
                "/user/orders" -> USER_ORDERS
                else -> HOME
            }
        }
    }
}

/** These objects are created only after password and activity verification by a port. */
sealed interface VerifiedAccessCandidate {
    val subjectId: Long
    val context: AccessContext
    val eligible: Boolean

    data class Customer(override val subjectId: Long) : VerifiedAccessCandidate {
        override val context = AccessContext.CUSTOMER
        override val eligible: Boolean get() = subjectId > 0
    }

    class User(override val subjectId: Long, roles: Set<InternalRole>) : VerifiedAccessCandidate {
        private val verifiedRoles = roles.toSet()
        val roles: Set<InternalRole> get() = verifiedRoles.toSet()
        override val context = AccessContext.USER
        override val eligible: Boolean get() = subjectId > 0 && InternalRole.hasKnownRole(verifiedRoles)
    }
}

/** Candidate resolution deliberately contains no issued session or challenge tokens. */
sealed interface CandidateResolution {
    data object Rejected : CandidateResolution
    data class Single(val candidate: VerifiedAccessCandidate, val destination: ReturnDestination) : CandidateResolution
    data class SelectionRequired(
        val customer: VerifiedAccessCandidate.Customer,
        val user: VerifiedAccessCandidate.User,
        val destination: ReturnDestination,
    ) : CandidateResolution
}

/** Result after the infrastructure coordinator has completed the selected effect. */
sealed interface LoginResolution {
    data object Rejected : LoginResolution

    class Authenticated(val credentials: IssuedCredentials, requestedDestination: ReturnDestination) : LoginResolution {
        val context = AccessContext.fromRealm(credentials.principal.realm)
        val home = context.home
        val destination = requestedDestination.permittedFor(context)
        override fun toString(): String = "Authenticated(context=$context, destination=$destination)"
    }

    class ContextSelectionRequired(
        val challenge: String,
        val bindingNonce: String,
        val expiresAt: Instant,
        val destination: ReturnDestination,
    ) : LoginResolution {
        val contexts: List<AccessContext> get() = listOf(AccessContext.CUSTOMER, AccessContext.USER)
        override fun toString(): String = "ContextSelectionRequired(expiresAt=$expiresAt, destination=$destination)"
    }
}
