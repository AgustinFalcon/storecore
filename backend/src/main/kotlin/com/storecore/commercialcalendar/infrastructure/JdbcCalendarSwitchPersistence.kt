package com.storecore.commercialcalendar.infrastructure

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import java.sql.Timestamp
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

class JdbcCalendarSwitchPersistence(
    private val jdbc: JdbcTemplate,
    private val transactions: TransactionTemplate,
    private val mapper: ObjectMapper,
    private val clock: CalendarClock,
    private val hasher: CalendarHasher,
    private val capabilities: CapabilityDecisionPort,
): CalendarSwitchPersistencePort {
    private fun <T:Any> tx(block:()->T):T=transactions.execute { block() }!!
    private fun authorized(actor: InternalUserPrincipal)=InternalRole.ADMIN in actor.roles && jdbc.queryForObject("SELECT calendar_admin_authorized(?,?)",Boolean::class.java,actor.userId,actor.sessionId)==true
    private fun lock(id: CalendarCommandId) { val h=hasher.hash(listOf("calendar-command-lock-v1",id.value.toString())).value; jdbc.query("SELECT pg_advisory_xact_lock(?)",{_,_->Unit},java.lang.Long.parseUnsignedLong(h.take(16),16)) }
    private fun hash(actor:Long,r:CalendarSwitchCommandRequest)=requireNotNull(CalendarCommandPayloadHash.fromWire(hasher.hash(listOf("calendar-reminder-switch-v1",actor.toString(),r.operation.wire,r.expectedRevision.value.toString(),r.owner.value,r.reason.value,r.expiresAt.toString(),r.removalTicket.value,r.affectedAction.wire)).value))

    override fun change(actor: InternalUserPrincipal,request: CalendarSwitchCommandRequest): CalendarSwitchPersistenceResult=tx {
        if(!authorized(actor)) return@tx CalendarSwitchPersistenceResult.Unauthorized
        if(request.operation==CalendarSwitchOperation.UNKNOWN || request.affectedAction!=CalendarSwitchAction.EMIT_IN_APP_CAMPAIGN_REMINDER || request.expiresAt.nano!=0) return@tx CalendarSwitchPersistenceResult.Invalid
        lock(request.commandId)
        if(!authorized(actor)) return@tx CalendarSwitchPersistenceResult.Unauthorized
        val payload=hash(actor.userId,request)
        binding(request.commandId)?.let { return@tx if(it["family"]=="REMINDER_SWITCH" && (it["actor_id"] as Number).toLong()==actor.userId && it["payload_hash"]==payload.value) load(request.commandId) else CalendarSwitchPersistenceResult.IdempotencyConflict }
        val before=read(true) ?: return@tx CalendarSwitchPersistenceResult.Missing
        val capabilityActive=request.operation!=CalendarSwitchOperation.ENABLE || runCatching { capabilities.decide("COMMERCIAL_CALENDAR",request.affectedAction.wire,CapabilityActor.Internal(actor)) }.isSuccess
        if(!authorized(actor)) return@tx CalendarSwitchPersistenceResult.Unauthorized
        val now=clock.now().truncatedTo(ChronoUnit.SECONDS)
        val metadata=CalendarSwitchMetadata.forNewCommand(request.owner,request.reason,now,request.expiresAt,request.removalTicket,request.affectedAction,now) ?: return@tx CalendarSwitchPersistenceResult.Invalid
        val decision=CalendarSwitchDecision.apply(before,request.expectedRevision,request.operation,metadata,capabilityActive,now)
        val requestedJson=metadata(metadata); val beforeJson=snapshot(before,now); val afterJson=snapshot(decision.snapshot,now)
        jdbc.query(
            """SELECT calendar_record_switch_command(?::bigint,?::uuid,?::uuid,?::text,?::bigint,?::jsonb,?::text,?::text,?::jsonb,?::jsonb,?::timestamptz)""",
            { _: java.sql.ResultSet -> Unit },
            actor.userId,actor.sessionId,request.commandId.value,request.operation.wire,request.expectedRevision.value,requestedJson,payload.value,decision.outcome.wire,beforeJson,afterJson,Timestamp.from(now),
        )
        load(request.commandId)
    }
    override fun receipt(actor: InternalUserPrincipal,commandId: CalendarCommandId): CalendarSwitchPersistenceResult=tx {
        if(!authorized(actor)) return@tx CalendarSwitchPersistenceResult.Unauthorized
        val binding=binding(commandId) ?: return@tx CalendarSwitchPersistenceResult.Missing
        if(binding["family"]!="REMINDER_SWITCH" || (binding["actor_id"] as? Number)?.toLong()!=actor.userId) return@tx CalendarSwitchPersistenceResult.Missing
        load(commandId).takeIf { authorized(actor) } ?: CalendarSwitchPersistenceResult.Unauthorized
    }
    override fun audit(actor: InternalUserPrincipal,paging: CalendarPageRequest): CalendarQueryResult<CalendarPage<CalendarSwitchReceipt>> = tx {
        if(!authorized(actor)) return@tx CalendarQueryResult.Unauthorized
        val rows=jdbc.queryForList("""WITH filtered AS MATERIALIZED (
            SELECT r.*,b.family,b.actor_id AS binding_actor,b.payload_hash AS binding_hash
            FROM calendar_switch_command_receipts r JOIN calendar_switch_audit a USING(command_id) JOIN calendar_command_bindings b USING(command_id)),
            selected AS (SELECT * FROM filtered ORDER BY recorded_at,command_id LIMIT ? OFFSET ?)
            SELECT (SELECT count(*) FROM filtered) AS total,selected.* FROM (SELECT 1) singleton LEFT JOIN selected ON TRUE ORDER BY selected.recorded_at,selected.command_id""",paging.size,paging.offset)
        val receipts=rows.mapNotNull { if(it["command_id"]==null) null else decode(it) }
        if(!authorized(actor)) CalendarQueryResult.Unauthorized else CalendarQueryResult.Found(CalendarPage(receipts,(rows.first()["total"] as Number).toLong(),paging))
    }
    private fun binding(id:CalendarCommandId)=jdbc.queryForList("SELECT family,actor_id,event_id,payload_hash FROM calendar_command_bindings WHERE command_id=?",id.value).singleOrNull()
    private fun read(locked:Boolean=false):CalendarSwitchSnapshot?=jdbc.queryForList(if(locked) "SELECT * FROM calendar_lock_reminder_switch()" else "SELECT * FROM calendar_reminder_switch WHERE id=1").singleOrNull()?.let { row ->
        val revision=requireNotNull(CalendarRevision.fromWire((row["revision"] as Number).toLong())); val state=CalendarSwitchState.fromWire(row["state"] as String)
        val metadata=if(revision==CalendarRevision.Zero) null else CalendarSwitchMetadata.restore(requireNotNull(CalendarSwitchOwner.fromWire(row["owner"] as? String)),requireNotNull(CalendarReason.fromWire(row["reason"] as? String)),(row["created_at"] as Timestamp).toInstant(),(row["expires_at"] as Timestamp).toInstant(),requireNotNull(CalendarRemovalTicket.fromWire(row["removal_ticket"] as? String)),CalendarSwitchAction.fromWire(row["affected_action"] as? String))
        CalendarSwitchSnapshot.restore(state,revision,metadata)
    }
    private fun load(id:CalendarCommandId):CalendarSwitchPersistenceResult {
        val row=jdbc.queryForList("""SELECT r.*,b.family,b.actor_id AS binding_actor,b.payload_hash AS binding_hash FROM calendar_switch_command_receipts r JOIN calendar_command_bindings b USING(command_id) WHERE r.command_id=?""",id.value).singleOrNull() ?: return CalendarSwitchPersistenceResult.Unknown
        return CalendarSwitchPersistenceResult.Recorded(decode(row))
    }
    private fun decode(row:Map<String,Any?>):CalendarSwitchReceipt {
        require(row["family"]=="REMINDER_SWITCH" && row["payload_hash"]==row["binding_hash"] && (row["actor_id"] as Number).toLong()==(row["binding_actor"] as Number).toLong())
        val recorded=(row["recorded_at"] as Timestamp).toInstant(); val requested=metadata(mapper.readTree(row["requested_metadata"].toString()))
        return CalendarSwitchReceipt(requireNotNull(CalendarCommandId.fromWire(row["command_id"] as UUID)),(row["actor_id"] as Number).toLong(),CalendarSwitchOperation.fromWire(row["operation"] as String),CalendarOutcome.fromWire(row["outcome"] as String),requireNotNull(CalendarRevision.fromWire((row["expected_revision"] as Number).toLong())),requested,snapshot(mapper.readTree(row["before_snapshot"].toString()),recorded),snapshot(mapper.readTree(row["after_snapshot"].toString()),recorded),recorded)
    }
    private fun metadata(value:CalendarSwitchMetadata)=mapper.writeValueAsString(linkedMapOf("owner" to value.owner.value,"reason" to value.reason.value,"createdAt" to value.createdAt.toString(),"expiresAt" to value.expiresAt.toString(),"removalTicket" to value.removalTicket.value,"affectedAction" to value.affectedAction.wire))
    private fun metadata(node:JsonNode)=requireNotNull(CalendarSwitchMetadata.restore(requireNotNull(CalendarSwitchOwner.fromWire(node.path("owner").textValue())),requireNotNull(CalendarReason.fromWire(node.path("reason").textValue())),Instant.parse(node.path("createdAt").textValue()),Instant.parse(node.path("expiresAt").textValue()),requireNotNull(CalendarRemovalTicket.fromWire(node.path("removalTicket").textValue())),CalendarSwitchAction.fromWire(node.path("affectedAction").textValue())))
    private fun snapshot(value:CalendarSwitchSnapshot,at:Instant)=mapper.writeValueAsString(linkedMapOf("configuredState" to value.configuredState.wire,"effectivity" to value.effectivity(at).wire,"revision" to value.revision.value.toString(),"metadata" to value.metadata?.let { mapper.readTree(metadata(it)) }))
    private fun snapshot(node:JsonNode,at:Instant):CalendarSwitchSnapshot { val revision=requireNotNull(CalendarRevision.fromWire(node.path("revision").asText().toLongOrNull())); val meta=node.path("metadata").takeUnless { it.isNull }?.let(::metadata); val value=requireNotNull(CalendarSwitchSnapshot.restore(CalendarSwitchState.fromWire(node.path("configuredState").textValue()),revision,meta)); require(value.effectivity(at)==CalendarSwitchEffectivity.fromWire(node.path("effectivity").textValue())); return value }
}
