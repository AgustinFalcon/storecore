package com.storecore.identity.application

import com.storecore.identity.domain.CandidateResolution
import com.storecore.identity.domain.CanonicalEmail
import com.storecore.identity.domain.IdentityRealm
import com.storecore.identity.domain.IssuedCredentials
import com.storecore.identity.domain.ReturnDestination
import com.storecore.identity.domain.VerifiedAccessCandidate
import com.storecore.identity.domain.AccessContext
import com.storecore.identity.domain.LoginResolution
import java.time.Instant

/** Verification never creates an identity session. */
interface CandidateAuthenticationPort {
    fun verify(realm: IdentityRealm, canonicalEmail: CanonicalEmail, password: String): VerifiedAccessCandidate?
}

/** Infrastructure revalidates current activity/roles before issuing durable credentials. */
interface RealmSessionIssuer {
    fun issue(candidate: VerifiedAccessCandidate): IssuedCredentials
}

/** Pure decision step; duplicate or inconsistent candidates cannot receive priority. */
class UnifiedAccessResolver {
    fun resolve(candidates: List<VerifiedAccessCandidate>, requestedDestination: ReturnDestination): CandidateResolution {
        val eligible = candidates.filter { it.eligible }
        val customers = eligible.filterIsInstance<VerifiedAccessCandidate.Customer>()
        val users = eligible.filterIsInstance<VerifiedAccessCandidate.User>()
        if (customers.size > 1 || users.size > 1) return CandidateResolution.Rejected
        val destination = if (requestedDestination == ReturnDestination.Unknown) ReturnDestination.HOME else requestedDestination
        return when {
            customers.isEmpty() && users.isEmpty() -> CandidateResolution.Rejected
            customers.isNotEmpty() && users.isNotEmpty() -> CandidateResolution.SelectionRequired(customers.single(), users.single(), destination)
            else -> {
                val candidate = eligible.single()
                CandidateResolution.Single(candidate, destination.permittedFor(candidate.context))
            }
        }
    }
}

class PendingAccessChallenge(
    val challenge: String,
    val bindingNonce: String,
    val expiresAt: Instant,
    val destination: ReturnDestination,
) {
    override fun toString(): String = "PendingAccessChallenge(expiresAt=$expiresAt, destination=$destination)"
}

interface AccessChallengePort {
    fun create(
        customer: VerifiedAccessCandidate.Customer,
        user: VerifiedAccessCandidate.User,
        destination: ReturnDestination,
        acceptedOrigin: String,
    ): PendingAccessChallenge

    fun consume(challenge: String, bindingNonce: String, acceptedOrigin: String, context: AccessContext): ConsumedAccessChallenge
}

data class ConsumedAccessChallenge(val candidate: VerifiedAccessCandidate, val destination: ReturnDestination)

interface UnifiedAccessUseCases {
    fun login(email: String, password: String, returnPath: String?, sourceIp: String, acceptedOrigin: String): LoginResolution
    fun select(challenge: String, bindingNonce: String, context: String?, sourceIp: String, acceptedOrigin: String): LoginResolution.Authenticated
}
