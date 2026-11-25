package com.storecore.commercialcalendar.domain

import java.time.Instant
import java.util.UUID

/** Durable occurrence identity does not contain the mutable lifecycle revision. No claiming runner exists in this slice. */
class CalendarReminderOccurrence private constructor(val id: CalendarOccurrenceId,val eventId: CalendarEventId,val approvedDefinitionRevision: CalendarRevision,
    val ruleId: CalendarRuleId,val scheduledAt: Instant,val state: CalendarOccurrenceState,val attempts: Int,val leaseOwner: UUID?,val leaseUntil: Instant?) {
    fun episodeKey(hasher: CalendarHasher)=hasher.hash(listOf("calendar-occurrence-v1",eventId.value.toString(),approvedDefinitionRevision.value.toString(),ruleId.value.toString(),scheduledAt.toString()))
    companion object {
        fun pending(id: CalendarOccurrenceId,event: CalendarEvent,rule: CalendarReminderRule): CalendarReminderOccurrence? {
            val approved=event.approvedDefinitionRevision ?: return null
            if(event.lifecycle!=CalendarLifecycle.SCHEDULED || rule !in event.definition.reminders) return null
            return CalendarReminderOccurrence(id,event.id,approved,rule.id,event.definition.start.instant.minusSeconds(rule.offsetSeconds),CalendarOccurrenceState.PENDING,0,null,null)
        }
        fun restore(id: CalendarOccurrenceId,eventId: CalendarEventId,approved: CalendarRevision,ruleId: CalendarRuleId,scheduledAt: Instant,state: CalendarOccurrenceState,attempts: Int,leaseOwner: UUID?,leaseUntil: Instant?): CalendarReminderOccurrence? =
            if(state==CalendarOccurrenceState.UNKNOWN || attempts !in 0..3 || (state==CalendarOccurrenceState.LEASED)!=(leaseOwner!=null && leaseUntil!=null) || (leaseOwner==null)!=(leaseUntil==null) || leaseOwner==UUID(0,0) || state==CalendarOccurrenceState.LEASED && attempts==0) null
            else CalendarReminderOccurrence(id,eventId,approved,ruleId,scheduledAt,state,attempts,leaseOwner,leaseUntil)
    }
}
