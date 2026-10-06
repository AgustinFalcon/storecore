package com.storecore.identity.infrastructure.security

import com.storecore.identity.domain.IdentityRealm
import org.springframework.stereotype.Component
import java.time.Clock

/** Process-local login failure limiter. The key never contains the raw email. */
@Component
class LoginRateLimiter(clock: Clock = Clock.systemUTC(), maxKeys: Int = 10_000) {
    private data class RealmKey(val realm: IdentityRealm, val authentication: AuthenticationBudgetKey)
    private val window = BoundedAttemptWindow<RealmKey>(clock, 5, maxKeys)

    fun checkAllowed(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) {
        window.checkAllowed(key(realm, sourceIp, canonicalEmail))
    }

    fun recordFailure(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) {
        window.recordFailure(key(realm, sourceIp, canonicalEmail))
    }

    /** Legacy compatibility: success must never erase failure evidence. */
    @Suppress("UNUSED_PARAMETER")
    fun clear(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) = Unit

    private fun key(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) =
        RealmKey(realm, AuthenticationBudgetKey(sourceIp.trim(), canonicalEmailDigest(canonicalEmail)))
}
