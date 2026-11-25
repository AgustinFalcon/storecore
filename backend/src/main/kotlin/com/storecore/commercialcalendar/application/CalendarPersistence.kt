package com.storecore.commercialcalendar.application

import com.storecore.commercialcalendar.domain.*
import com.storecore.identity.domain.InternalUserPrincipal
import java.time.Instant

data class CalendarCreateRequest(val commandId: CalendarCommandId,val definition: CalendarDefinition)
data class CalendarPreflightRequest(val commandId: CalendarCommandId,val eventId: CalendarEventId,val expectedRevision: CalendarRevision)
data class CalendarChangeRequest(val commandId: CalendarCommandId,val eventId: CalendarEventId,val expectedRevision: CalendarRevision,
    val step: CalendarStep,val reason: CalendarReason,val definition: CalendarDefinition?=null,val preflightId: CalendarPreflightId?=null)
class CalendarReceipt(val commandId: CalendarCommandId,val eventId: CalendarEventId,val actorId: Long?,val operation: CalendarOperation,
    val payloadHash: CalendarCommandPayloadHash,val outcome: CalendarOutcome,val before: CalendarEvent?,val after: CalendarEvent,val recordedAt: Instant,
    val expectedRevision: CalendarRevision?,val reason: CalendarReason?,val requestedDefinitionHash: CalendarHash?,val preflightId: CalendarPreflightId?)
sealed interface CalendarPersistenceResult {
    class Recorded(val receipt: CalendarReceipt): CalendarPersistenceResult
    data object Unauthorized: CalendarPersistenceResult
    data object Missing: CalendarPersistenceResult
    data object IdempotencyConflict: CalendarPersistenceResult
    data object Unknown: CalendarPersistenceResult
}
sealed interface CalendarPreflightResult {
    class Recorded(val outcome: CalendarOutcome,val preflight: CalendarPreflight?,val event: CalendarEvent): CalendarPreflightResult
    data object Unauthorized: CalendarPreflightResult
    data object Missing: CalendarPreflightResult
    data object IdempotencyConflict: CalendarPreflightResult
    data object Unknown: CalendarPreflightResult
}
class CalendarReminderSwitch(val state: CalendarSwitchState,val revision: CalendarRevision)
interface CalendarPersistencePort {
    fun create(actor: InternalUserPrincipal,request: CalendarCreateRequest): CalendarPersistenceResult
    fun change(actor: InternalUserPrincipal,request: CalendarChangeRequest): CalendarPersistenceResult
    fun preflight(actor: InternalUserPrincipal,request: CalendarPreflightRequest): CalendarPreflightResult
    fun receipt(actor: InternalUserPrincipal,commandId: CalendarCommandId,eventId: CalendarEventId?=null): CalendarPersistenceResult
    fun find(eventId: CalendarEventId): CalendarEvent?
    fun audit(actor: InternalUserPrincipal,eventId: CalendarEventId): List<CalendarReceipt>?
    fun reminderSwitch(): CalendarReminderSwitch
}
/** Internal authority only. No runner or public route is installed in PCC-007A. */
interface CalendarSystemPersistencePort { fun advance(eventId: CalendarEventId,expectedRevision: CalendarRevision,step: CalendarStep): CalendarPersistenceResult }
