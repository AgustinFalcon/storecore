package com.storecore.commercialcalendar.application

import com.storecore.commercialcalendar.domain.*
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import java.time.Instant

data class CalendarSwitchCommandRequest(
    val commandId: CalendarCommandId,
    val expectedRevision: CalendarRevision,
    val operation: CalendarSwitchOperation,
    val owner: CalendarSwitchOwner,
    val reason: CalendarReason,
    val expiresAt: Instant,
    val removalTicket: CalendarRemovalTicket,
    val affectedAction: CalendarSwitchAction,
)

class CalendarSwitchReceipt(
    val commandId: CalendarCommandId,
    val actorId: Long,
    val operation: CalendarSwitchOperation,
    val outcome: CalendarOutcome,
    val expectedRevision: CalendarRevision,
    val requestedMetadata: CalendarSwitchMetadata,
    val before: CalendarSwitchSnapshot,
    val after: CalendarSwitchSnapshot,
    val recordedAt: Instant,
)

sealed interface CalendarSwitchPersistenceResult {
    class Recorded(val receipt: CalendarSwitchReceipt): CalendarSwitchPersistenceResult
    data object Unauthorized: CalendarSwitchPersistenceResult
    data object Missing: CalendarSwitchPersistenceResult
    data object IdempotencyConflict: CalendarSwitchPersistenceResult
    data object Invalid: CalendarSwitchPersistenceResult
    data object Unknown: CalendarSwitchPersistenceResult
}

interface CalendarSwitchPersistencePort {
    fun change(actor: InternalUserPrincipal,request: CalendarSwitchCommandRequest): CalendarSwitchPersistenceResult
    fun receipt(actor: InternalUserPrincipal,commandId: CalendarCommandId): CalendarSwitchPersistenceResult
    fun audit(actor: InternalUserPrincipal,paging: CalendarPageRequest): CalendarQueryResult<CalendarPage<CalendarSwitchReceipt>>
}

class CalendarSwitchCommandService(private val persistence: CalendarSwitchPersistencePort) {
    fun change(actor: InternalUserPrincipal,request: CalendarSwitchCommandRequest)=
        if(InternalRole.ADMIN in actor.roles) persistence.change(actor,request) else CalendarSwitchPersistenceResult.Unauthorized
    fun receipt(actor: InternalUserPrincipal,id: CalendarCommandId)=
        if(InternalRole.ADMIN in actor.roles) persistence.receipt(actor,id) else CalendarSwitchPersistenceResult.Unauthorized
    fun audit(actor: InternalUserPrincipal,paging: CalendarPageRequest)=
        if(InternalRole.ADMIN in actor.roles) persistence.audit(actor,paging) else CalendarQueryResult.Unauthorized
}
