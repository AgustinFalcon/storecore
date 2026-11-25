package com.storecore.commercialcalendar.infrastructure

import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.DeserializationFeature
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import org.springframework.util.MultiValueMap
import java.time.Instant
import java.util.UUID

internal class InvalidCalendarRequest: RuntimeException()
internal class CalendarUnsupportedMedia: RuntimeException()
internal class CalendarUnavailable: RuntimeException()

/** The sole public wire boundary; nested fields are exact and finite values fail closed. */
internal class CalendarHttpTranslator(mapper: ObjectMapper,private val hasher: CalendarHasher) {
    private val json=mapper.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION).enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
    companion object { const val MAX_BYTES=32768; const val SWITCH_MAX_BYTES=8192 }
    fun uuid(raw: String?): UUID=runCatching { UUID.fromString(raw) }.getOrNull()?.takeIf { it!=UUID(0,0) && it.toString()==raw } ?: throw InvalidCalendarRequest()
    fun eventId(raw: String)=requireNotNull(CalendarEventId.fromWire(uuid(raw)))
    fun commandId(raw: String?)=requireNotNull(CalendarCommandId.fromWire(uuid(raw)))
    private fun revision(raw: String): CalendarRevision {
        if(raw.length>19 || !raw.matches(Regex("0|[1-9][0-9]*"))) throw InvalidCalendarRequest()
        return CalendarRevision.fromWire(raw.toLongOrNull()) ?: throw InvalidCalendarRequest()
    }
    private fun text(node: JsonNode,key: String): String { if(!node.path(key).isTextual) throw InvalidCalendarRequest(); return node[key].textValue() }
    private fun exact(node: JsonNode,fields: Set<String>) { if(!node.isObject || node.fieldNames().asSequence().toSet()!=fields) throw InvalidCalendarRequest() }
    private fun parse(raw: ByteArray,maxBytes: Int=MAX_BYTES): JsonNode {
        if(raw.size>maxBytes) throw InvalidCalendarRequest()
        val text=raw.toString(Charsets.UTF_8)
        if(!text.toByteArray(Charsets.UTF_8).contentEquals(raw)) throw InvalidCalendarRequest()
        return runCatching { json.readTree(text) }.getOrNull() ?: throw InvalidCalendarRequest()
    }
    private fun time(node: JsonNode): CalendarTime {
        exact(node,setOf("localDateTime","timeZone","offset"))
        return CalendarTime.fromWire(text(node,"localDateTime"),text(node,"timeZone"),text(node,"offset")) ?: throw InvalidCalendarRequest()
    }
    private fun definition(node: JsonNode): CalendarDefinition {
        exact(node,setOf("definitionRevision","title","description","start","end","audience","campaignReference","reminders"))
        val revision=revision(text(node,"definitionRevision"))
        val reminders=node["reminders"]
        if(!reminders.isArray || reminders.size()>5) throw InvalidCalendarRequest()
        val rules=reminders.map { rule ->
            exact(rule,setOf("id","channel","offsetSeconds"))
            if(!rule.path("offsetSeconds").isIntegralNumber || !rule.path("offsetSeconds").canConvertToLong()) throw InvalidCalendarRequest()
            CalendarReminderRule.create(requireNotNull(CalendarRuleId.fromWire(uuid(text(rule,"id")))),CalendarReminderChannel.fromWire(text(rule,"channel")),rule["offsetSeconds"].longValue()) ?: throw InvalidCalendarRequest()
        }
        val campaign=if(node["campaignReference"].isNull) null else CalendarCampaignReference.fromWire(text(node,"campaignReference")) ?: throw InvalidCalendarRequest()
        return CalendarDefinition.create(revision,CalendarTitle.fromWire(text(node,"title")) ?: throw InvalidCalendarRequest(),CalendarDescription.fromWire(text(node,"description")) ?: throw InvalidCalendarRequest(),
            time(node["start"]),time(node["end"]),CalendarAudience.fromWire(text(node,"audience")),campaign,rules,hasher) ?: throw InvalidCalendarRequest()
    }
    fun create(key: String?,raw: ByteArray): CalendarCreateRequest {
        val node=parse(raw); exact(node,setOf("definition"))
        val value=definition(node["definition"])
        if(value.revision!=CalendarRevision.Zero) throw InvalidCalendarRequest()
        return CalendarCreateRequest(commandId(key),value)
    }
    fun preflight(event: String,key: String?,raw: ByteArray): CalendarPreflightRequest {
        val node=parse(raw); exact(node,setOf("expectedRevision"))
        return CalendarPreflightRequest(commandId(key),eventId(event),revision(text(node,"expectedRevision")))
    }
    fun change(event: String,key: String?,raw: ByteArray): CalendarChangeRequest {
        val node=parse(raw); val operation=CalendarOperation.fromWire(text(node,"operation")); val step=CalendarStep.fromOperation(operation)
        if(step==CalendarStep.Unknown || operation.system) throw InvalidCalendarRequest()
        val common=setOf("operation","expectedRevision","reason")
        val extra=when(step) { CalendarStep.Edit -> setOf("definition"); CalendarStep.Schedule -> setOf("preflightId"); else -> emptySet() }
        exact(node,common+extra)
        val expected=revision(text(node,"expectedRevision"))
        return CalendarChangeRequest(commandId(key),eventId(event),expected,step,CalendarReason.fromWire(text(node,"reason")) ?: throw InvalidCalendarRequest(),
            if(step==CalendarStep.Edit) definition(node["definition"]) else null,
            if(step==CalendarStep.Schedule) CalendarPreflightId.fromWire(uuid(text(node,"preflightId"))) else null)
    }
    fun switchCommand(key: String?,raw: ByteArray): CalendarSwitchCommandRequest {
        val node=parse(raw,SWITCH_MAX_BYTES)
        exact(node,setOf("operation","expectedRevision","owner","reason","expiresAt","removalTicket","affectedAction"))
        val operation=CalendarSwitchOperation.fromWire(text(node,"operation"))
        val action=CalendarSwitchAction.fromWire(text(node,"affectedAction"))
        if(operation==CalendarSwitchOperation.UNKNOWN || action!=CalendarSwitchAction.EMIT_IN_APP_CAMPAIGN_REMINDER) throw InvalidCalendarRequest()
        val expiresRaw=text(node,"expiresAt")
        val expires=runCatching { Instant.parse(expiresRaw) }.getOrNull()
            ?.takeIf { it.nano==0 && it.toString()==expiresRaw } ?: throw InvalidCalendarRequest()
        return CalendarSwitchCommandRequest(
            commandId(key),revision(text(node,"expectedRevision")),operation,
            CalendarSwitchOwner.fromWire(text(node,"owner")) ?: throw InvalidCalendarRequest(),
            CalendarReason.fromWire(text(node,"reason")) ?: throw InvalidCalendarRequest(),expires,
            CalendarRemovalTicket.fromWire(text(node,"removalTicket")) ?: throw InvalidCalendarRequest(),action,
        )
    }
    fun paging(params: MultiValueMap<String,String>,additional: Set<String> = emptySet()): CalendarPageRequest {
        if(params.keys.any { it !in additional+setOf("page","size") } || params.values.any { it.size!=1 }) throw InvalidCalendarRequest()
        fun integer(key: String,default: Int): Int {
            val raw=params.getFirst(key) ?: return default
            if(!raw.matches(Regex("0|[1-9][0-9]*"))) throw InvalidCalendarRequest()
            return raw.toIntOrNull() ?: throw InvalidCalendarRequest()
        }
        return CalendarPageRequest.create(integer("page",0),integer("size",25)) ?: throw InvalidCalendarRequest()
    }
    private fun instant(raw: String?): Instant = runCatching { Instant.parse(raw) }.getOrNull() ?: throw InvalidCalendarRequest()
    fun query(params: MultiValueMap<String,String>): CalendarEventQuery {
        val paging=paging(params,setOf("from","to","lifecycle","audience"))
        return CalendarEventQuery.create(instant(params.getFirst("from")),instant(params.getFirst("to")),params.getFirst("lifecycle")?.let(CalendarLifecycle::fromWire),params.getFirst("audience")?.let(CalendarAudience::fromWire),paging) ?: throw InvalidCalendarRequest()
    }
}

