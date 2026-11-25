package com.storecore.commercialcalendar.infrastructure

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commercialcalendar.domain.*
import java.time.Instant
import java.util.UUID

internal class CalendarSnapshotCodec(private val mapper: ObjectMapper,private val hasher: CalendarHasher) {
    private fun definitionValue(d: CalendarDefinition)=mapOf("revision" to d.revision.value.toString(),"title" to d.title.value,"description" to d.description.value,
        "startLocal" to d.start.localDateTime.toString().let { if(it.length==16) "$it:00" else it },"endLocal" to d.end.localDateTime.toString().let { if(it.length==16) "$it:00" else it },
        "startAt" to d.start.instant.toString(),"endAt" to d.end.instant.toString(),"timeZone" to d.start.timeZone,"startOffset" to d.start.offset.id,"endOffset" to d.end.offset.id,
        "audience" to d.audience.wire,"campaign" to d.campaign?.value,"hash" to d.hash.value,
        "reminders" to d.reminders.map { mapOf("id" to it.id.value.toString(),"channel" to it.channel.wire,"offsetSeconds" to it.offsetSeconds) })
    fun definition(d: CalendarDefinition): String=mapper.writeValueAsString(definitionValue(d))
    fun event(e: CalendarEvent): String=mapper.writeValueAsString(mapOf("id" to e.id.value.toString(),"revision" to e.revision.value.toString(),"lifecycle" to e.lifecycle.wire,
        "approvedDefinitionRevision" to e.approvedDefinitionRevision?.value?.toString(),"createdAt" to e.createdAt.toString(),"definition" to definitionValue(e.definition)))
    private fun text(node: JsonNode,key: String): String { require(node.path(key).isTextual); return node[key].textValue() }
    private fun revision(raw: String): CalendarRevision { require(raw.matches(Regex("0|[1-9][0-9]*"))); return requireNotNull(CalendarRevision.fromWire(raw.toLongOrNull())) }
    private fun definition(node: JsonNode): CalendarDefinition {
        require(node.isObject && node.size()==14)
        val rules=node["reminders"]; require(rules.isArray)
        val reminders=rules.map { rule -> require(rule.isObject && rule.size()==3 && rule.path("offsetSeconds").isIntegralNumber && rule.path("offsetSeconds").canConvertToLong()); requireNotNull(CalendarReminderRule.create(requireNotNull(CalendarRuleId.fromWire(UUID.fromString(text(rule,"id")))),CalendarReminderChannel.fromWire(text(rule,"channel")),rule["offsetSeconds"].longValue())) }
        val zone=text(node,"timeZone")
        val start=requireNotNull(CalendarTime.fromWire(text(node,"startLocal"),zone,text(node,"startOffset")))
        val end=requireNotNull(CalendarTime.fromWire(text(node,"endLocal"),zone,text(node,"endOffset")))
        require(start.instant==Instant.parse(text(node,"startAt")) && end.instant==Instant.parse(text(node,"endAt")))
        val result=requireNotNull(CalendarDefinition.create(revision(text(node,"revision")),requireNotNull(CalendarTitle.fromWire(text(node,"title"))),requireNotNull(CalendarDescription.fromWire(text(node,"description"))),start,end,
            CalendarAudience.fromWire(text(node,"audience")),if(node.path("campaign").isNull) null else requireNotNull(CalendarCampaignReference.fromWire(text(node,"campaign"))),reminders,hasher))
        require(result.hash.value==text(node,"hash")); return result
    }
    fun definition(raw: String): CalendarDefinition=definition(mapper.readTree(raw))
    fun event(raw: String): CalendarEvent {
        val node=mapper.readTree(raw); require(node.isObject && node.size()==6)
        return requireNotNull(CalendarEvent.restore(requireNotNull(CalendarEventId.fromWire(UUID.fromString(text(node,"id")))),revision(text(node,"revision")),CalendarLifecycle.fromWire(text(node,"lifecycle")),definition(node["definition"]),
            if(node.path("approvedDefinitionRevision").isNull) null else revision(text(node,"approvedDefinitionRevision")),Instant.parse(text(node,"createdAt"))))
    }
}
