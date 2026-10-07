package com.storecore.identity.infrastructure.security

import org.springframework.stereotype.Component
import java.time.Clock

/**
 * Rejected selections share one budget per network source. The challenge hash is
 * validated but deliberately not used as the key: otherwise an attacker can fill
 * the bounded map with invented challenges and deny service to legitimate ones.
 */
@Component
class ChallengeAttemptBudget(clock: Clock = Clock.systemUTC(), maxKeys: Int = 10_000) {
    private val window = BoundedAttemptWindow<SelectionSourceKey>(clock, 10, maxKeys)
    fun checkAllowed(sourceIp: String, challengeHash: String) = window.checkAllowed(key(sourceIp, challengeHash))
    fun recordFailure(sourceIp: String, challengeHash: String) = window.recordFailure(key(sourceIp, challengeHash))
    private fun key(sourceIp: String, challengeHash: String): SelectionSourceKey {
        require(challengeHash.matches(Regex("[0-9a-f]{64}"))) { "challenge hash required" }
        return SelectionSourceKey(sourceIp.trim())
    }
}

internal data class SelectionSourceKey(val sourceIp: String)
