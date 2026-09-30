package com.storecore.configuration.application

import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.domain.CapabilityAdminCommand
import com.storecore.configuration.domain.CapabilityModuleView
import com.storecore.configuration.domain.CapabilityState
import com.storecore.identity.domain.InternalUserPrincipal
import java.time.Instant
import java.util.UUID

interface CapabilityDecisionPort {
    fun decide(module: String, action: String, actor: CapabilityActor)
}

interface CapabilityAdministrationPort {
    fun list(): List<CapabilityModuleView>
    fun changeState(actor: InternalUserPrincipal, module: String, state: CapabilityState, expectedVersion: Int?, reason: String, correlation: UUID)
    fun createKill(actor: InternalUserPrincipal, module: String, action: String, owner: String, reason: String, expiresAt: Instant, ticket: String, correlation: UUID): Long
    fun removeKill(actor: InternalUserPrincipal, expectedActiveId: Long, reason: String, correlation: UUID)
    fun replaceKill(actor: InternalUserPrincipal, expectedActiveId: Long, owner: String, reason: String, expiresAt: Instant, ticket: String, correlation: UUID): Long
}

interface CapabilityAdminCommandPort {
    fun admit(actor: InternalUserPrincipal, command: CapabilityAdminCommand)
    fun commit(actor: InternalUserPrincipal, command: CapabilityAdminCommand): String
    fun commandStatus(actor: InternalUserPrincipal, correlation: UUID): String?
    fun abortCommand(actor: InternalUserPrincipal, correlation: UUID): String
}
