package com.storecore.commercialcalendar.domain

import java.time.Instant

class CalendarSwitchMetadata private constructor(
    val owner: CalendarSwitchOwner,
    val reason: CalendarReason,
    val createdAt: Instant,
    val expiresAt: Instant,
    val removalTicket: CalendarRemovalTicket,
    val affectedAction: CalendarSwitchAction,
) {
    companion object {
        private const val MINIMUM_SECONDS = 300L
        private const val MAXIMUM_SECONDS = 7L * 86_400L

        fun forNewCommand(
            owner: CalendarSwitchOwner,
            reason: CalendarReason,
            createdAt: Instant,
            expiresAt: Instant,
            removalTicket: CalendarRemovalTicket,
            affectedAction: CalendarSwitchAction,
            authoritativeNow: Instant,
        ): CalendarSwitchMetadata? {
            if (createdAt.nano != 0 || expiresAt.nano != 0 || createdAt != authoritativeNow || affectedAction != CalendarSwitchAction.EMIT_IN_APP_CAMPAIGN_REMINDER) return null
            val minimum = runCatching { authoritativeNow.plusSeconds(MINIMUM_SECONDS) }.getOrNull() ?: return null
            val maximum = runCatching { authoritativeNow.plusSeconds(MAXIMUM_SECONDS) }.getOrNull() ?: return null
            if (expiresAt <= minimum || expiresAt > maximum) return null
            return CalendarSwitchMetadata(owner, reason, createdAt, expiresAt, removalTicket, affectedAction)
        }

        fun restore(
            owner: CalendarSwitchOwner,
            reason: CalendarReason,
            createdAt: Instant,
            expiresAt: Instant,
            removalTicket: CalendarRemovalTicket,
            affectedAction: CalendarSwitchAction,
        ): CalendarSwitchMetadata? = if (
            createdAt.nano == 0 && expiresAt.nano == 0 && expiresAt > createdAt &&
            affectedAction == CalendarSwitchAction.EMIT_IN_APP_CAMPAIGN_REMINDER
        ) CalendarSwitchMetadata(owner, reason, createdAt, expiresAt, removalTicket, affectedAction) else null
    }
}

class CalendarSwitchSnapshot private constructor(
    val configuredState: CalendarSwitchState,
    val revision: CalendarRevision,
    val metadata: CalendarSwitchMetadata?,
) {
    fun effectivity(at: Instant): CalendarSwitchEffectivity = when (configuredState) {
        CalendarSwitchState.DISABLED -> CalendarSwitchEffectivity.DISABLED
        CalendarSwitchState.ENABLED -> if (metadata != null && at < metadata.expiresAt) CalendarSwitchEffectivity.EFFECTIVE else CalendarSwitchEffectivity.EXPIRED
        CalendarSwitchState.UNKNOWN -> CalendarSwitchEffectivity.UNKNOWN
    }

    companion object {
        fun bootstrap() = CalendarSwitchSnapshot(CalendarSwitchState.DISABLED, CalendarRevision.Zero, null)
        fun restore(state: CalendarSwitchState, revision: CalendarRevision, metadata: CalendarSwitchMetadata?): CalendarSwitchSnapshot? {
            if (state == CalendarSwitchState.UNKNOWN) return null
            if (revision == CalendarRevision.Zero) return if (state == CalendarSwitchState.DISABLED && metadata == null) bootstrap() else null
            return metadata?.let { CalendarSwitchSnapshot(state, revision, it) }
        }
    }
}

class CalendarSwitchDecision private constructor(val outcome: CalendarOutcome, val snapshot: CalendarSwitchSnapshot) {
    companion object {
        fun apply(
            before: CalendarSwitchSnapshot,
            expectedRevision: CalendarRevision,
            operation: CalendarSwitchOperation,
            metadata: CalendarSwitchMetadata,
            capabilityActive: Boolean,
            now: Instant,
        ): CalendarSwitchDecision {
            if (before.revision != expectedRevision) return CalendarSwitchDecision(CalendarOutcome.REVISION_CONFLICT, before)
            val effectivity = before.effectivity(now)
            if (operation == CalendarSwitchOperation.UNKNOWN ||
                operation == CalendarSwitchOperation.ENABLE && effectivity == CalendarSwitchEffectivity.EFFECTIVE ||
                operation == CalendarSwitchOperation.DISABLE && effectivity != CalendarSwitchEffectivity.EFFECTIVE
            ) return CalendarSwitchDecision(CalendarOutcome.INVALID_TRANSITION, before)
            if (operation == CalendarSwitchOperation.ENABLE && !capabilityActive) return CalendarSwitchDecision(CalendarOutcome.CAPABILITY_NOT_ACTIVE, before)
            val nextRevision = before.revision.next() ?: return CalendarSwitchDecision(CalendarOutcome.REVISION_EXHAUSTED, before)
            val nextState = if (operation == CalendarSwitchOperation.ENABLE) CalendarSwitchState.ENABLED else CalendarSwitchState.DISABLED
            return CalendarSwitchDecision(CalendarOutcome.APPLIED, requireNotNull(CalendarSwitchSnapshot.restore(nextState, nextRevision, metadata)))
        }
    }
}
