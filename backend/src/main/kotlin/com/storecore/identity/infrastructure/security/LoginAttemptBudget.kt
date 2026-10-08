package com.storecore.identity.infrastructure.security

import org.springframework.stereotype.Component
import java.time.Clock

/** One unit per credential submission across all three credential endpoints. */
@Component
class LoginAttemptBudget(clock: Clock = Clock.systemUTC(), maxKeys: Int = 10_000) {
    private val window = BoundedAttemptWindow<AuthenticationBudgetKey>(clock, 5, maxKeys)
    fun acquire(sourceIp: String, canonicalEmail: String) =
        window.acquire(AuthenticationBudgetKey(sourceIp.trim(), canonicalEmailDigest(canonicalEmail)))
}
