package com.storecore.configuration.application

import com.storecore.configuration.domain.CapabilityAdminCommand
import com.storecore.configuration.domain.CapabilityModuleView
import com.storecore.identity.application.IdentityUseCases
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.util.UUID

data class CapabilityAdminMutation<T>(val value: T, val nextCsrf: String)

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class CapabilityAdminCommandService(
    private val commands: CapabilityAdminCommandPort,
    private val capabilities: CapabilityAdministrationPort,
    private val identity: IdentityUseCases,
    private val transactions: TransactionTemplate,
) {
    fun changeState(actor: InternalUserPrincipal, csrf: String, command: CapabilityAdminCommand.ChangeState): CapabilityAdminMutation<CapabilityModuleView> {
        val expected = if (command.expectedConfigVersion > 0) {
            command.expectedConfigVersion
        } else {
            capabilities.list().first { it.module.wire == command.module }.configVersion
        }
        val resolved = command.copy(expectedConfigVersion = expected)
        val nextCsrf = admit(actor, csrf, resolved)
        commands.commit(actor, resolved)
        val view = capabilities.list().first { it.module.wire == resolved.module }
        return CapabilityAdminMutation(view, nextCsrf)
    }

    fun createKill(actor: InternalUserPrincipal, csrf: String, command: CapabilityAdminCommand.KillCreate): CapabilityAdminMutation<Long> {
        val nextCsrf = admit(actor, csrf, command)
        val json = commands.commit(actor, command)
        return CapabilityAdminMutation(killId(json), nextCsrf)
    }

    fun removeKill(actor: InternalUserPrincipal, csrf: String, command: CapabilityAdminCommand.KillRemove): CapabilityAdminMutation<Map<String, Any?>> {
        val nextCsrf = admit(actor, csrf, command)
        commands.commit(actor, command)
        return CapabilityAdminMutation(mapOf("id" to command.expectedActiveId, "removed" to true), nextCsrf)
    }

    fun replaceKill(actor: InternalUserPrincipal, csrf: String, command: CapabilityAdminCommand.KillReplace): CapabilityAdminMutation<Long> {
        val nextCsrf = admit(actor, csrf, command)
        val json = commands.commit(actor, command)
        return CapabilityAdminMutation(killId(json), nextCsrf)
    }

    fun status(actor: InternalUserPrincipal, correlation: UUID): String? = commands.commandStatus(actor, correlation)

    fun abort(actor: InternalUserPrincipal, csrf: String, correlation: UUID): CapabilityAdminMutation<String> {
        val nextCsrf = transactions.execute {
            identity.verifyCsrf(actor, csrf)
            identity.rotateCsrf(actor)
        } ?: error("CAPABILITY_ADMIN_TX_S_FAILED")
        return CapabilityAdminMutation(commands.abortCommand(actor, correlation), nextCsrf)
    }

    private fun admit(actor: InternalUserPrincipal, csrf: String, command: CapabilityAdminCommand): String =
        transactions.execute {
            identity.verifyCsrf(actor, csrf)
            commands.admit(actor, command)
            identity.rotateCsrf(actor)
        } ?: error("CAPABILITY_ADMIN_TX_S_FAILED")

    private fun killId(json: String): Long {
        val match = Regex("\"killSwitchId\"\\s*:\\s*(\\d+)").find(json) ?: throw CapabilityCommandAborted()
        return match.groupValues[1].toLong()
    }
}
