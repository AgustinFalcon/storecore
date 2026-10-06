package com.storecore.identity.infrastructure.security

import org.springframework.stereotype.Component
import java.time.Clock

/** Rejected selections only; callers supply a SHA-256 hash, never the public token. */
@Component
class ChallengeAttemptBudget(clock: Clock = Clock.systemUTC(), maxKeys: Int = 10_000) {
    private val window = BoundedAttemptWindow<AuthenticationBudgetKey>(clock, 10, maxKeys)
    fun checkAllowed(sourceIp: String, challengeHash: String) = window.checkAllowed(key(sourceIp, challengeHash))
    fun recordFailure(sourceIp: String, challengeHash: String) = window.recordFailure(key(sourceIp, challengeHash))
    private fun key(sourceIp: String, challengeHash: String): AuthenticationBudgetKey {
        require(challengeHash.matches(Regex("[0-9a-f]{64}"))) { "challenge hash required" }
        return AuthenticationBudgetKey(sourceIp.trim(), challengeHash)
    }
}
