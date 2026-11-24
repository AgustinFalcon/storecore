package com.storecore.notification.domain

import java.time.Instant

sealed interface NotificationCommand {
    class ChangeLifecycle private constructor(
        val id: NotificationCommandId, val notificationId: NotificationId, val actorId: NotificationActorId,
        val expectedRevision: NotificationRevision, val step: NotificationTransitionStep, val reason: NotificationReason, val occurredAt: Instant,
    ) : NotificationCommand {
        fun payloadHash(): NotificationCommandPayloadHash = NotificationCommandPayloadHash.v1(this)
        companion object {
            fun create(id: NotificationCommandId, notificationId: NotificationId, actorId: NotificationActorId,
                       expectedRevision: NotificationRevision, step: NotificationTransitionStep, reason: NotificationReason,
                       occurredAt: Instant): ChangeLifecycle? = if (step == NotificationTransitionStep.Unknown) null
                else ChangeLifecycle(id, notificationId, actorId, expectedRevision, step, reason, occurredAt)
        }
    }
    data object Unknown : NotificationCommand
}

class NotificationLifecycleChange internal constructor(
    val command: NotificationCommand.ChangeLifecycle, val previous: NotificationLifecycle, val current: NotificationLifecycle,
    val previousRevision: NotificationRevision, val revision: NotificationRevision,
)

sealed interface NotificationCommandResult {
    class Applied(val alert: NotificationAlert, val change: NotificationLifecycleChange) : NotificationCommandResult
    class RevisionConflict(val current: NotificationRevision) : NotificationCommandResult
    data object WrongAggregate : NotificationCommandResult
    data object InvalidTransition : NotificationCommandResult
    data object RevisionExhausted : NotificationCommandResult
    data object Unknown : NotificationCommandResult
}

/** Immutable projection. Delivery deduplication and command replay require durable receipts in a later slice. */
class NotificationAlert private constructor(
    val id: NotificationId, val source: NotificationSourceIdentity, val fingerprint: NotificationFingerprint,
    val severity: NotificationSeverity, val category: NotificationCategory, val lifecycle: NotificationLifecycle,
    val revision: NotificationRevision,
) {
    fun apply(command: NotificationCommand): NotificationCommandResult {
        if (command !is NotificationCommand.ChangeLifecycle || source.type == NotificationSourceType.UNKNOWN || severity == NotificationSeverity.UNKNOWN ||
            category == NotificationCategory.UNKNOWN || lifecycle == NotificationLifecycle.UNKNOWN) return NotificationCommandResult.Unknown
        if (command.notificationId != id) return NotificationCommandResult.WrongAggregate
        if (command.expectedRevision != revision) return NotificationCommandResult.RevisionConflict(revision)
        if (!command.step.accepts(lifecycle)) return NotificationCommandResult.InvalidTransition
        val next = revision.next() ?: return NotificationCommandResult.RevisionExhausted
        val updated = NotificationAlert(id, source, fingerprint, severity, category, command.step.target, next)
        return NotificationCommandResult.Applied(updated, NotificationLifecycleChange(command, lifecycle, updated.lifecycle, revision, next))
    }

    companion object {
        fun open(id: NotificationId, source: NotificationSourceIdentity, category: NotificationCategory, severity: NotificationSeverity,
                 condition: NotificationConditionCode, episode: NotificationEpisodeKey): NotificationAlert? {
            if (source.type == NotificationSourceType.UNKNOWN || severity == NotificationSeverity.UNKNOWN) return null
            val fingerprint = NotificationFingerprint.v1(category, condition, episode) ?: return null
            return NotificationAlert(id, source, fingerprint, severity, category, NotificationLifecycle.OPEN, requireNotNull(NotificationRevision.fromWire(0)))
        }
        /** Unknown persisted vocabularies remain readable but cannot execute commands. */
        fun restore(id: NotificationId, source: NotificationSourceIdentity, fingerprint: NotificationFingerprint, category: NotificationCategory,
                    severity: NotificationSeverity, lifecycle: NotificationLifecycle, revision: NotificationRevision): NotificationAlert =
            NotificationAlert(id, source, fingerprint, severity, category, lifecycle, revision)
    }
}
