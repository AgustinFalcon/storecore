package com.storecore.blackstore.application

import com.storecore.blackstore.domain.CompanionAdminCommand
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.identity.domain.InternalUserPrincipal
import java.util.UUID

data class CompanionAdminView(
    val companionId: Long?,
    val status: CompanionLifecycleStatus?,
    val credentialVersion: Int?,
    val commandState: String,
    val operation: String?,
    val bearer: String?,
)

interface CompanionAdminCommandPort {
    fun pair(actor: InternalUserPrincipal, command: CompanionAdminCommand.Pair): CompanionAdminView
    fun rotate(actor: InternalUserPrincipal, command: CompanionAdminCommand.Rotate): CompanionAdminView
    fun applyState(actor: InternalUserPrincipal, command: CompanionAdminCommand.ApplyState): CompanionAdminView
    fun commandStatus(actor: InternalUserPrincipal, correlation: UUID): CompanionAdminView
}
