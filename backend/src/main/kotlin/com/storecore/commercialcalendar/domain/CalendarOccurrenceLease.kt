package com.storecore.commercialcalendar.domain

import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

enum class CalendarOccurrenceTerminalReason(val wire: String) {
    LATE("LATE"), SWITCH_DISABLED("SWITCH_DISABLED"), SWITCH_EXPIRED("SWITCH_EXPIRED"), ENABLE_CUTOFF("ENABLE_CUTOFF"),
    EVENT_INELIGIBLE("EVENT_INELIGIBLE"), DEFINITION_CHANGED("DEFINITION_CHANGED"), RESUME_CUTOFF("RESUME_CUTOFF"), CAPABILITY_BLOCKED("CAPABILITY_BLOCKED"),
    ATTEMPTS_EXHAUSTED("ATTEMPTS_EXHAUSTED"), PERMANENT_FAILURE("PERMANENT_FAILURE"), UNKNOWN("UNKNOWN");
    val skip get()=this in setOf(LATE,SWITCH_DISABLED,SWITCH_EXPIRED,ENABLE_CUTOFF,EVENT_INELIGIBLE,DEFINITION_CHANGED,RESUME_CUTOFF,CAPABILITY_BLOCKED)
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}

enum class CalendarOccurrenceFailureClass(val wire: String) {
    RETRYABLE_PRE_HANDOFF("RETRYABLE_PRE_HANDOFF"), PERMANENT_PRE_HANDOFF("PERMANENT_PRE_HANDOFF"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.wire==raw } ?: UNKNOWN }
}

@JvmInline value class CalendarLeaseOwner private constructor(val value: UUID) {
    companion object { fun fromWire(raw: UUID?)=raw?.takeIf { it!=UUID(0,0) }?.let(::CalendarLeaseOwner) }
}

class CalendarOccurrenceLeaseToken private constructor(val owner: CalendarLeaseOwner,val attempt: Int) {
    companion object { fun from(owner: CalendarLeaseOwner,attempt: Int)=if(attempt in 1..3) CalendarOccurrenceLeaseToken(owner,attempt) else null }
}

/** A granted lease retains both the early eligibility instant and its later grant instant. */
class CalendarOccurrenceLease private constructor(
    val occurrence: CalendarReminderOccurrence,val token: CalendarOccurrenceLeaseToken,
    val observedAt: Instant,val leaseGrantedAt: Instant,val leaseUntil: Instant,
) {
    companion object {
        fun from(occurrence: CalendarReminderOccurrence,observedAt: Instant,leaseGrantedAt: Instant): CalendarOccurrenceLease? {
            if(observedAt.truncatedTo(ChronoUnit.SECONDS)!=observedAt || leaseGrantedAt.truncatedTo(ChronoUnit.SECONDS)!=leaseGrantedAt || leaseGrantedAt<observedAt || occurrence.state!=CalendarOccurrenceState.LEASED) return null
            val owner=CalendarLeaseOwner.fromWire(occurrence.leaseOwner) ?: return null
            val token=CalendarOccurrenceLeaseToken.from(owner,occurrence.attempts) ?: return null
            val until=runCatching { leaseGrantedAt.plusSeconds(60) }.getOrNull() ?: return null
            if(occurrence.leaseUntil!=until || occurrence.scheduledAt>observedAt) return null
            return CalendarOccurrenceLease(occurrence,token,observedAt,leaseGrantedAt,until)
        }
    }
}