data class CalendarTimeDto(val localDateTime: String,val timeZone: String,val offset: String,val instant: String)
data class CalendarReminderRuleDto(val id: String,val channel: String,val offsetSeconds: Long)
data class CalendarDefinitionDto(val definitionRevision: String,val hash: String,val title: String,val description: String,val start: CalendarTimeDto,val end: CalendarTimeDto,val audience: String,val campaignReference: String?,val reminders: List<CalendarReminderRuleDto>)
data class CalendarEventDto(val id: String,val revision: String,val lifecycle: String,val approvedDefinitionRevision: String?,val createdAt: String,val definition: CalendarDefinitionDto)
data class CalendarPageDto<T>(val items: List<T>,val total: Long,val page: Int,val size: Int,val hasMore: Boolean)
data class CalendarReceiptDto(val commandId: String,val eventId: String,val actorId: String?,val operation: String,val expectedRevision: String?,val reason: String?,val outcome: String,val before: CalendarEventDto?,val after: CalendarEventDto,val recordedAt: String)
data class CalendarPreflightDto(val id: String,val eventId: String,val revision: String,val definitionRevision: String,val definitionHash: String,val issues: List<String>,val checkedAt: String,val expiresAt: String)
data class CalendarPreflightResultDto(val outcome: String,val preflight: CalendarPreflightDto?,val event: CalendarEventDto)
data class CalendarSwitchMetadataDto(val owner: String,val reason: String,val createdAt: String,val expiresAt: String,val removalTicket: String,val affectedAction: String)
data class CalendarSwitchSnapshotDto(val configuredState: String,val effectivity: String,val revision: String,val metadata: CalendarSwitchMetadataDto?)
data class CalendarReminderSwitchDto(val configuredState: String,val effectivity: String,val revision: String,val readiness: String,val metadata: CalendarSwitchMetadataDto?)
data class CalendarSwitchReceiptDto(val commandId: String,val actorId: String,val operation: String,val outcome: String,val expectedRevision: String,val requestedMetadata: CalendarSwitchMetadataDto,val before: CalendarSwitchSnapshotDto,val after: CalendarSwitchSnapshotDto,val recordedAt: String)
internal object CalendarHttpMapper {
    private fun time(value: CalendarTime)=CalendarTimeDto(value.localDateTime.toString().let { if(it.length==16) "$it:00" else it },value.timeZone,value.offset.id,value.instant.toString())
    fun event(value: CalendarEvent): CalendarEventDto {
        val d=value.definition
        return CalendarEventDto(value.id.value.toString(),value.revision.value.toString(),value.lifecycle.wire,value.approvedDefinitionRevision?.value?.toString(),value.createdAt.toString(),
            CalendarDefinitionDto(d.revision.value.toString(),d.hash.value,d.title.value,d.description.value,time(d.start),time(d.end),d.audience.wire,d.campaign?.value,d.reminders.map { CalendarReminderRuleDto(it.id.value.toString(),it.channel.wire,it.offsetSeconds) }))
    }
    fun receipt(value: CalendarReceipt)=CalendarReceiptDto(value.commandId.value.toString(),value.eventId.value.toString(),value.actorId?.toString(),value.operation.wire,value.expectedRevision?.value?.toString(),value.reason?.value,value.outcome.wire,value.before?.let(::event),event(value.after),value.recordedAt.toString())
    fun preflight(value: CalendarPreflightResult.Recorded)=CalendarPreflightResultDto(value.outcome.wire,value.preflight?.let { CalendarPreflightDto(it.id.value.toString(),it.eventId.value.toString(),it.revision.value.toString(),it.definitionRevision.value.toString(),it.definitionHash.value,it.issues.map { issue -> issue.wire }.sorted(),it.checkedAt.toString(),it.expiresAt.toString()) },event(value.event))
    private fun switchMetadata(value: CalendarSwitchMetadata)=CalendarSwitchMetadataDto(value.owner.value,value.reason.value,value.createdAt.toString(),value.expiresAt.toString(),value.removalTicket.value,value.affectedAction.wire)
    private fun switchSnapshot(value: CalendarSwitchSnapshot,at: Instant)=CalendarSwitchSnapshotDto(value.configuredState.wire,value.effectivity(at).wire,value.revision.value.toString(),value.metadata?.let(::switchMetadata))
    fun switchDiagnostic(value: CalendarReminderSwitch)=CalendarReminderSwitchDto(value.state.wire,value.effectivity.wire,value.revision.value.toString(),CalendarReminderReadiness.UNAVAILABLE.wire,value.metadata?.let(::switchMetadata))
    fun switchReceipt(value: CalendarSwitchReceipt)=CalendarSwitchReceiptDto(value.commandId.value.toString(),value.actorId.toString(),value.operation.wire,value.outcome.wire,value.expectedRevision.value.toString(),switchMetadata(value.requestedMetadata),switchSnapshot(value.before,value.recordedAt),switchSnapshot(value.after,value.recordedAt),value.recordedAt.toString())
    fun <T,R> page(value: CalendarPage<T>,map: (T)->R)=CalendarPageDto(value.items.map(map),value.total,value.paging.page,value.paging.size,value.hasMore)
}
