package com.storecore.blackstore.application

import com.storecore.blackstore.domain.CompanionAdminCommand
import com.storecore.identity.application.IdentityUseCases
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID

data class CompanionAdminMutation<T>(val value: T, val nextCsrf: String)

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class CompanionAdminCommandService(
    private val commands: CompanionAdminCommandPort,
    private val identity: IdentityUseCases,
    private val transactions: TransactionTemplate,
) {
    fun pair(actor: InternalUserPrincipal, csrf: String, command: CompanionAdminCommand.Pair): CompanionAdminMutation<CompanionAdminView> =
        mutate(actor, csrf) { commands.pair(actor, command) }

    fun rotate(actor: InternalUserPrincipal, csrf: String, command: CompanionAdminCommand.Rotate): CompanionAdminMutation<CompanionAdminView> =
        mutate(actor, csrf) { commands.rotate(actor, command) }

    fun applyState(actor: InternalUserPrincipal, csrf: String, command: CompanionAdminCommand.ApplyState): CompanionAdminMutation<CompanionAdminView> =
        mutate(actor, csrf) { commands.applyState(actor, command) }

    fun status(actor: InternalUserPrincipal, correlation: UUID): CompanionAdminView = commands.commandStatus(actor, correlation)

    private fun <T> mutate(actor: InternalUserPrincipal, csrf: String, action: () -> T): CompanionAdminMutation<T> {
        val nextCsrf = transactions.execute {
            identity.verifyCsrf(actor, csrf)
            identity.rotateCsrf(actor)
        } ?: error("COMPANION_ADMIN_TX_S_FAILED")
        return CompanionAdminMutation(action(), nextCsrf)
    }
}
