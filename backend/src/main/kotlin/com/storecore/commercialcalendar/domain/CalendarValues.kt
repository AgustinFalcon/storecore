package com.storecore.commercialcalendar.domain

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.zone.ZoneRulesProvider
import java.util.UUID

private fun validId(value: UUID?)=value!=null && value!=UUID(0,0)
@JvmInline value class CalendarEventId private constructor(val value: UUID) { companion object { fun fromWire(value: UUID?)=value?.takeIf(::validId)?.let(::CalendarEventId) } }
@JvmInline value class CalendarCommandId private constructor(val value: UUID) { companion object { fun fromWire(value: UUID?)=value?.takeIf(::validId)?.let(::CalendarCommandId) } }
@JvmInline value class CalendarPreflightId private constructor(val value: UUID) { companion object { fun fromWire(value: UUID?)=value?.takeIf(::validId)?.let(::CalendarPreflightId) } }
@JvmInline value class CalendarRuleId private constructor(val value: UUID) { companion object { fun fromWire(value: UUID?)=value?.takeIf(::validId)?.let(::CalendarRuleId) } }
@JvmInline value class CalendarOccurrenceId private constructor(val value: UUID) { companion object { fun fromWire(value: UUID?)=value?.takeIf(::validId)?.let(::CalendarOccurrenceId) } }
@JvmInline value class CalendarRevision private constructor(val value: Long) {
    fun next()=if(value==Long.MAX_VALUE) null else CalendarRevision(value+1)
    companion object { fun fromWire(value: Long?)=value?.takeIf { it>=0 }?.let(::CalendarRevision); val Zero=CalendarRevision(0) }
}
@JvmInline value class CalendarHash private constructor(val value: String) { companion object { fun fromWire(value: String?)=value?.takeIf { it.matches(Regex("[0-9a-f]{64}")) }?.let(::CalendarHash) } }
@JvmInline value class CalendarCommandPayloadHash private constructor(val value: String) { companion object { fun fromWire(value: String?)=value?.takeIf { it.matches(Regex("[0-9a-f]{64}")) }?.let(::CalendarCommandPayloadHash) } }
internal fun calendarText(raw: String?, minimum: Int, maximum: Int): String? {
    if(raw==null || raw.contains('\u0000') || raw.indices.any { i -> Character.isHighSurrogate(raw[i]) && (i+1==raw.length || !Character.isLowSurrogate(raw[i+1])) || Character.isLowSurrogate(raw[i]) && (i==0 || !Character.isHighSurrogate(raw[i-1])) }) return null
    return raw.trim(' ','\t','\n','\r','\u000b','\u000c').takeIf { it.codePointCount(0,it.length) in minimum..maximum }
}
@JvmInline value class CalendarTitle private constructor(val value: String) { companion object { fun fromWire(raw: String?)=calendarText(raw,1,120)?.let(::CalendarTitle) } }
@JvmInline value class CalendarDescription private constructor(val value: String) { companion object { fun fromWire(raw: String?)=calendarText(raw,0,1000)?.let(::CalendarDescription) } }
@JvmInline value class CalendarReason private constructor(val value: String) { companion object { fun fromWire(raw: String?)=calendarText(raw,1,500)?.let(::CalendarReason) } }
@JvmInline value class CalendarCampaignReference private constructor(val value: String) { companion object { fun fromWire(raw: String?)=raw?.takeIf { it.matches(Regex("[A-Z0-9_.-]{1,64}")) }?.let(::CalendarCampaignReference) } }

class CalendarTime private constructor(val localDateTime: LocalDateTime,val timeZone: String,val offset: ZoneOffset,val instant: Instant) {
    companion object {
        fun fromWire(localDateTime: String?,timeZone: String?,offset: String?): CalendarTime? = runCatching {
            require(localDateTime!=null && localDateTime.matches(Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}")))
            require(timeZone!=null && timeZone in ZoneRulesProvider.getAvailableZoneIds() && timeZone !in ZoneId.SHORT_IDS.keys)
            val zone=ZoneId.of(timeZone); require(zone.id==timeZone && !zone.rules.isFixedOffset)
            require(offset!=null && offset.matches(Regex("Z|[+-][0-9]{2}:[0-9]{2}")))
            val local=LocalDateTime.parse(localDateTime); val chosen=ZoneOffset.of(offset)
            require(chosen in zone.rules.getValidOffsets(local))
            CalendarTime(local,timeZone,chosen,local.toInstant(chosen))
        }.getOrNull()
    }
}
interface CalendarClock { fun now(): Instant }
interface CalendarIds { fun event(): CalendarEventId; fun preflight(): CalendarPreflightId; fun occurrence(): CalendarOccurrenceId }
interface CalendarHasher { fun hash(fields: List<String>): CalendarHash; fun systemCommand(event: CalendarEventId,revision: CalendarRevision,operation: CalendarOperation,boundary: Instant): CalendarCommandId }
