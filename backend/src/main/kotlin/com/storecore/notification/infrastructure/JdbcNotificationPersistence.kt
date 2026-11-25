package com.storecore.notification.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.identity.domain.*
import com.storecore.notification.application.*
import com.storecore.notification.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.sql.Timestamp
import java.time.Clock
import java.time.temporal.ChronoUnit
import java.util.UUID

class JdbcNotificationPersistence(private val jdbc: JdbcTemplate, private val transactions: TransactionTemplate,
                                  mapper: ObjectMapper, private val clock: Clock = Clock.systemUTC(),
                                  private val emailProjection: NotificationEmailIntentProjection = NoNotificationEmailProjection) : NotificationPersistencePort {
    private val rowMapper = NotificationAlertRowMapper()
    private val snapshots = NotificationSnapshotCodec(mapper)

    override fun find(id: NotificationId): NotificationAlert? = jdbc.query("SELECT * FROM notification_alerts WHERE id=?", rowMapper, id.value).singleOrNull()

    override fun ingest(event: NotificationSourceEvent): NotificationIngestionResult = transactions.execute {
        lock("notification-delivery", event.deliveryId.value.toString())
        lock("notification-episode", "${event.source.type.wire}:${event.source.id.value}:${event.fingerprint.value}")
        val existing = jdbc.queryForList("SELECT * FROM notification_source_events WHERE delivery_id=?", event.deliveryId.value).singleOrNull()
        if (existing != null) {
            val exact = existing["event_hash"] == event.canonicalHash().value && existing["source_type"] == event.source.type.wire &&
                existing["source_id"] == event.source.id.value && existing["category"] == event.category.wire && existing["severity"] == event.severity.wire &&
                existing["condition_code"] == event.condition.value && existing["episode_key"] == event.episode.value && existing["fingerprint"] == event.fingerprint.value
            return@execute if (exact) requireNotNull(NotificationIngestionResult.Recorded.from(requireNotNull(find(requireNotNull(NotificationId.fromWire(existing["alert_id"] as UUID)))),NotificationIngestionDisposition.DELIVERY_REPLAY))
                else NotificationIngestionResult.DeliveryConflict
        }
        val at = Timestamp.from(clock.instant().truncatedTo(ChronoUnit.MICROS))
        val inserted=jdbc.update("""INSERT INTO notification_alerts(id,source_type,source_id,fingerprint,category,severity,lifecycle,revision,created_at)
            VALUES (?,?,?,?,?,?,'OPEN',0,?) ON CONFLICT(source_type,source_id,fingerprint) DO NOTHING""",
            UUID.randomUUID(), event.source.type.wire, event.source.id.value, event.fingerprint.value, event.category.wire, event.severity.wire, at)
        val alert = jdbc.query("SELECT * FROM notification_alerts WHERE source_type=? AND source_id=? AND fingerprint=? FOR UPDATE",
            rowMapper, event.source.type.wire, event.source.id.value, event.fingerprint.value).single()
        require(alert.category == event.category) { "Notification episode category collision" }
        jdbc.update("""INSERT INTO notification_source_events(delivery_id,alert_id,source_type,source_id,fingerprint,category,severity,condition_code,episode_key,event_hash,recorded_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)""", event.deliveryId.value, alert.id.value, event.source.type.wire, event.source.id.value,
            event.fingerprint.value, event.category.wire, event.severity.wire, event.condition.value, event.episode.value, event.canonicalHash().value, at)
        if(inserted==1) emailProjection.firstAlert(alert)
        requireNotNull(NotificationIngestionResult.Recorded.from(alert,if(inserted==1) NotificationIngestionDisposition.CREATED else NotificationIngestionDisposition.EPISODE_REUSED))
    }!!

    override fun execute(actor: InternalUserPrincipal, request: NotificationLifecycleRequest): NotificationExecutionResult = transactions.execute {
        if (InternalRole.ADMIN !in actor.roles) return@execute NotificationExecutionResult.Unauthorized
        if (request.step == NotificationTransitionStep.Unknown) return@execute NotificationExecutionResult.Unknown
        if (!authorized(actor))
            return@execute NotificationExecutionResult.Unauthorized
        val actorId = NotificationActorId.fromWire(actor.userId) ?: return@execute NotificationExecutionResult.Unauthorized
        lock("notification-command", request.commandId.value.toString())
        // A live session can expire by wall clock while an unrelated command lock is held.
        if (!authorized(actor)) return@execute NotificationExecutionResult.Unauthorized
        val command = requireNotNull(NotificationCommand.ChangeLifecycle.create(request.commandId,request.alertId,actorId,request.expectedRevision,
            request.step, request.reason, clock.instant().truncatedTo(ChronoUnit.MICROS)))
        val global=jdbc.queryForList("SELECT * FROM notification_command_bindings WHERE command_id=?",request.commandId.value).singleOrNull()
        if(global!=null && (NotificationCommandFamily.fromWire(global["family"] as? String)!=NotificationCommandFamily.LIFECYCLE ||
            (global["actor_id"] as Number).toLong()!=actor.userId || global["aggregate_ref"]!=request.alertId.value.toString() ||
            global["operation"]!=request.step.wire || global["payload_hash"]!=command.payloadHash().value)) return@execute NotificationExecutionResult.IdempotencyConflict
        val stored = jdbc.queryForList("SELECT * FROM notification_command_receipts WHERE command_id=?", request.commandId.value).singleOrNull()
        if (stored != null) {
            if ((stored["actor_id"] as Number).toLong()!=actor.userId || stored["alert_id"]!=request.alertId.value || stored["operation"]!=request.step.wire ||
                (stored["expected_revision"] as Number).toLong()!=request.expectedRevision.value || stored["reason"]!=request.reason.value || stored["payload_hash"]!=command.payloadHash().value)
                return@execute NotificationExecutionResult.IdempotencyConflict
            val original = requireNotNull(NotificationCommand.ChangeLifecycle.create(command.id,command.notificationId,command.actorId,command.expectedRevision,
                command.step,command.reason,(stored["recorded_at"] as Timestamp).toInstant()))
            val receipt = snapshots.receipt(original, stored["payload_hash"] as String, stored["outcome"] as String, stored["before_snapshot"].toString())
                ?: return@execute NotificationExecutionResult.Unknown
            return@execute NotificationExecutionResult.Recorded(receipt)
        }
        val before = jdbc.query("SELECT * FROM notification_alerts WHERE id=? FOR UPDATE", rowMapper, request.alertId.value).singleOrNull()
            ?: return@execute NotificationExecutionResult.Missing
        if (!authorized(actor)) return@execute NotificationExecutionResult.Unauthorized
        val result = before.apply(command)
        val outcome = NotificationReceiptOutcome.of(result)
        if (outcome == NotificationReceiptOutcome.UNKNOWN) return@execute NotificationExecutionResult.Unknown
        if (result is NotificationCommandResult.Applied) {
            check(jdbc.update("UPDATE notification_alerts SET lifecycle=?,revision=? WHERE id=? AND revision=?", result.alert.lifecycle.wire,
                result.alert.revision.value, before.id.value, before.revision.value) == 1)
        }
        jdbc.update("""INSERT INTO notification_command_receipts(command_id,alert_id,actor_id,operation,expected_revision,reason,payload_hash,outcome,before_snapshot,recorded_at)
            VALUES (?,?,?,?,?,?,?,?,?::jsonb,?)""", command.id.value,command.notificationId.value,actor.userId,command.step.wire,
            command.expectedRevision.value,command.reason.value,command.payloadHash().value,outcome.wire,snapshots.encode(before),Timestamp.from(command.occurredAt))
        jdbc.update("INSERT INTO notification_lifecycle_audit(command_id) VALUES (?)", command.id.value)
        NotificationExecutionResult.Recorded(NotificationCommandReceipt(command,before,result))
    }!!

    private fun authorized(actor: InternalUserPrincipal): Boolean =
        jdbc.queryForObject("SELECT notification_admin_authorized(?,?)", Boolean::class.java, actor.userId, actor.sessionId) == true

    private fun lock(namespace: String, value: String) {
        val digest = MessageDigest.getInstance("SHA-256").digest("$namespace:$value".toByteArray(Charsets.UTF_8))
        // Bigint namespace is disjoint from the identity guard's two-int locks.
        jdbc.query("SELECT pg_advisory_xact_lock(?)", { _, _ -> Unit }, ByteBuffer.wrap(digest).long)
    }
}
