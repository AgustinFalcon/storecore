package com.storecore.identity.infrastructure.web

import com.storecore.identity.application.AuthenticationFailed
import com.storecore.identity.application.AuthorizationDenied
import com.storecore.identity.application.CsrfInvalid
import com.storecore.identity.application.IdentityUseCases
import com.storecore.identity.domain.AuthenticatedPrincipal
import com.storecore.identity.domain.CustomerPrincipal
import com.storecore.identity.domain.IdentityRealm
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.HttpHeaders
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class RequestAuth(
    private val identity: IdentityUseCases,
    private val installationOrigin: InstallationOrigin,
) {
    fun customer(http: HttpServletRequest): CustomerPrincipal =
        identity.authenticate(IdentityRealm.CUSTOMER, cookie(http, CUSTOMER_COOKIE)) as CustomerPrincipal

    fun internal(http: HttpServletRequest): InternalUserPrincipal {
        val principal = identity.authenticate(IdentityRealm.USER, cookie(http, INTERNAL_COOKIE)) as InternalUserPrincipal
        if (!principal.hasKnownRole) throw AuthenticationFailed()
        return principal
    }

    fun admin(http: HttpServletRequest): InternalUserPrincipal {
        val principal = internal(http)
        if (InternalRole.ADMIN !in principal.roles) throw AuthorizationDenied()
        return principal
    }

    fun operatorOrAdmin(http: HttpServletRequest): InternalUserPrincipal {
        val principal = internal(http)
        if (principal.roles.none { it == InternalRole.ADMIN || it == InternalRole.OPERATOR }) throw AuthorizationDenied()
        return principal
    }

    fun requireSameOrigin(request: HttpServletRequest) {
        val origin = request.getHeader(HttpHeaders.ORIGIN) ?: throw CsrfInvalid()
        if (installationOrigin.accepts(origin)) return
        throw CsrfInvalid()
    }

    /** Returns the current session when present; revoked/expired sessions are already logged out. */
    fun logoutCandidate(http: HttpServletRequest, realm: IdentityRealm): AuthenticatedPrincipal? {
        val expected = if (realm == IdentityRealm.CUSTOMER) CUSTOMER_COOKIE else INTERNAL_COOKIE
        val raw = http.cookies?.firstOrNull { it.name == expected }?.value ?: return null
        return try { identity.authenticate(realm, raw) } catch (_: AuthenticationFailed) { null }
    }

    private fun cookie(http: HttpServletRequest, expected: String): String =
        http.cookies?.firstOrNull { it.name == expected }?.value ?: throw AuthenticationFailed()

    companion object {
        const val CUSTOMER_COOKIE = "__Host-storecore-customer"
        const val INTERNAL_COOKIE = "__Host-storecore-internal"
        const val CSRF_HEADER = "X-CSRF-Token"
    }
}
