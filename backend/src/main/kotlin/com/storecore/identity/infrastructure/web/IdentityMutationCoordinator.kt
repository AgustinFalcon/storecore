package com.storecore.identity.infrastructure.web

import com.storecore.identity.application.IdentityUseCases
import com.storecore.identity.domain.AuthenticatedPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate

data class CsrfMutation<T>(val value: T, val nextCsrf: String)

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class IdentityMutationCoordinator(
    private val transactions: TransactionTemplate,
    private val identity: IdentityUseCases,
) {
    fun <T> execute(principal: AuthenticatedPrincipal, csrf: String, effect: () -> T): CsrfMutation<T> =
        transactions.execute {
            identity.verifyCsrf(principal, csrf)
            CsrfMutation(effect(), identity.rotateCsrf(principal))
        } ?: error("IDENTITY_MUTATION_TRANSACTION_FAILED")

    fun logout(principal: AuthenticatedPrincipal, csrf: String) {
        transactions.executeWithoutResult {
            identity.verifyCsrf(principal, csrf)
            identity.logout(principal)
        }
    }
}