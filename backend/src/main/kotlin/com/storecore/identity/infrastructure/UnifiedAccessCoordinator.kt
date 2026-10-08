package com.storecore.identity.infrastructure

import com.storecore.identity.application.AccessChallengePort
import com.storecore.identity.application.AccessChallengeRejected
import com.storecore.identity.application.AuthenticationFailed
import com.storecore.identity.application.CandidateAuthenticationPort
import com.storecore.identity.application.RealmSessionIssuer
import com.storecore.identity.application.UnifiedAccessResolver
import com.storecore.identity.application.UnifiedAccessUseCases
import com.storecore.identity.domain.AccessContext
import com.storecore.identity.domain.CandidateResolution
import com.storecore.identity.domain.CanonicalEmail
import com.storecore.identity.domain.IdentityRealm
import com.storecore.identity.domain.LoginResolution
import com.storecore.identity.domain.ReturnDestination
import com.storecore.identity.infrastructure.security.ChallengeAttemptBudget
import com.storecore.identity.infrastructure.security.LoginAttemptBudget
import com.storecore.identity.infrastructure.security.LoginRateLimiter
import com.storecore.identity.infrastructure.security.OpaqueTokenFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class UnifiedAccessCoordinator(
    private val verifier: CandidateAuthenticationPort,
    private val issuer: RealmSessionIssuer,
    private val challenges: AccessChallengePort,
    private val resolver: UnifiedAccessResolver,
    private val loginBudget: LoginAttemptBudget,
    private val realmFailures: LoginRateLimiter,
    private val challengeBudget: ChallengeAttemptBudget,
    private val tokens: OpaqueTokenFactory,
    private val transactions: TransactionTemplate,
) : UnifiedAccessUseCases {
    override fun login(
        email: String,
        password: String,
        returnPath: String?,
        sourceIp: String,
        acceptedOrigin: String,
    ): LoginResolution {
        val canonical = CanonicalEmail.fromWire(email) ?: throw AuthenticationFailed()
        loginBudget.acquire(sourceIp, canonical.value)
        val candidates = buildList {
            IdentityRealm.entries.forEach { realm ->
                realmFailures.checkAllowed(realm, sourceIp, canonical.value)
                val candidate = verifier.verify(realm, canonical, password)
                if (candidate == null) realmFailures.recordFailure(realm, sourceIp, canonical.value) else add(candidate)
            }
        }
        return when (val resolution = resolver.resolve(candidates, ReturnDestination.fromReturnPath(returnPath))) {
            CandidateResolution.Rejected -> throw AuthenticationFailed()
            is CandidateResolution.Single -> transactions.execute {
                LoginResolution.Authenticated(issuer.issue(resolution.candidate), resolution.destination)
            } ?: error("UNIFIED_LOGIN_TRANSACTION_FAILED")
            is CandidateResolution.SelectionRequired -> transactions.execute {
                val pending = challenges.create(resolution.customer, resolution.user, resolution.destination, acceptedOrigin)
                LoginResolution.ContextSelectionRequired(pending.challenge, pending.bindingNonce, pending.expiresAt, pending.destination)
            } ?: error("UNIFIED_CHALLENGE_TRANSACTION_FAILED")
        }
    }

    override fun select(
        challenge: String,
        bindingNonce: String,
        context: String?,
        sourceIp: String,
        acceptedOrigin: String,
    ): LoginResolution.Authenticated {
        val challengeHash = tokens.sha256(challenge)
        val admission = challengeBudget.checkAllowed(sourceIp, challengeHash)
        val selected = AccessContext.fromWire(context)
        if (selected == AccessContext.Unknown) {
            admission.reject()
            throw AccessChallengeRejected()
        }
        return try {
            transactions.execute {
                val consumed = challenges.consume(challenge, bindingNonce, acceptedOrigin, selected)
                LoginResolution.Authenticated(issuer.issue(consumed.candidate), consumed.destination)
            } ?: error("UNIFIED_SELECTION_TRANSACTION_FAILED")
        } catch (rejected: AccessChallengeRejected) {
            admission.reject()
            throw rejected
        } catch (rejected: AuthenticationFailed) {
            admission.reject()
            throw AccessChallengeRejected()
        }
    }
}
