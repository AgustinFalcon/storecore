package com.storecore.commercialcalendar.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

/** Explicitly constructed persistence adapter. PCC-007A installs no bean, endpoint or background task. */
class JdbcCalendarPersistence(private val jdbc: JdbcTemplate,private val transactions: TransactionTemplate,private val mapper: ObjectMapper,
    private val clock: CalendarClock,private val ids: CalendarIds,private val hasher: CalendarHasher): CalendarPersistencePort,CalendarSystemPersistencePort {
    private val codec=CalendarSnapshotCodec(mapper,hasher)
    private fun <T: Any> tx(action: () -> T): T=transactions.execute { action() }!!
    private fun authorized(actor: InternalUserPrincipal)=InternalRole.ADMIN in actor.roles && jdbc.queryForObject("SELECT calendar_admin_authorized(?,?)",Boolean::class.java,actor.userId,actor.sessionId)==true
    private fun lock(id: CalendarCommandId) {
        val hash=hasher.hash(listOf("calendar-command-lock-v1",id.value.toString())).value
        jdbc.query("SELECT pg_advisory_xact_lock(?)",{ _,_ -> Unit },java.lang.Long.parseUnsignedLong(hash.take(16),16))
    }
    private fun payload(fields: List<String>)=requireNotNull(CalendarCommandPayloadHash.fromWire(hasher.hash(fields).value))
    private fun binding(id: CalendarCommandId)=jdbc.queryForList("SELECT * FROM calendar_command_bindings WHERE command_id=?",id.value).singleOrNull()
    private fun sameBinding(row: Map<String,Any>,actor: Long?,event: CalendarEventId?,family: CalendarCommandFamily,hash: CalendarCommandPayloadHash)=
        (row["actor_id"] as? Number)?.toLong()==actor && (event==null || row["event_id"]==event.value) && CalendarCommandFamily.fromWire(row["family"] as? String)==family && row["payload_hash"]==hash.value
    private fun bind(id: CalendarCommandId,actor: Long?,event: CalendarEventId,family: CalendarCommandFamily,hash: CalendarCommandPayloadHash) {
        jdbc.update("INSERT INTO calendar_command_bindings(command_id,family,actor_id,event_id,payload_hash) VALUES(?,?,?,?,?)",id.value,family.wire,actor,event.value,hash.value)
    }
    private fun read(id: CalendarEventId,locked: Boolean=false): CalendarEvent?=jdbc.query("SELECT snapshot::text FROM calendar_events WHERE id=?"+if(locked) " FOR UPDATE" else "",{ rs,_ -> codec.event(rs.getString(1)) },id.value).singleOrNull()
    override fun find(eventId: CalendarEventId)=read(eventId)
    override fun create(actor: InternalUserPrincipal,request: CalendarCreateRequest): CalendarPersistenceResult=tx {
        if(!authorized(actor)) return@tx CalendarPersistenceResult.Unauthorized
        if(request.definition.revision!=CalendarRevision.Zero) return@tx CalendarPersistenceResult.Unknown
        lock(request.commandId)
        if(!authorized(actor)) return@tx CalendarPersistenceResult.Unauthorized
        val hash=payload(listOf("calendar-create-v1",actor.userId.toString(),request.definition.hash.value))
        binding(request.commandId)?.let { row ->
            return@tx if(sameBinding(row,actor.userId,null,CalendarCommandFamily.EVENT,hash)) loadReceipt(request.commandId) else CalendarPersistenceResult.IdempotencyConflict
        }
        val now=clock.now(); val event=requireNotNull(CalendarEvent.draft(ids.event(),request.definition,now))
        jdbc.update("INSERT INTO calendar_events(id,revision,definition_revision,lifecycle,snapshot) VALUES(?,0,0,?,?::jsonb)",event.id.value,event.lifecycle.wire,codec.event(event))
        writeDefinition(event)
        bind(request.commandId,actor.userId,event.id,CalendarCommandFamily.EVENT,hash)
        val receipt=CalendarReceipt(request.commandId,event.id,actor.userId,CalendarOperation.CREATE,hash,CalendarOutcome.APPLIED,null,event,now,null,null)
        writeReceipt(receipt)
        CalendarPersistenceResult.Recorded(receipt)
    }
    override fun change(actor: InternalUserPrincipal,request: CalendarChangeRequest): CalendarPersistenceResult=tx {
        if(!authorized(actor)) return@tx CalendarPersistenceResult.Unauthorized
        if(request.step==CalendarStep.Unknown || request.step.operation.system || !validShape(request)) return@tx CalendarPersistenceResult.Unknown
        lock(request.commandId)
        if(!authorized(actor)) return@tx CalendarPersistenceResult.Unauthorized
        val hash=commandHash(actor.userId,request)
        binding(request.commandId)?.let { row -> return@tx if(sameBinding(row,actor.userId,request.eventId,CalendarCommandFamily.EVENT,hash)) loadReceipt(request.commandId) else CalendarPersistenceResult.IdempotencyConflict }
        val before=read(request.eventId,true) ?: return@tx CalendarPersistenceResult.Missing
        if(!authorized(actor)) return@tx CalendarPersistenceResult.Unauthorized
        val preflight=request.preflightId?.let { loadPreflight(it,true) }
        if(!authorized(actor)) return@tx CalendarPersistenceResult.Unauthorized
        val now=clock.now()
        val decision=CalendarDecision.apply(before,request.expectedRevision,request.step,now,preflight,request.definition)
        record(actor.userId,request,before,decision,hash,now)
    }
    private fun validShape(request: CalendarChangeRequest)=
        (request.step==CalendarStep.Edit)==(request.definition!=null) && (request.step==CalendarStep.Schedule || request.preflightId==null)
    private fun commandHash(actor: Long?,r: CalendarChangeRequest)=payload(listOf("calendar-command-v1",actor?.toString() ?: "SYSTEM",r.eventId.value.toString(),r.step.operation.wire,r.expectedRevision.value.toString(),r.reason.value,r.definition?.hash?.value ?: "",r.preflightId?.value?.toString() ?: ""))
    private fun record(actor: Long?,request: CalendarChangeRequest,before: CalendarEvent,decision: CalendarDecision,hash: CalendarCommandPayloadHash,now: Instant): CalendarPersistenceResult {
        if(decision.outcome==CalendarOutcome.UNKNOWN) return CalendarPersistenceResult.Unknown
        if(decision.outcome==CalendarOutcome.APPLIED) {
            val after=decision.event
            check(jdbc.update("UPDATE calendar_events SET revision=?,definition_revision=?,lifecycle=?,snapshot=?::jsonb WHERE id=? AND revision=?",after.revision.value,after.definition.revision.value,after.lifecycle.wire,codec.event(after),after.id.value,before.revision.value)==1)
            if(request.step==CalendarStep.Edit) writeDefinition(after)
            if(request.step==CalendarStep.Schedule) after.definition.reminders.forEach { rule ->
                val occurrence=requireNotNull(CalendarReminderOccurrence.pending(ids.occurrence(),after,rule))
                jdbc.update("""INSERT INTO calendar_reminder_occurrences(id,event_id,approved_definition_revision,rule_id,scheduled_at,state)
                    VALUES(?,?,?,?,?,'PENDING')""",occurrence.id.value,occurrence.eventId.value,occurrence.approvedDefinitionRevision.value,occurrence.ruleId.value,Timestamp.from(occurrence.scheduledAt))
            }
        }
        bind(request.commandId,actor,before.id,CalendarCommandFamily.EVENT,hash)
        val receipt=CalendarReceipt(request.commandId,before.id,actor,request.step.operation,hash,decision.outcome,before,decision.event,now,request.expectedRevision,request.reason)
        writeReceipt(receipt)
        return CalendarPersistenceResult.Recorded(receipt)
    }
    override fun advance(eventId: CalendarEventId,expectedRevision: CalendarRevision,step: CalendarStep): CalendarPersistenceResult=tx {
        if(!step.operation.system) return@tx CalendarPersistenceResult.Unauthorized
        // Read only to derive identity, then follow the same command -> event lock order as USER commands.
        val observed=read(eventId) ?: return@tx CalendarPersistenceResult.Missing
        if(observed.approvedDefinitionRevision==null) return@tx CalendarPersistenceResult.Unauthorized
        val boundary=if(step==CalendarStep.Activate) observed.definition.start.instant else observed.definition.end.instant
        val request=CalendarChangeRequest(hasher.systemCommand(eventId,expectedRevision,step.operation,boundary),eventId,expectedRevision,step,requireNotNull(CalendarReason.fromWire("Authoritative calendar boundary")))
        lock(request.commandId)
        val hash=commandHash(null,request)
        binding(request.commandId)?.let { row -> return@tx if(sameBinding(row,null,eventId,CalendarCommandFamily.EVENT,hash)) loadReceipt(request.commandId) else CalendarPersistenceResult.IdempotencyConflict }
        val before=read(eventId,true) ?: return@tx CalendarPersistenceResult.Missing
        val now=clock.now()
        record(null,request,before,CalendarDecision.apply(before,expectedRevision,step,now),hash,now)
    }
    override fun preflight(actor: InternalUserPrincipal,request: CalendarPreflightRequest): CalendarPreflightResult=tx {
        if(!authorized(actor)) return@tx CalendarPreflightResult.Unauthorized
        lock(request.commandId)
        if(!authorized(actor)) return@tx CalendarPreflightResult.Unauthorized
        val hash=payload(listOf("calendar-preflight-v1",actor.userId.toString(),request.eventId.value.toString(),request.expectedRevision.value.toString()))
        binding(request.commandId)?.let { row ->
            if(!sameBinding(row,actor.userId,request.eventId,CalendarCommandFamily.PREFLIGHT,hash)) return@tx CalendarPreflightResult.IdempotencyConflict
            val stored=jdbc.queryForList("SELECT * FROM calendar_preflight_requests WHERE command_id=?",request.commandId.value).singleOrNull() ?: return@tx CalendarPreflightResult.Unknown
            val outcome=CalendarOutcome.fromWire(stored["outcome"] as String)
            val snapshot=codec.event(stored["event_snapshot"].toString())
            return@tx CalendarPreflightResult.Recorded(outcome,(stored["preflight_id"] as? UUID)?.let { loadPreflight(requireNotNull(CalendarPreflightId.fromWire(it))) },snapshot)
        }
        val event=read(request.eventId,true) ?: return@tx CalendarPreflightResult.Missing
        if(!authorized(actor)) return@tx CalendarPreflightResult.Unauthorized
        val outcome=if(event.revision!=request.expectedRevision) CalendarOutcome.REVISION_CONFLICT else if(event.lifecycle!=CalendarLifecycle.DRAFT) CalendarOutcome.INVALID_TRANSITION else CalendarOutcome.APPLIED
        val preflight=if(outcome==CalendarOutcome.APPLIED) CalendarPreflight.check(ids.preflight(),event,clock.now()) else null
        if(preflight!=null) jdbc.update("""INSERT INTO calendar_preflights(id,event_id,revision,definition_revision,definition_hash,issues,checked_at,expires_at)
            VALUES(?,?,?,?,?,?::jsonb,?,?)""",preflight.id.value,event.id.value,event.revision.value,event.definition.revision.value,event.definition.hash.value,mapper.writeValueAsString(preflight.issues.map { it.wire }),Timestamp.from(preflight.checkedAt),Timestamp.from(preflight.expiresAt))
        bind(request.commandId,actor.userId,event.id,CalendarCommandFamily.PREFLIGHT,hash)
        jdbc.update("INSERT INTO calendar_preflight_requests(command_id,actor_id,event_id,expected_revision,outcome,preflight_id,event_snapshot) VALUES(?,?,?,?,?,?,?::jsonb)",request.commandId.value,actor.userId,event.id.value,request.expectedRevision.value,outcome.wire,preflight?.id?.value,codec.event(event))
        CalendarPreflightResult.Recorded(outcome,preflight,event)
    }
    private fun loadPreflight(id: CalendarPreflightId,locked: Boolean=false): CalendarPreflight?=jdbc.query(if(locked) "SELECT * FROM calendar_lock_preflight(?)" else "SELECT * FROM calendar_preflights WHERE id=?",{ rs,_ ->
        val issues=mapper.readTree(rs.getString("issues")).map { CalendarPreflightIssue.fromWire(it.textValue()) }.toSet(); require(CalendarPreflightIssue.UNKNOWN !in issues)
        CalendarPreflight(id,requireNotNull(CalendarEventId.fromWire(rs.getObject("event_id",UUID::class.java))),requireNotNull(CalendarRevision.fromWire(rs.getLong("revision"))),requireNotNull(CalendarRevision.fromWire(rs.getLong("definition_revision"))),requireNotNull(CalendarHash.fromWire(rs.getString("definition_hash"))),issues,rs.getTimestamp("checked_at").toInstant(),rs.getTimestamp("expires_at").toInstant())
    },id.value).singleOrNull()
    override fun receipt(actor: InternalUserPrincipal,commandId: CalendarCommandId,eventId: CalendarEventId?): CalendarPersistenceResult=tx {
        if(!authorized(actor)) return@tx CalendarPersistenceResult.Unauthorized
        val row=binding(commandId) ?: return@tx CalendarPersistenceResult.Missing
        if((row["actor_id"] as? Number)?.toLong()!=actor.userId || CalendarCommandFamily.fromWire(row["family"] as? String)!=CalendarCommandFamily.EVENT || eventId!=null && row["event_id"]!=eventId.value) return@tx CalendarPersistenceResult.Missing
        loadReceipt(commandId)
    }
    override fun audit(actor: InternalUserPrincipal,eventId: CalendarEventId): List<CalendarReceipt>?=tx {
        if(!authorized(actor)) return@tx emptyList()
        if(read(eventId)==null) return@tx emptyList()
        jdbc.query("""SELECT r.*,b.family AS binding_family,b.actor_id AS binding_actor_id,b.event_id AS binding_event_id,b.payload_hash AS binding_payload_hash
            FROM calendar_command_receipts r JOIN calendar_audit a USING(command_id) JOIN calendar_command_bindings b USING(command_id)
            WHERE r.event_id=? ORDER BY r.recorded_at,r.command_id""",{ rs,_ -> decodeReceipt((1..rs.metaData.columnCount).associate { rs.metaData.getColumnLabel(it) to rs.getObject(it) }) },eventId.value)
    }
    override fun reminderSwitch(): CalendarReminderSwitch {
        val row=jdbc.queryForMap("SELECT state,revision FROM calendar_reminder_switch WHERE id=1")
        val state=CalendarSwitchState.fromWire(row["state"] as String); require(state!=CalendarSwitchState.UNKNOWN)
        return CalendarReminderSwitch(state,requireNotNull(CalendarRevision.fromWire((row["revision"] as Number).toLong())))
    }
    private fun writeDefinition(event: CalendarEvent) {
        val d=event.definition
        jdbc.update("INSERT INTO calendar_definitions(event_id,definition_revision,definition_hash,snapshot) VALUES(?,?,?,?::jsonb)",event.id.value,d.revision.value,d.hash.value,codec.definition(d))
        d.reminders.forEach { rule -> jdbc.update("INSERT INTO calendar_reminder_rules(event_id,definition_revision,rule_id,channel,offset_seconds) VALUES(?,?,?,?,?)",event.id.value,d.revision.value,rule.id.value,rule.channel.wire,rule.offsetSeconds) }
    }
    private fun writeReceipt(r: CalendarReceipt) {
        jdbc.update("""INSERT INTO calendar_command_receipts(command_id,event_id,actor_id,operation,expected_revision,reason,payload_hash,outcome,before_snapshot,after_snapshot,recorded_at)
            VALUES(?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?)""",r.commandId.value,r.eventId.value,r.actorId,r.operation.wire,r.expectedRevision?.value,r.reason?.value,r.payloadHash.value,r.outcome.wire,r.before?.let(codec::event),codec.event(r.after),Timestamp.from(r.recordedAt))
        jdbc.update("INSERT INTO calendar_audit(command_id) VALUES(?)",r.commandId.value)
    }
    private fun loadReceipt(id: CalendarCommandId): CalendarPersistenceResult {
        val row=jdbc.queryForList("""SELECT r.*,b.family AS binding_family,b.actor_id AS binding_actor_id,b.event_id AS binding_event_id,b.payload_hash AS binding_payload_hash
            FROM calendar_command_receipts r JOIN calendar_command_bindings b USING(command_id) WHERE r.command_id=?""",id.value).singleOrNull() ?: return CalendarPersistenceResult.Unknown
        return CalendarPersistenceResult.Recorded(decodeReceipt(row))
    }
    private fun decodeReceipt(row: Map<String,Any?>): CalendarReceipt {
        val operation=CalendarOperation.fromWire(row["operation"] as String); val outcome=CalendarOutcome.fromWire(row["outcome"] as String)
        require(operation!=CalendarOperation.UNKNOWN && outcome!=CalendarOutcome.UNKNOWN)
        val before=row["before_snapshot"]?.let { codec.event(it.toString()) }; val after=codec.event(row["after_snapshot"].toString())
        val eventId=requireNotNull(CalendarEventId.fromWire(row["event_id"] as UUID))
        val actorId=(row["actor_id"] as? Number)?.toLong(); val payloadHash=requireNotNull(CalendarCommandPayloadHash.fromWire(row["payload_hash"] as String))
        require(CalendarCommandFamily.fromWire(row["binding_family"] as? String)==CalendarCommandFamily.EVENT)
        require(actorId==(row["binding_actor_id"] as? Number)?.toLong() && eventId.value==row["binding_event_id"] && payloadHash.value==row["binding_payload_hash"])
        require(after.id==eventId && (before==null || before.id==eventId))
        if(operation==CalendarOperation.CREATE) require(before==null && outcome==CalendarOutcome.APPLIED && after.revision==CalendarRevision.Zero)
        val recordedAt=(row["recorded_at"] as Timestamp).toInstant()
        val expected=(row["expected_revision"] as? Number)?.toLong()?.let { requireNotNull(CalendarRevision.fromWire(it)) }
        if(operation!=CalendarOperation.CREATE) {
            require(before!=null && expected!=null)
            if(outcome==CalendarOutcome.REVISION_CONFLICT) require(before.revision!=expected) else require(before.revision==expected)
            if(outcome==CalendarOutcome.APPLIED) require(after.revision==before.revision.next() && validApplied(operation,before,after,recordedAt))
            else require(codec.event(before)==codec.event(after))
            when(outcome) {
                CalendarOutcome.INVALID_TRANSITION -> require(invalidTransition(operation,before,recordedAt))
                CalendarOutcome.INVALID_DEFINITION -> require(operation==CalendarOperation.EDIT || operation==CalendarOperation.SCHEDULE)
                CalendarOutcome.PREFLIGHT_REQUIRED,CalendarOutcome.PREFLIGHT_EXPIRED,CalendarOutcome.PREFLIGHT_STALE -> require(operation==CalendarOperation.SCHEDULE)
                CalendarOutcome.REVISION_EXHAUSTED -> require(before.revision.next()==null || operation==CalendarOperation.EDIT && before.definition.revision.next()==null)
                else -> Unit
            }
        }
        return CalendarReceipt(requireNotNull(CalendarCommandId.fromWire(row["command_id"] as UUID)),eventId,actorId,operation,
            payloadHash,outcome,before,after,recordedAt,expected,(row["reason"] as? String)?.let { requireNotNull(CalendarReason.fromWire(it)) })
    }
    private fun validApplied(operation: CalendarOperation,before: CalendarEvent,after: CalendarEvent,at: Instant): Boolean {
        if(before.createdAt!=after.createdAt) return false
        val sameDefinition=codec.definition(before.definition)==codec.definition(after.definition)
        return when(operation) {
            CalendarOperation.EDIT -> before.lifecycle==CalendarLifecycle.DRAFT && after.lifecycle==CalendarLifecycle.DRAFT && after.definition.revision==before.definition.revision.next()
            CalendarOperation.SCHEDULE -> sameDefinition && before.lifecycle==CalendarLifecycle.DRAFT && after.lifecycle==CalendarLifecycle.SCHEDULED && after.approvedDefinitionRevision==before.definition.revision
            CalendarOperation.PAUSE -> sameDefinition && before.lifecycle in listOf(CalendarLifecycle.SCHEDULED,CalendarLifecycle.ACTIVE) && after.lifecycle==CalendarLifecycle.PAUSED && after.approvedDefinitionRevision==before.approvedDefinitionRevision
            CalendarOperation.RESUME -> sameDefinition && before.lifecycle==CalendarLifecycle.PAUSED && at<before.definition.end.instant && after.lifecycle==(if(at<before.definition.start.instant) CalendarLifecycle.SCHEDULED else CalendarLifecycle.ACTIVE) && after.approvedDefinitionRevision==before.approvedDefinitionRevision
            CalendarOperation.CANCEL -> sameDefinition && before.lifecycle in listOf(CalendarLifecycle.DRAFT,CalendarLifecycle.SCHEDULED,CalendarLifecycle.ACTIVE,CalendarLifecycle.PAUSED) && after.lifecycle==CalendarLifecycle.CANCELLED && after.approvedDefinitionRevision==before.approvedDefinitionRevision
            CalendarOperation.SYSTEM_ACTIVATE -> sameDefinition && before.lifecycle==CalendarLifecycle.SCHEDULED && at>=before.definition.start.instant && at<before.definition.end.instant && after.lifecycle==CalendarLifecycle.ACTIVE && after.approvedDefinitionRevision==before.approvedDefinitionRevision
            CalendarOperation.SYSTEM_COMPLETE -> sameDefinition && before.lifecycle in listOf(CalendarLifecycle.SCHEDULED,CalendarLifecycle.ACTIVE,CalendarLifecycle.PAUSED) && at>=before.definition.end.instant && after.lifecycle==CalendarLifecycle.COMPLETED && after.approvedDefinitionRevision==before.approvedDefinitionRevision
            else -> false
        }
    }
    private fun invalidTransition(operation: CalendarOperation,before: CalendarEvent,at: Instant)=when(operation) {
        CalendarOperation.EDIT,CalendarOperation.SCHEDULE -> before.lifecycle!=CalendarLifecycle.DRAFT
        CalendarOperation.PAUSE -> before.lifecycle !in listOf(CalendarLifecycle.SCHEDULED,CalendarLifecycle.ACTIVE) || at>=before.definition.end.instant
        CalendarOperation.RESUME -> before.lifecycle!=CalendarLifecycle.PAUSED || at>=before.definition.end.instant
        CalendarOperation.CANCEL -> before.lifecycle !in listOf(CalendarLifecycle.DRAFT,CalendarLifecycle.SCHEDULED,CalendarLifecycle.ACTIVE,CalendarLifecycle.PAUSED)
        CalendarOperation.SYSTEM_ACTIVATE -> before.lifecycle!=CalendarLifecycle.SCHEDULED || at<before.definition.start.instant || at>=before.definition.end.instant
        CalendarOperation.SYSTEM_COMPLETE -> before.lifecycle !in listOf(CalendarLifecycle.SCHEDULED,CalendarLifecycle.ACTIVE,CalendarLifecycle.PAUSED) || at<before.definition.end.instant
        else -> false
    }
}
