package com.storecore.identity.infrastructure.web

import com.storecore.identity.application.IdentityUseCases
import com.storecore.identity.domain.AuthenticatedPrincipal
import com.storecore.identity.domain.IdentityMutationScope
import com.storecore.identity.infrastructure.persistence.IdentityMutationLocks
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate

data class CsrfMutation<T>(val value: T, val nextCsrf: String)

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class IdentityMutationCoordinator(
    private val transactions: TransactionTemplate,
    private val identity: IdentityUseCases,
    private val locks: IdentityMutationLocks,
) {
    fun <T> execute(principal: AuthenticatedPrincipal, csrf: String, effect: () -> T): CsrfMutation<T> =
        executeScoped(principal, csrf, locks.own(principal), effect)

    fun <T> executeForSession(principal: AuthenticatedPrincipal, csrf: String, session: java.util.UUID, effect: () -> T): CsrfMutation<T> =
        executeScoped(principal, csrf, locks.sessionTarget(principal, session), effect)

    fun <T> executeForCustomer(principal: AuthenticatedPrincipal, csrf: String, customerId: Long, effect: () -> T): CsrfMutation<T> =
        executeScoped(principal, csrf, locks.customerTarget(principal, customerId), effect)

    private fun <T> executeScoped(principal: AuthenticatedPrincipal, csrf: String, scope: IdentityMutationScope, effect: () -> T): CsrfMutation<T> =
        transactions.execute {
            locks.acquire(scope)
            locks.lockSessions(scope)
            locks.revalidateActor(principal)
            identity.verifyCsrf(principal, csrf)
            CsrfMutation(effect(), identity.rotateCsrf(principal))
        } ?: error("IDENTITY_MUTATION_TRANSACTION_FAILED")

    fun logout(principal: AuthenticatedPrincipal, csrf: String) {
        transactions.executeWithoutResult {
            val scope = locks.own(principal)
            locks.acquire(scope)
            locks.lockSessions(scope)
            locks.revalidateActor(principal)
            identity.verifyCsrf(principal, csrf)
            identity.logout(principal)
        }
    }
}
