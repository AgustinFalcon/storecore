package com.storecore.notification.application

import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.notification.domain.*

data class NotificationLifecycleRequest(val commandId: NotificationCommandId, val alertId: NotificationId,
    val expectedRevision: NotificationRevision, val step: NotificationTransitionStep, val reason: NotificationReason)

enum class NotificationReceiptOutcome(val wire: String) {
    APPLIED("APPLIED"), REVISION_CONFLICT("REVISION_CONFLICT"), INVALID_TRANSITION("INVALID_TRANSITION"), REVISION_EXHAUSTED("REVISION_EXHAUSTED"), UNKNOWN("UNKNOWN");
    companion object {
        fun fromWire(raw: String?) = entries.firstOrNull { it != UNKNOWN && it.wire == raw } ?: UNKNOWN
        fun of(result: NotificationCommandResult) = when (result) {
            is NotificationCommandResult.Applied -> APPLIED
            is NotificationCommandResult.RevisionConflict -> REVISION_CONFLICT
            NotificationCommandResult.InvalidTransition -> INVALID_TRANSITION
            NotificationCommandResult.RevisionExhausted -> REVISION_EXHAUSTED
            else -> UNKNOWN
        }
    }
}

class NotificationCommandReceipt(val command: NotificationCommand.ChangeLifecycle, val before: NotificationAlert, val result: NotificationCommandResult)

sealed interface NotificationExecutionResult {
    class Recorded(val receipt: NotificationCommandReceipt) : NotificationExecutionResult
    data object Unauthorized : NotificationExecutionResult
    data object Missing : NotificationExecutionResult
    data object IdempotencyConflict : NotificationExecutionResult
    data object Unknown : NotificationExecutionResult
}
sealed interface NotificationIngestionResult {
    class Recorded(val alert: NotificationAlert) : NotificationIngestionResult
    data object DeliveryConflict : NotificationIngestionResult
    data object Unknown : NotificationIngestionResult
}

interface NotificationPersistencePort {
    fun ingest(event: NotificationSourceEvent): NotificationIngestionResult
    fun execute(actor: InternalUserPrincipal, request: NotificationLifecycleRequest): NotificationExecutionResult
    fun find(id: NotificationId): NotificationAlert?
}

/** Authorization is also rechecked under database locks, including on receipt replay. */
class NotificationPersistenceService(private val persistence: NotificationPersistencePort) {
    fun ingest(event: NotificationSourceEvent) = persistence.ingest(event)
    fun execute(actor: InternalUserPrincipal, request: NotificationLifecycleRequest): NotificationExecutionResult =
        if (InternalRole.ADMIN !in actor.roles) NotificationExecutionResult.Unauthorized
        else if (request.step == NotificationTransitionStep.Unknown) NotificationExecutionResult.Unknown
        else persistence.execute(actor, request)
}
