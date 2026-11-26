package com.storecore.commercialcalendar.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.notification.application.NotificationIngestionDisposition
import com.storecore.notification.application.NotificationIngestionResult
import com.storecore.notification.application.NotificationPersistencePort
import com.storecore.notification.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

/** Explicitly constructed persistence adapter. PCC-007A installs no bean, endpoint or background task. */
class JdbcCalendarPersistence(private val jdbc: JdbcTemplate,private val transactions: TransactionTemplate,private val mapper: ObjectMapper,
    private val clock: CalendarClock,private val ids: CalendarIds,private val hasher: CalendarHasher,
    private val runtimeAdmission: CalendarReminderRuntimeAdmissionPort,private val notifications: NotificationPersistencePort?=null): CalendarPersistencePort,CalendarSystemPersistencePort,CalendarOccurrencePersistencePort,CalendarOccurrenceHandoffPort {
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
        val receipt=CalendarReceipt(request.commandId,event.id,actor.userId,CalendarOperation.CREATE,hash,CalendarOutcome.APPLIED,null,event,now,null,null,null,null)
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
        val receipt=CalendarReceipt(request.commandId,before.id,actor,request.step.operation,hash,decision.outcome,before,decision.event,now,request.expectedRevision,request.reason,request.definition?.hash,request.preflightId)
        writeReceipt(receipt)
        return CalendarPersistenceResult.Recorded(receipt)
    }
    override fun select(observedAt: Instant,batchSize: CalendarSystemBatchSize): CalendarSystemSelectionResult=tx {
        val at=Timestamp.from(observedAt)
        val raw=jdbc.query("""WITH validated AS MATERIALIZED (
                SELECT e.*,calendar_event_valid(e.snapshot) AS valid FROM calendar_events e
            ), decoded AS MATERIALIZED (
                SELECT v.*,CASE WHEN valid THEN (snapshot->'definition'->>'startAt')::timestamptz END AS start_at,
                    CASE WHEN valid THEN (snapshot->'definition'->>'endAt')::timestamptz END AS end_at FROM validated v
            ), eligible AS MATERIALIZED (
                SELECT d.*,CASE WHEN NOT valid THEN 'UNKNOWN'
                    WHEN lifecycle IN ('SCHEDULED','ACTIVE','PAUSED') AND end_at<=? THEN 'SYSTEM_COMPLETE'
                    WHEN lifecycle='SCHEDULED' AND start_at<=? AND ?<end_at THEN 'SYSTEM_ACTIVATE' END AS system_operation
                FROM decoded d
            ) SELECT e.snapshot::text
            FROM eligible e
            WHERE (e.system_operation='UNKNOWN' OR e.system_operation IN ('SYSTEM_ACTIVATE','SYSTEM_COMPLETE')
              AND NOT EXISTS(SELECT 1 FROM calendar_command_receipts r
                WHERE r.event_id=e.id AND r.actor_id IS NULL AND r.expected_revision=e.revision AND r.outcome='REVISION_EXHAUSTED'
                  AND r.operation=e.system_operation))
            ORDER BY CASE WHEN e.system_operation='UNKNOWN' THEN '-infinity'::timestamptz WHEN e.system_operation='SYSTEM_COMPLETE' THEN e.end_at ELSE e.start_at END,
              CASE e.system_operation WHEN 'UNKNOWN' THEN -1 WHEN 'SYSTEM_COMPLETE' THEN 0 ELSE 1 END,e.id
            LIMIT ?""",{ rs,_ -> rs.getString(1) },at,at,at,batchSize.value)
        try {
            val candidates=raw.map { CalendarSystemCandidate.from(codec.event(it),observedAt) ?: return@tx CalendarSystemSelectionResult.Corrupt }
            CalendarSystemSelectionResult.Page(observedAt,candidates)
        } catch(_: Exception) { CalendarSystemSelectionResult.Corrupt }
    }
    override fun advance(candidate: CalendarSystemCandidate): CalendarSystemAdvanceResult=tx {
        val recreated=CalendarSystemCandidate.from(candidate.observedEvent,candidate.observedAt)
            ?: return@tx CalendarSystemAdvanceResult.Corrupt
        if(recreated.operation!=candidate.operation || recreated.boundary!=candidate.boundary) return@tx CalendarSystemAdvanceResult.Corrupt
        val request=CalendarChangeRequest(hasher.systemCommand(candidate.eventId,candidate.expectedRevision,candidate.operation,candidate.boundary),candidate.eventId,candidate.expectedRevision,candidate.step,requireNotNull(CalendarReason.fromWire("Authoritative calendar boundary")))
        val hash=commandHash(null,request)
        systemReplay(request,hash)?.let { return@tx it }
        val observed=when(val result=systemRead(candidate.eventId)) {
            SystemEventRead.Corrupt -> return@tx CalendarSystemAdvanceResult.Corrupt
            SystemEventRead.Missing -> return@tx CalendarSystemAdvanceResult.Missing
            is SystemEventRead.Found -> result.event
        }
        if(observed.revision==candidate.expectedRevision && codec.event(observed)!=codec.event(candidate.observedEvent)) return@tx CalendarSystemAdvanceResult.Corrupt
        lock(request.commandId)
        systemReplay(request,hash)?.let { return@tx it }
        val before=when(val result=systemRead(candidate.eventId,true)) {
            SystemEventRead.Corrupt -> return@tx CalendarSystemAdvanceResult.Corrupt
            SystemEventRead.Missing -> return@tx CalendarSystemAdvanceResult.Missing
            is SystemEventRead.Found -> result.event
        }
        if(before.revision==candidate.expectedRevision && codec.event(before)!=codec.event(candidate.observedEvent)) return@tx CalendarSystemAdvanceResult.Corrupt
        when(val result=record(null,request,before,CalendarDecision.apply(before,candidate.expectedRevision,candidate.step,candidate.observedAt),hash,candidate.observedAt)) {
            is CalendarPersistenceResult.Recorded -> CalendarSystemAdvanceResult.Recorded(result.receipt,CalendarSystemReceiptDisposition.NEW)
            else -> CalendarSystemAdvanceResult.Corrupt
        }
    }

    private class OccurrenceCorrupt: RuntimeException()
    private class OccurrenceRow(
        val occurrence: CalendarReminderOccurrence,
        val nextAttemptAt: Instant?,
        val leaseStartedAt: Instant?,
        val terminalReason: CalendarOccurrenceTerminalReason?,
        val terminalAt: Instant?,
        val failureClass: CalendarOccurrenceFailureClass?,
    )
    private sealed interface OccurrenceDecision {
        class Lease(val row: OccurrenceRow): OccurrenceDecision
        class Skip(val row: OccurrenceRow,val reason: CalendarOccurrenceTerminalReason): OccurrenceDecision
        class Dead(val row: OccurrenceRow): OccurrenceDecision
    }
    private class OccurrenceContext(val row: OccurrenceRow,val approvedDefinition: CalendarDefinition,val event: CalendarEvent,val resumedAt: Instant?)
    private enum class OccurrenceSettlementWire {
        RETRY_SCHEDULED, DEAD, LOST_FENCE, MISSING, UNKNOWN;
        companion object { fun fromWire(raw: String?)=entries.firstOrNull { it!=UNKNOWN && it.name==raw } ?: UNKNOWN }
    }

    override fun handoff(lease: CalendarOccurrenceLease): CalendarOccurrenceHandoffResult = try {
        tx {
            val row=loadOccurrence(lease.occurrence.id,true) ?: return@tx CalendarOccurrenceHandoffResult.Missing
            if(!sameOccurrenceIdentity(row.occurrence,lease.occurrence)) throw OccurrenceCorrupt()
            if(row.occurrence.state==CalendarOccurrenceState.EMITTED) return@tx replayHandoff(row.occurrence,lease.token)
            if(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM calendar_occurrence_handoffs WHERE occurrence_id=?)",Boolean::class.java,row.occurrence.id.value)==true)
                throw OccurrenceCorrupt()
            if(row.occurrence.state!=CalendarOccurrenceState.LEASED || row.occurrence.attempts!=lease.token.attempt || row.occurrence.leaseOwner!=lease.token.owner.value)
                return@tx CalendarOccurrenceHandoffResult.LostFence

            val switchSnapshot=lockOccurrenceSwitchSnapshot()
            val admission=runtimeAdmission.admit()
            if(admission==CalendarReminderRuntimeAdmission.UNKNOWN) throw OccurrenceCorrupt()
            val context=loadOccurrenceContext(row)
            val event=notificationEvent(row.occurrence)
            notificationLock("notification-delivery",event.deliveryId.value.toString())
            notificationLock("notification-episode","${event.source.type.wire}:${event.source.id.value}:${event.fingerprint.value}")
            if(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM notification_source_events WHERE delivery_id=?)",Boolean::class.java,event.deliveryId.value)==true ||
                jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM notification_alerts WHERE source_type=? AND source_id=? AND fingerprint=?)",Boolean::class.java,event.source.type.wire,event.source.id.value,event.fingerprint.value)==true)
                throw OccurrenceCorrupt()

            val handoffAt=clock.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS)
            if(row.leaseStartedAt==null || handoffAt<row.leaseStartedAt || handoffAt>=lease.leaseUntil || row.occurrence.leaseUntil!=lease.leaseUntil)
                return@tx CalendarOccurrenceHandoffResult.LostFence
            val switch=CalendarReminderSwitch(switchSnapshot,handoffAt)
            occurrenceSkipReason(context,switch,handoffAt,admission)?.let { reason ->
                if(jdbc.queryForObject("SELECT calendar_skip_leased_occurrence(?,?,?,?,?)",Boolean::class.java,row.occurrence.id.value,lease.token.owner.value,lease.token.attempt,reason.wire,Timestamp.from(handoffAt))!=true) throw OccurrenceCorrupt()
                return@tx CalendarOccurrenceHandoffResult.Skipped.from(reason) ?: throw OccurrenceCorrupt()
            }

            val ingestion=notifications?.ingest(event) ?: throw OccurrenceCorrupt()
            val recorded=ingestion as? NotificationIngestionResult.Recorded ?: throw OccurrenceCorrupt()
            val alert=recorded.alert
            if(recorded.disposition!=NotificationIngestionDisposition.CREATED || !sameNotification(alert,event) || alert.lifecycle!=NotificationLifecycle.OPEN || alert.revision.value!=0L)
                throw OccurrenceCorrupt()
            if(jdbc.queryForObject("SELECT calendar_complete_occurrence_handoff(?,?,?,?,?)",Boolean::class.java,row.occurrence.id.value,lease.token.owner.value,lease.token.attempt,alert.id.value,Timestamp.from(handoffAt))!=true)
                throw OccurrenceCorrupt()
            CalendarOccurrenceHandoffResult.Emitted.from(alert.id)
        }
    } catch(_: OccurrenceCorrupt) { CalendarOccurrenceHandoffResult.Corrupt }

    private fun sameOccurrenceIdentity(current: CalendarReminderOccurrence,retained: CalendarReminderOccurrence)=
        current.id==retained.id && current.eventId==retained.eventId && current.approvedDefinitionRevision==retained.approvedDefinitionRevision &&
            current.ruleId==retained.ruleId && current.scheduledAt==retained.scheduledAt

    private fun notificationEvent(occurrence: CalendarReminderOccurrence): NotificationSourceEvent {
        val identity=occurrence.id.value.toString().lowercase()
        return NotificationSourceEvent.create(
            requireNotNull(NotificationDeliveryId.fromWire(occurrence.id.value)),
            requireNotNull(NotificationSourceIdentity.create(NotificationSourceType.SYSTEM_CAMPAIGN,requireNotNull(NotificationSourceId.fromWire(identity)))),
            NotificationCategory.CAMPAIGN,NotificationSeverity.INFO,requireNotNull(NotificationConditionCode.fromWire("CALENDAR_REMINDER_DUE")),
            requireNotNull(NotificationEpisodeKey.fromWire(identity)),
        ) ?: throw OccurrenceCorrupt()
    }

    private fun sameNotification(alert: NotificationAlert,event: NotificationSourceEvent)=
        alert.source==event.source && alert.fingerprint==event.fingerprint && alert.category==event.category && alert.severity==event.severity

    private fun replayHandoff(occurrence: CalendarReminderOccurrence,token: CalendarOccurrenceLeaseToken): CalendarOccurrenceHandoffResult {
        val rows=jdbc.queryForList("""SELECT h.lease_owner,h.attempt,h.delivery_id,h.alert_id,h.emitted_at,
            n.source_type,n.source_id,n.fingerprint,n.category,n.severity,n.condition_code,n.episode_key,n.event_hash,n.alert_id AS source_alert_id,
            a.source_type AS alert_source_type,a.source_id AS alert_source_id,a.fingerprint AS alert_fingerprint,a.category AS alert_category,a.severity AS alert_severity,
            a.lifecycle AS alert_lifecycle,a.revision AS alert_revision
            FROM calendar_occurrence_handoffs h JOIN notification_source_events n ON n.delivery_id=h.delivery_id
            JOIN notification_alerts a ON a.id=h.alert_id WHERE h.occurrence_id=?""",occurrence.id.value)
        if(rows.size!=1) throw OccurrenceCorrupt()
        val row=rows.single()
        val event=notificationEvent(occurrence)
        val emitted=(row["emitted_at"] as? Timestamp)?.toInstant() ?: throw OccurrenceCorrupt()
        val alertId=NotificationId.fromWire(row["alert_id"] as? UUID) ?: throw OccurrenceCorrupt()
        val evidenceOwner=CalendarLeaseOwner.fromWire(row["lease_owner"] as? UUID) ?: throw OccurrenceCorrupt()
        val evidenceAttempt=(row["attempt"] as? Number)?.toInt() ?: throw OccurrenceCorrupt()
        val alertLifecycle=NotificationLifecycle.fromWire(row["alert_lifecycle"] as? String)
        val alertRevision=NotificationRevision.fromWire((row["alert_revision"] as? Number)?.toLong())
        val exact=evidenceAttempt==occurrence.attempts && emitted.nano==0 && row["delivery_id"]==occurrence.id.value && row["source_alert_id"]==alertId.value &&
            row["source_type"]==event.source.type.wire && row["source_id"]==event.source.id.value && row["fingerprint"]==event.fingerprint.value &&
            row["category"]==event.category.wire && row["severity"]==event.severity.wire && row["condition_code"]==event.condition.value &&
            row["episode_key"]==event.episode.value && row["event_hash"]==event.canonicalHash().value &&
            row["alert_source_type"]==event.source.type.wire && row["alert_source_id"]==event.source.id.value && row["alert_fingerprint"]==event.fingerprint.value &&
            row["alert_category"]==event.category.wire && row["alert_severity"]==event.severity.wire &&
            alertLifecycle!=NotificationLifecycle.UNKNOWN && alertRevision!=null
        if(!exact) throw OccurrenceCorrupt()
        if(evidenceOwner!=token.owner || evidenceAttempt!=token.attempt) return CalendarOccurrenceHandoffResult.LostFence
        return CalendarOccurrenceHandoffResult.Replayed.from(alertId)
    }

    private fun notificationLock(namespace: String,value: String) {
        val digest=java.security.MessageDigest.getInstance("SHA-256").digest("$namespace:$value".toByteArray(Charsets.UTF_8))
        jdbc.query("SELECT pg_advisory_xact_lock(?)",{ _,_ -> Unit },java.nio.ByteBuffer.wrap(digest).long)
    }

    override fun claim(observedAt: Instant,owner: CalendarLeaseOwner,batchSize: CalendarOccurrenceBatchSize): CalendarOccurrenceClaimResult = try {
        tx {
            val rows=jdbc.query("SELECT * FROM calendar_lock_due_occurrences(?,?)",{ rs,_ ->
                val values=(1..rs.metaData.columnCount).associate { rs.metaData.getColumnLabel(it) to rs.getObject(it) }
                try { decodeOccurrence(values) } catch(_: Exception) { throw OccurrenceCorrupt() }
            },Timestamp.from(observedAt),batchSize.value)
            if(rows.isEmpty()) return@tx CalendarOccurrenceClaimResult.Empty(observedAt)

            val switch=CalendarReminderSwitch(lockOccurrenceSwitchSnapshot(),observedAt)
            val admission=runtimeAdmission.admit()
            if(admission==CalendarReminderRuntimeAdmission.UNKNOWN) throw OccurrenceCorrupt()
            val contexts=rows.map(::loadOccurrenceContext)
            val decisions=contexts.map { context -> occurrenceDecision(context,switch,observedAt,admission) }
            val leaseGrantedAt=clock.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS)
            if(leaseGrantedAt<observedAt) throw OccurrenceCorrupt()
            val leases=mutableListOf<CalendarOccurrenceLease>()
            var skipped=0; var dead=0
            decisions.forEach { decision -> when(decision) {
                is OccurrenceDecision.Dead -> {
                    val occurrence=decision.row.occurrence
                    val priorOwner=CalendarLeaseOwner.fromWire(occurrence.leaseOwner) ?: throw OccurrenceCorrupt()
                    if(jdbc.queryForObject("SELECT calendar_exhaust_occurrence(?,?,?,?)",Boolean::class.java,occurrence.id.value,priorOwner.value,occurrence.attempts,Timestamp.from(observedAt))!=true) throw OccurrenceCorrupt()
                    dead++
                }
                is OccurrenceDecision.Skip -> {
                    val occurrence=decision.row.occurrence
                    if(jdbc.queryForObject("SELECT calendar_skip_occurrence(?,?,?,?,?,?)",Boolean::class.java,occurrence.id.value,occurrence.state.wire,occurrence.attempts,occurrence.leaseOwner,decision.reason.wire,Timestamp.from(observedAt))!=true) throw OccurrenceCorrupt()
                    skipped++
                }
                is OccurrenceDecision.Lease -> {
                    val occurrence=decision.row.occurrence
                    if(jdbc.queryForObject("SELECT calendar_lease_occurrence(?,?,?,?,?,?)",Boolean::class.java,occurrence.id.value,occurrence.state.wire,occurrence.attempts,owner.value,Timestamp.from(observedAt),Timestamp.from(leaseGrantedAt))!=true) throw OccurrenceCorrupt()
                    val leased=loadOccurrence(occurrence.id) ?: throw OccurrenceCorrupt()
                    leases += CalendarOccurrenceLease.from(leased.occurrence,observedAt,leaseGrantedAt) ?: throw OccurrenceCorrupt()
                }
            } }
            CalendarOccurrenceClaimResult.Page.create(observedAt,leaseGrantedAt,rows.size,leases.size,skipped,dead,leases) ?: throw OccurrenceCorrupt()
        }
    } catch(_: OccurrenceCorrupt) { CalendarOccurrenceClaimResult.Corrupt }

    private fun occurrenceDecision(context: OccurrenceContext,switch: CalendarReminderSwitch,observedAt: Instant,admission: CalendarReminderRuntimeAdmission): OccurrenceDecision {
        val row=context.row
        val occurrence=row.occurrence
        if(occurrence.state==CalendarOccurrenceState.LEASED && occurrence.attempts==3) return OccurrenceDecision.Dead(row)
        return occurrenceSkipReason(context,switch,observedAt,admission)?.let { OccurrenceDecision.Skip(row,it) } ?: OccurrenceDecision.Lease(row)
    }

    private fun occurrenceSkipReason(context: OccurrenceContext,switch: CalendarReminderSwitch,observedAt: Instant,admission: CalendarReminderRuntimeAdmission): CalendarOccurrenceTerminalReason? {
        val occurrence=context.row.occurrence
        if(occurrence.scheduledAt<observedAt.minusSeconds(900)) return CalendarOccurrenceTerminalReason.LATE
        when(switch.effectivity) {
            CalendarSwitchEffectivity.DISABLED -> return CalendarOccurrenceTerminalReason.SWITCH_DISABLED
            CalendarSwitchEffectivity.EXPIRED -> return CalendarOccurrenceTerminalReason.SWITCH_EXPIRED
            CalendarSwitchEffectivity.UNKNOWN -> throw OccurrenceCorrupt()
            CalendarSwitchEffectivity.EFFECTIVE -> Unit
        }
        val enabledAt=switch.metadata?.createdAt ?: throw OccurrenceCorrupt()
        if(occurrence.scheduledAt<=enabledAt) return CalendarOccurrenceTerminalReason.ENABLE_CUTOFF
        if(admission==CalendarReminderRuntimeAdmission.BLOCKED) return CalendarOccurrenceTerminalReason.CAPABILITY_BLOCKED
        if(admission!=CalendarReminderRuntimeAdmission.ADMITTED) throw OccurrenceCorrupt()
        val event=context.event
        if(event.approvedDefinitionRevision!=occurrence.approvedDefinitionRevision) return CalendarOccurrenceTerminalReason.DEFINITION_CHANGED
        if(event.lifecycle !in listOf(CalendarLifecycle.SCHEDULED,CalendarLifecycle.ACTIVE)) return CalendarOccurrenceTerminalReason.EVENT_INELIGIBLE
        if(context.resumedAt!=null && occurrence.scheduledAt<=context.resumedAt) return CalendarOccurrenceTerminalReason.RESUME_CUTOFF
        return null
    }

    private fun loadOccurrenceContext(row: OccurrenceRow): OccurrenceContext {
        val occurrence=row.occurrence
        val referenceRows=jdbc.queryForList("""SELECT r.channel,r.offset_seconds,d.snapshot::text AS definition_snapshot
            FROM calendar_reminder_rules r JOIN calendar_definitions d ON d.event_id=r.event_id AND d.definition_revision=r.definition_revision
            WHERE r.event_id=? AND r.definition_revision=? AND r.rule_id=?""",occurrence.eventId.value,occurrence.approvedDefinitionRevision.value,occurrence.ruleId.value)
        if(referenceRows.size!=1) throw OccurrenceCorrupt()
        val approvedDefinition=try {
            val reference=referenceRows.single()
            val definition=codec.definition(reference["definition_snapshot"] as String)
            val channel=CalendarReminderChannel.fromWire(reference["channel"] as? String)
            val offset=(reference["offset_seconds"] as? Number)?.toLong() ?: throw OccurrenceCorrupt()
            val rule=definition.reminders.singleOrNull { it.id==occurrence.ruleId } ?: throw OccurrenceCorrupt()
            if(channel!=rule.channel || offset!=rule.offsetSeconds || definition.revision!=occurrence.approvedDefinitionRevision || definition.start.instant.minusSeconds(offset)!=occurrence.scheduledAt) throw OccurrenceCorrupt()
            definition
        } catch(_: OccurrenceCorrupt) { throw OccurrenceCorrupt() }
          catch(_: Exception) { throw OccurrenceCorrupt() }
        val event=when(val result=systemRead(occurrence.eventId,true)) {
            is SystemEventRead.Found -> result.event
            SystemEventRead.Missing,SystemEventRead.Corrupt -> throw OccurrenceCorrupt()
        }
        if(event.approvedDefinitionRevision==occurrence.approvedDefinitionRevision && codec.definition(event.definition)!=codec.definition(approvedDefinition)) throw OccurrenceCorrupt()
        return OccurrenceContext(row,approvedDefinition,event,latestResume(event.id))
    }

    private fun latestResume(eventId: CalendarEventId): Instant? {
        val rows=jdbc.queryForList("""SELECT r.*,b.family AS binding_family,b.actor_id AS binding_actor_id,b.event_id AS binding_event_id,b.payload_hash AS binding_payload_hash
            FROM calendar_command_receipts r JOIN calendar_audit a USING(command_id) JOIN calendar_command_bindings b USING(command_id)
            WHERE r.event_id=? AND r.operation='RESUME' AND r.outcome='APPLIED'
            ORDER BY r.command_id""",eventId.value)
        if(rows.isEmpty()) return null
        return try {
            val receipts=rows.map(::decodeReceipt)
            if(receipts.any { it.operation!=CalendarOperation.RESUME || it.outcome!=CalendarOutcome.APPLIED } || receipts.map { it.after.revision }.distinct().size!=receipts.size) throw OccurrenceCorrupt()
            receipts.maxBy { it.after.revision.value }.recordedAt
        } catch(_: OccurrenceCorrupt) { throw OccurrenceCorrupt() }
          catch(_: Exception) { throw OccurrenceCorrupt() }
    }

    private fun lockOccurrenceSwitchSnapshot(): CalendarSwitchSnapshot {
        val rows=jdbc.queryForList("SELECT * FROM calendar_lock_reminder_switch()")
        if(rows.size!=1) throw OccurrenceCorrupt()
        return try {
            val row=rows.single()
            val state=CalendarSwitchState.fromWire(row["state"] as? String)
            val revision=CalendarRevision.fromWire((row["revision"] as? Number)?.toLong()) ?: throw OccurrenceCorrupt()
            val metadata=if(revision==CalendarRevision.Zero) null else CalendarSwitchMetadata.restore(
                CalendarSwitchOwner.fromWire(row["owner"] as? String) ?: throw OccurrenceCorrupt(),
                CalendarReason.fromWire(row["reason"] as? String) ?: throw OccurrenceCorrupt(),
                (row["created_at"] as? Timestamp)?.toInstant() ?: throw OccurrenceCorrupt(),
                (row["expires_at"] as? Timestamp)?.toInstant() ?: throw OccurrenceCorrupt(),
                CalendarRemovalTicket.fromWire(row["removal_ticket"] as? String) ?: throw OccurrenceCorrupt(),
                CalendarSwitchAction.fromWire(row["affected_action"] as? String),
            ) ?: throw OccurrenceCorrupt()
            CalendarSwitchSnapshot.restore(state,revision,metadata) ?: throw OccurrenceCorrupt()
        } catch(_: OccurrenceCorrupt) { throw OccurrenceCorrupt() }
          catch(_: Exception) { throw OccurrenceCorrupt() }
    }

    private fun loadOccurrence(id: CalendarOccurrenceId,locked: Boolean=false): OccurrenceRow?=jdbc.queryForList(
        if(locked) "SELECT * FROM calendar_lock_occurrence(?)" else "SELECT * FROM calendar_reminder_occurrences WHERE id=?",
        id.value
    ).singleOrNull()?.let(::decodeOccurrence)

    private fun decodeOccurrence(row: Map<String,Any?>): OccurrenceRow {
        val id=CalendarOccurrenceId.fromWire(row["id"] as? UUID) ?: throw OccurrenceCorrupt()
        val eventId=CalendarEventId.fromWire(row["event_id"] as? UUID) ?: throw OccurrenceCorrupt()
        val approved=CalendarRevision.fromWire((row["approved_definition_revision"] as? Number)?.toLong()) ?: throw OccurrenceCorrupt()
        val ruleId=CalendarRuleId.fromWire(row["rule_id"] as? UUID) ?: throw OccurrenceCorrupt()
        val scheduled=(row["scheduled_at"] as? Timestamp)?.toInstant() ?: throw OccurrenceCorrupt()
        val state=CalendarOccurrenceState.fromWire(row["state"] as? String)
        val attempts=(row["attempts"] as? Number)?.toInt() ?: throw OccurrenceCorrupt()
        val owner=row["lease_owner"] as? UUID
        val leaseUntil=(row["lease_until"] as? Timestamp)?.toInstant()
        val occurrence=CalendarReminderOccurrence.restore(id,eventId,approved,ruleId,scheduled,state,attempts,owner,leaseUntil) ?: throw OccurrenceCorrupt()
        val next=(row["next_attempt_at"] as? Timestamp)?.toInstant()
        val leaseStarted=(row["lease_started_at"] as? Timestamp)?.toInstant()
        val terminal=(row["terminal_reason"] as? String)?.let { CalendarOccurrenceTerminalReason.fromWire(it).also { value -> if(value==CalendarOccurrenceTerminalReason.UNKNOWN) throw OccurrenceCorrupt() } }
        val terminalAt=(row["terminal_at"] as? Timestamp)?.toInstant()
        val failure=(row["last_failure_class"] as? String)?.let { CalendarOccurrenceFailureClass.fromWire(it).also { value -> if(value==CalendarOccurrenceFailureClass.UNKNOWN) throw OccurrenceCorrupt() } }
        val whole=listOf(scheduled,next,leaseStarted,leaseUntil,terminalAt).filterNotNull().all { it.nano==0 }
        if(!whole) throw OccurrenceCorrupt()
        val valid=when(state) {
            CalendarOccurrenceState.PENDING -> leaseStarted==null && owner==null && leaseUntil==null && terminal==null && terminalAt==null &&
                (if(attempts==0) next==scheduled && failure==null else attempts in 1..2 && next!=null && failure==CalendarOccurrenceFailureClass.RETRYABLE_PRE_HANDOFF)
            CalendarOccurrenceState.LEASED -> attempts in 1..3 && leaseStarted!=null && leaseUntil==leaseStarted.plusSeconds(60) && next==null && terminal==null && terminalAt==null && failure==null
            CalendarOccurrenceState.SKIPPED -> attempts in 0..3 && next==null && leaseStarted==null && owner==null && leaseUntil==null && terminal?.skip==true && terminalAt!=null && failure==null
            CalendarOccurrenceState.DEAD -> attempts in 1..3 && next==null && leaseStarted==null && owner==null && leaseUntil==null && terminalAt!=null &&
                (terminal==CalendarOccurrenceTerminalReason.ATTEMPTS_EXHAUSTED && attempts==3 && failure in setOf(null,CalendarOccurrenceFailureClass.RETRYABLE_PRE_HANDOFF) ||
                 terminal==CalendarOccurrenceTerminalReason.PERMANENT_FAILURE && failure==CalendarOccurrenceFailureClass.PERMANENT_PRE_HANDOFF)
            CalendarOccurrenceState.EMITTED -> attempts in 1..3 && next==null && leaseStarted==null && owner==null && leaseUntil==null && terminal==null && terminalAt==null && failure==null
            CalendarOccurrenceState.UNKNOWN -> false
        }
        if(!valid || state!=CalendarOccurrenceState.LEASED && (owner!=null || leaseUntil!=null) || state!=CalendarOccurrenceState.PENDING && next!=null) throw OccurrenceCorrupt()
        return OccurrenceRow(occurrence,next,leaseStarted,terminal,terminalAt,failure)
    }

    override fun settleFailure(id: CalendarOccurrenceId,token: CalendarOccurrenceLeaseToken,failure: CalendarOccurrenceFailureClass,settledAt: Instant): CalendarOccurrenceSettlementResult {
        if(failure==CalendarOccurrenceFailureClass.UNKNOWN) return CalendarOccurrenceSettlementResult.Corrupt
        return tx {
            when(OccurrenceSettlementWire.fromWire(jdbc.queryForObject("SELECT calendar_settle_occurrence_failure(?,?,?,?,?)",String::class.java,id.value,token.owner.value,token.attempt,failure.wire,Timestamp.from(settledAt)))) {
                OccurrenceSettlementWire.RETRY_SCHEDULED -> CalendarOccurrenceSettlementResult.RetryScheduled.from(settledAt.plusSeconds(if(token.attempt==1) 30 else 120)) ?: CalendarOccurrenceSettlementResult.Corrupt
                OccurrenceSettlementWire.DEAD -> CalendarOccurrenceSettlementResult.Dead.from(if(failure==CalendarOccurrenceFailureClass.PERMANENT_PRE_HANDOFF) CalendarOccurrenceTerminalReason.PERMANENT_FAILURE else CalendarOccurrenceTerminalReason.ATTEMPTS_EXHAUSTED) ?: CalendarOccurrenceSettlementResult.Corrupt
                OccurrenceSettlementWire.LOST_FENCE -> CalendarOccurrenceSettlementResult.LostFence
                OccurrenceSettlementWire.MISSING -> CalendarOccurrenceSettlementResult.Missing
                OccurrenceSettlementWire.UNKNOWN -> CalendarOccurrenceSettlementResult.Corrupt
            }
        }
    }
    private fun systemReplay(request: CalendarChangeRequest,hash: CalendarCommandPayloadHash): CalendarSystemAdvanceResult? {
        val row=binding(request.commandId) ?: return null
        if(!sameBinding(row,null,request.eventId,CalendarCommandFamily.EVENT,hash)) return CalendarSystemAdvanceResult.Corrupt
        val stored=receiptRow(request.commandId) ?: return CalendarSystemAdvanceResult.Corrupt
        val receipt=try { decodeReceipt(stored) } catch(_: Exception) { return CalendarSystemAdvanceResult.Corrupt }
        return if(receipt.actorId==null && receipt.operation==request.step.operation && receipt.expectedRevision==request.expectedRevision)
            CalendarSystemAdvanceResult.Recorded(receipt,CalendarSystemReceiptDisposition.REPLAY)
        else CalendarSystemAdvanceResult.Corrupt
    }
    private sealed interface SystemEventRead {
        class Found(val event: CalendarEvent): SystemEventRead
        data object Missing: SystemEventRead
        data object Corrupt: SystemEventRead
    }
    private fun systemRead(id: CalendarEventId,locked: Boolean=false): SystemEventRead {
        val raw=jdbc.query("SELECT snapshot::text FROM calendar_events WHERE id=?"+if(locked) " FOR UPDATE" else "",{ rs,_ -> rs.getString(1) },id.value).singleOrNull()
            ?: return SystemEventRead.Missing
        return try { SystemEventRead.Found(codec.event(raw)) } catch(_: Exception) { SystemEventRead.Corrupt }
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
        val result=loadReceipt(commandId)
        if(!authorized(actor)) CalendarPersistenceResult.Unauthorized else result
    }
    override fun audit(actor: InternalUserPrincipal,eventId: CalendarEventId): List<CalendarReceipt>?=tx {
        if(!authorized(actor)) return@tx emptyList()
        if(read(eventId)==null) return@tx emptyList()
        jdbc.query("""SELECT r.*,b.family AS binding_family,b.actor_id AS binding_actor_id,b.event_id AS binding_event_id,b.payload_hash AS binding_payload_hash
            FROM calendar_command_receipts r JOIN calendar_audit a USING(command_id) JOIN calendar_command_bindings b USING(command_id)
            WHERE r.event_id=? ORDER BY r.recorded_at,r.command_id""",{ rs,_ -> decodeReceipt((1..rs.metaData.columnCount).associate { rs.metaData.getColumnLabel(it) to rs.getObject(it) }) },eventId.value)
    }
    override fun reminderSwitch(): CalendarReminderSwitch {
        val row=jdbc.queryForMap("SELECT * FROM calendar_reminder_switch WHERE id=1")
        val state=CalendarSwitchState.fromWire(row["state"] as String); require(state!=CalendarSwitchState.UNKNOWN)
        val revision=requireNotNull(CalendarRevision.fromWire((row["revision"] as Number).toLong()))
        val metadata=if(revision==CalendarRevision.Zero) null else CalendarSwitchMetadata.restore(
            requireNotNull(CalendarSwitchOwner.fromWire(row["owner"] as? String)),requireNotNull(CalendarReason.fromWire(row["reason"] as? String)),
            (row["created_at"] as Timestamp).toInstant(),(row["expires_at"] as Timestamp).toInstant(),
            requireNotNull(CalendarRemovalTicket.fromWire(row["removal_ticket"] as? String)),CalendarSwitchAction.fromWire(row["affected_action"] as? String),
        )
        return CalendarReminderSwitch(requireNotNull(CalendarSwitchSnapshot.restore(state,revision,metadata)),clock.now())
    }
    private fun writeDefinition(event: CalendarEvent) {
        val d=event.definition
        jdbc.update("INSERT INTO calendar_definitions(event_id,definition_revision,definition_hash,snapshot) VALUES(?,?,?,?::jsonb)",event.id.value,d.revision.value,d.hash.value,codec.definition(d))
        d.reminders.forEach { rule -> jdbc.update("INSERT INTO calendar_reminder_rules(event_id,definition_revision,rule_id,channel,offset_seconds) VALUES(?,?,?,?,?)",event.id.value,d.revision.value,rule.id.value,rule.channel.wire,rule.offsetSeconds) }
    }
    private fun writeReceipt(r: CalendarReceipt) {
        jdbc.update("""INSERT INTO calendar_command_receipts(command_id,event_id,actor_id,operation,expected_revision,reason,requested_definition_hash,preflight_id,payload_hash,outcome,before_snapshot,after_snapshot,recorded_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?::jsonb,?::jsonb,?)""",r.commandId.value,r.eventId.value,r.actorId,r.operation.wire,r.expectedRevision?.value,r.reason?.value,r.requestedDefinitionHash?.value,r.preflightId?.value,r.payloadHash.value,r.outcome.wire,r.before?.let(codec::event),codec.event(r.after),Timestamp.from(r.recordedAt))
        jdbc.update("INSERT INTO calendar_audit(command_id) VALUES(?)",r.commandId.value)
    }
    private fun receiptRow(id: CalendarCommandId)=jdbc.queryForList("""SELECT r.*,b.family AS binding_family,b.actor_id AS binding_actor_id,b.event_id AS binding_event_id,b.payload_hash AS binding_payload_hash
        FROM calendar_command_receipts r JOIN calendar_command_bindings b USING(command_id) WHERE r.command_id=?""",id.value).singleOrNull()
    private fun loadReceipt(id: CalendarCommandId): CalendarPersistenceResult = receiptRow(id)?.let { CalendarPersistenceResult.Recorded(decodeReceipt(it)) } ?: CalendarPersistenceResult.Unknown
    internal fun historicalReceipt(id: CalendarCommandId): CalendarReceipt =
        (loadReceipt(id) as? CalendarPersistenceResult.Recorded)?.receipt ?: throw IllegalStateException("Calendar receipt unavailable")
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
        val requestedDefinitionHash=(row["requested_definition_hash"] as? String)?.let { requireNotNull(CalendarHash.fromWire(it)) }
        val preflightId=(row["preflight_id"] as? UUID)?.let { requireNotNull(CalendarPreflightId.fromWire(it)) }
        val canonicalPayload=if(operation==CalendarOperation.CREATE) {
            require(actorId!=null && requestedDefinitionHash==null && preflightId==null)
            payload(listOf("calendar-create-v1",actorId.toString(),after.definition.hash.value))
        } else {
            require(expected!=null && row["reason"] is String)
            payload(listOf("calendar-command-v1",actorId?.toString() ?: "SYSTEM",eventId.value.toString(),operation.wire,expected.value.toString(),row["reason"] as String,requestedDefinitionHash?.value ?: "",preflightId?.value?.toString() ?: ""))
        }
        require(canonicalPayload==payloadHash)
        if(operation!=CalendarOperation.CREATE) {
            require(before!=null && expected!=null)
            if(outcome==CalendarOutcome.REVISION_CONFLICT) require(before.revision!=expected) else require(before.revision==expected)
            if(outcome==CalendarOutcome.APPLIED) {
                require(operation!=CalendarOperation.EDIT || requestedDefinitionHash==after.definition.hash)
                require(after.revision==before.revision.next() && validApplied(operation,before,after,recordedAt))
            }
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
            payloadHash,outcome,before,after,recordedAt,expected,(row["reason"] as? String)?.let { requireNotNull(CalendarReason.fromWire(it)) },requestedDefinitionHash,preflightId)
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
