package com.storecore.commercialcalendar.domain

import java.time.Duration
import java.time.Instant

class CalendarReminderRule private constructor(val id: CalendarRuleId,val channel: CalendarReminderChannel,val offsetSeconds: Long) {
    companion object { fun create(id: CalendarRuleId,channel: CalendarReminderChannel,offsetSeconds: Long)=
        if(channel!=CalendarReminderChannel.IN_APP || offsetSeconds !in 300..2_592_000) null else CalendarReminderRule(id,channel,offsetSeconds) }
}
class CalendarDefinition private constructor(val revision: CalendarRevision,val title: CalendarTitle,val description: CalendarDescription,
    val start: CalendarTime,val end: CalendarTime,val audience: CalendarAudience,val campaign: CalendarCampaignReference?,val reminders: List<CalendarReminderRule>,val hash: CalendarHash) {
    companion object {
        fun create(revision: CalendarRevision,title: CalendarTitle,description: CalendarDescription,start: CalendarTime,end: CalendarTime,
            audience: CalendarAudience,campaign: CalendarCampaignReference?,reminders: List<CalendarReminderRule>,hasher: CalendarHasher): CalendarDefinition? {
            if(audience!=CalendarAudience.INTERNAL_ALL || start.timeZone!=end.timeZone || !start.instant.isBefore(end.instant) || Duration.between(start.instant,end.instant)>Duration.ofDays(90) || reminders.size>5 || reminders.map { it.id }.distinct().size!=reminders.size || reminders.map { it.offsetSeconds }.distinct().size!=reminders.size) return null
            val rules=reminders.sortedBy { it.id.value.toString() }.toList()
            val fields=listOf("calendar-definition-v1",revision.value.toString(),title.value,description.value,start.instant.toString(),end.instant.toString(),start.timeZone,start.offset.id,end.offset.id,audience.wire,
                if(campaign==null) "0" else "1",campaign?.value ?: "",rules.size.toString())+rules.flatMap { listOf(it.id.value.toString(),it.channel.wire,it.offsetSeconds.toString()) }
            return CalendarDefinition(revision,title,description,start,end,audience,campaign,rules,hasher.hash(fields))
        }
    }
}
class CalendarEvent private constructor(val id: CalendarEventId,val revision: CalendarRevision,val lifecycle: CalendarLifecycle,val definition: CalendarDefinition,
    val approvedDefinitionRevision: CalendarRevision?,val createdAt: Instant) {
    fun changed(lifecycle: CalendarLifecycle,definition: CalendarDefinition=this.definition,approved: CalendarRevision?=approvedDefinitionRevision): CalendarEvent? =
        revision.next()?.let { restore(id,it,lifecycle,definition,approved,createdAt) }
    companion object {
        fun draft(id: CalendarEventId,definition: CalendarDefinition,now: Instant)=if(definition.revision!=CalendarRevision.Zero) null else CalendarEvent(id,CalendarRevision.Zero,CalendarLifecycle.DRAFT,definition,null,now)
        fun restore(id: CalendarEventId,revision: CalendarRevision,lifecycle: CalendarLifecycle,definition: CalendarDefinition,approved: CalendarRevision?,createdAt: Instant): CalendarEvent? =
            if(lifecycle==CalendarLifecycle.UNKNOWN || revision.value<definition.revision.value || approved!=null && approved!=definition.revision ||
                lifecycle==CalendarLifecycle.DRAFT && approved!=null || lifecycle in listOf(CalendarLifecycle.SCHEDULED,CalendarLifecycle.ACTIVE,CalendarLifecycle.PAUSED,CalendarLifecycle.COMPLETED) && approved==null) null
            else CalendarEvent(id,revision,lifecycle,definition,approved,createdAt)
    }
}
class CalendarPreflight(val id: CalendarPreflightId,val eventId: CalendarEventId,val revision: CalendarRevision,val definitionRevision: CalendarRevision,
    val definitionHash: CalendarHash,val issues: Set<CalendarPreflightIssue>,val checkedAt: Instant,val expiresAt: Instant) {
    companion object {
        fun check(id: CalendarPreflightId,event: CalendarEvent,now: Instant)=CalendarPreflight(id,event.id,event.revision,event.definition.revision,event.definition.hash,issues(event,now),now,now.plusSeconds(600))
        fun issues(event: CalendarEvent,now: Instant): Set<CalendarPreflightIssue> = buildSet {
            if(event.lifecycle!=CalendarLifecycle.DRAFT) add(CalendarPreflightIssue.INVALID_LIFECYCLE)
            if(event.definition.start.instant<now.plusSeconds(300)) add(CalendarPreflightIssue.LEAD_TOO_SHORT)
            if(event.definition.start.instant>now.plus(Duration.ofDays(366))) add(CalendarPreflightIssue.HORIZON_EXCEEDED)
            if(!event.definition.start.instant.isBefore(event.definition.end.instant) || Duration.between(event.definition.start.instant,event.definition.end.instant)>Duration.ofDays(90)) add(CalendarPreflightIssue.INVALID_WINDOW)
        }
    }
}
class CalendarDecision(val outcome: CalendarOutcome,val event: CalendarEvent) {
    companion object {
        fun apply(before: CalendarEvent,expected: CalendarRevision,step: CalendarStep,now: Instant,preflight: CalendarPreflight?=null,definition: CalendarDefinition?=null): CalendarDecision {
            if(before.revision!=expected) return CalendarDecision(CalendarOutcome.REVISION_CONFLICT,before)
            val failure=step.rejection(before,now,preflight,definition)
            if(failure!=null) return CalendarDecision(failure,before)
            val after=step.change(before,now,definition) ?: return CalendarDecision(CalendarOutcome.REVISION_EXHAUSTED,before)
            return CalendarDecision(CalendarOutcome.APPLIED,after)
        }
    }
}
/** Transition objects own their time and lifecycle guards; edit owns only draft definition changes. */
sealed class CalendarStep(val operation: CalendarOperation) {
    abstract fun rejection(event: CalendarEvent,now: Instant,preflight: CalendarPreflight?,definition: CalendarDefinition?): CalendarOutcome?
    abstract fun change(event: CalendarEvent,now: Instant,definition: CalendarDefinition?): CalendarEvent?
    data object Edit: CalendarStep(CalendarOperation.EDIT) {
        override fun rejection(event: CalendarEvent,now: Instant,preflight: CalendarPreflight?,definition: CalendarDefinition?)=
            if(event.lifecycle!=CalendarLifecycle.DRAFT) CalendarOutcome.INVALID_TRANSITION else if(event.definition.revision.next()==null) CalendarOutcome.REVISION_EXHAUSTED else if(definition==null || definition.revision!=event.definition.revision.next()) CalendarOutcome.INVALID_DEFINITION else null
        override fun change(event: CalendarEvent,now: Instant,definition: CalendarDefinition?)=event.changed(CalendarLifecycle.DRAFT,requireNotNull(definition))
    }
    data object Schedule: CalendarStep(CalendarOperation.SCHEDULE) {
        override fun rejection(event: CalendarEvent,now: Instant,preflight: CalendarPreflight?,definition: CalendarDefinition?): CalendarOutcome? {
            if(event.lifecycle!=CalendarLifecycle.DRAFT) return CalendarOutcome.INVALID_TRANSITION
            if(preflight==null) return CalendarOutcome.PREFLIGHT_REQUIRED
            if(preflight.eventId!=event.id || preflight.revision!=event.revision || preflight.definitionRevision!=event.definition.revision || preflight.definitionHash!=event.definition.hash) return CalendarOutcome.PREFLIGHT_STALE
            if(now<preflight.checkedAt || now>=preflight.expiresAt) return CalendarOutcome.PREFLIGHT_EXPIRED
            if(preflight.issues.isNotEmpty() || CalendarPreflight.issues(event,now).isNotEmpty()) return CalendarOutcome.INVALID_DEFINITION
            return null
        }
        override fun change(event: CalendarEvent,now: Instant,definition: CalendarDefinition?)=event.changed(CalendarLifecycle.SCHEDULED,approved=event.definition.revision)
    }
    data object Pause: CalendarStep(CalendarOperation.PAUSE) {
        override fun rejection(event: CalendarEvent,now: Instant,preflight: CalendarPreflight?,definition: CalendarDefinition?)=if(event.lifecycle !in listOf(CalendarLifecycle.SCHEDULED,CalendarLifecycle.ACTIVE)) CalendarOutcome.INVALID_TRANSITION else null
        override fun change(event: CalendarEvent,now: Instant,definition: CalendarDefinition?)=event.changed(CalendarLifecycle.PAUSED)
    }
    data object Resume: CalendarStep(CalendarOperation.RESUME) {
        override fun rejection(event: CalendarEvent,now: Instant,preflight: CalendarPreflight?,definition: CalendarDefinition?)=if(event.lifecycle!=CalendarLifecycle.PAUSED || now>=event.definition.end.instant) CalendarOutcome.INVALID_TRANSITION else null
        override fun change(event: CalendarEvent,now: Instant,definition: CalendarDefinition?)=event.changed(if(now<event.definition.start.instant) CalendarLifecycle.SCHEDULED else CalendarLifecycle.ACTIVE)
    }
    data object Cancel: CalendarStep(CalendarOperation.CANCEL) {
        override fun rejection(event: CalendarEvent,now: Instant,preflight: CalendarPreflight?,definition: CalendarDefinition?)=if(event.lifecycle !in listOf(CalendarLifecycle.DRAFT,CalendarLifecycle.SCHEDULED,CalendarLifecycle.ACTIVE,CalendarLifecycle.PAUSED)) CalendarOutcome.INVALID_TRANSITION else null
        override fun change(event: CalendarEvent,now: Instant,definition: CalendarDefinition?)=event.changed(CalendarLifecycle.CANCELLED)
    }
    data object Activate: CalendarStep(CalendarOperation.SYSTEM_ACTIVATE) {
        override fun rejection(event: CalendarEvent,now: Instant,preflight: CalendarPreflight?,definition: CalendarDefinition?)=if(event.lifecycle!=CalendarLifecycle.SCHEDULED || now<event.definition.start.instant || now>=event.definition.end.instant) CalendarOutcome.INVALID_TRANSITION else null
        override fun change(event: CalendarEvent,now: Instant,definition: CalendarDefinition?)=event.changed(CalendarLifecycle.ACTIVE)
    }
    data object Complete: CalendarStep(CalendarOperation.SYSTEM_COMPLETE) {
        override fun rejection(event: CalendarEvent,now: Instant,preflight: CalendarPreflight?,definition: CalendarDefinition?)=if(event.lifecycle !in listOf(CalendarLifecycle.SCHEDULED,CalendarLifecycle.ACTIVE,CalendarLifecycle.PAUSED) || now<event.definition.end.instant) CalendarOutcome.INVALID_TRANSITION else null
        override fun change(event: CalendarEvent,now: Instant,definition: CalendarDefinition?)=event.changed(CalendarLifecycle.COMPLETED)
    }
    data object Unknown: CalendarStep(CalendarOperation.UNKNOWN) {
        override fun rejection(event: CalendarEvent,now: Instant,preflight: CalendarPreflight?,definition: CalendarDefinition?)=CalendarOutcome.UNKNOWN
        override fun change(event: CalendarEvent,now: Instant,definition: CalendarDefinition?): CalendarEvent?=null
    }
    companion object { val known: List<CalendarStep> get()=listOf(Edit,Schedule,Pause,Resume,Cancel,Activate,Complete); fun fromOperation(operation: CalendarOperation)=known.firstOrNull { it.operation==operation } ?: Unknown }
}
