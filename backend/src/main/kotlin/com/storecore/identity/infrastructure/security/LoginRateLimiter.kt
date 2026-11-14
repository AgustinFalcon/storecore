package com.storecore.identity.infrastructure.security

import com.storecore.identity.domain.IdentityRealm
import org.springframework.stereotype.Component
import java.time.Clock

/** Process-local login failure limiter. The key never contains the raw email. */
@Component
class LoginRateLimiter(clock: Clock = Clock.systemUTC(), maxKeys: Int = 10_000) {
    private val windows = IdentityRealm.entries.associateWith {
        BoundedAttemptWindow<AuthenticationBudgetKey>(clock, 5, maxKeys)
    }

    fun checkAllowed(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) {
        windows.getValue(realm).checkAllowed(key(sourceIp, canonicalEmail))
    }

    fun recordFailure(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) {
        windows.getValue(realm).recordFailure(key(sourceIp, canonicalEmail))
    }

    /** Legacy compatibility: success must never erase failure evidence. */
    @Suppress("UNUSED_PARAMETER")
    fun clear(realm: IdentityRealm, sourceIp: String, canonicalEmail: String) = Unit

    private fun key(sourceIp: String, canonicalEmail: String) =
        AuthenticationBudgetKey(sourceIp.trim(), canonicalEmailDigest(canonicalEmail))
}
