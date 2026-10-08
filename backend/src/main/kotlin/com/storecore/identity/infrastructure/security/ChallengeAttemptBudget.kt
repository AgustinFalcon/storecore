package com.storecore.identity.infrastructure.security

import org.springframework.stereotype.Component
import java.time.Clock
import java.util.concurrent.atomic.AtomicBoolean

/** Only an admitted request can record a rejection, at most once. */
class SelectionAdmission internal constructor(private val record: () -> Unit) {
    private val recorded = AtomicBoolean()
    fun reject() { if (recorded.compareAndSet(false, true)) record() }
}

/**
 * Ten submissions per source are admitted before lookup/Unknown handling.
 * Source evidence is never evicted by hash churn. Eviction of per-challenge
 * evidence cannot reopen admission: the independent source window bounds all
 * requests, including concurrent ones, to ten in fifteen minutes.
 */
@Component
class ChallengeAttemptBudget(
    clock: Clock = Clock.systemUTC(),
    maxKeys: Int = 10_000,
    maxSources: Int = 10_000,
) {
    private val sources = BoundedAttemptWindow<String>(clock, 10, maxSources)
    private val challenges = BoundedAttemptWindow<AuthenticationBudgetKey>(clock, 10, maxKeys, AttemptCapacityPolicy.EvictOldest)

    fun checkAllowed(sourceIp: String, challengeHash: String): SelectionAdmission {
        require(challengeHash.matches(Regex("[0-9a-f]{64}"))) { "challenge hash required" }
        val source = sourceIp.trim()
        sources.acquire(source)
        val key = AuthenticationBudgetKey(source, challengeHash)
        challenges.checkAllowed(key)
        return SelectionAdmission { challenges.recordFailure(key) }
    }
}
