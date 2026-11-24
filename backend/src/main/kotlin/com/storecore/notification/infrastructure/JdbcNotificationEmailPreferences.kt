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
import java.util.UUID

class JdbcNotificationEmailPreferences(private val jdbc: JdbcTemplate,private val transactions: TransactionTemplate,
    private val mapper: ObjectMapper,private val readiness: NotificationEmailReadinessPort) : NotificationEmailPreferencePort {
    override fun get(actor: InternalUserPrincipal): NotificationEmailPreferenceResult = transactions.execute {
        if(!authorized(actor)) return@execute NotificationEmailPreferenceResult.Unauthorized
        val preference=load(actor.userId,false) ?: return@execute NotificationEmailPreferenceResult.Unknown
        val account=jdbc.queryForMap("SELECT * FROM notification_email_account(?)",actor.userId)
        if(!authorized(actor)) return@execute NotificationEmailPreferenceResult.Unauthorized
        NotificationEmailPreferenceResult.Current(NotificationEmailPreferenceView(preference,account["verified"]==true,readiness.current()))
    }!!
    override fun execute(actor: InternalUserPrincipal,command: NotificationEmailPreferenceCommand): NotificationEmailPreferenceResult = transactions.execute {
        if(!authorized(actor)) return@execute NotificationEmailPreferenceResult.Unauthorized
        val actorId=NotificationActorId.fromWire(actor.userId) ?: return@execute NotificationEmailPreferenceResult.Unauthorized
        val hash=command.payloadHash(actorId)
        val lock=ByteBuffer.wrap(MessageDigest.getInstance("SHA-256").digest("notification-command:${command.id.value}".toByteArray(Charsets.UTF_8))).long
        jdbc.query("SELECT pg_advisory_xact_lock(?)",{_,_->Unit},lock)
        if(!authorized(actor)) return@execute NotificationEmailPreferenceResult.Unauthorized
        val binding=jdbc.queryForList("SELECT * FROM notification_command_bindings WHERE command_id=?",command.id.value).singleOrNull()
        if(binding!=null && (NotificationCommandFamily.fromWire(binding["family"] as? String)!=NotificationCommandFamily.EMAIL_PREFERENCE ||
            (binding["actor_id"] as Number).toLong()!=actor.userId || binding["aggregate_ref"]!=actor.userId.toString() || binding["operation"]!=command.operation.wire || binding["payload_hash"]!=hash))
            return@execute NotificationEmailPreferenceResult.IdempotencyConflict
        val stored=jdbc.queryForList("SELECT * FROM notification_email_preference_receipts WHERE command_id=?",command.id.value).singleOrNull()
        if(stored!=null) {
            val categories: List<String> = command.filters?.categories()?.map { it.wire } ?: emptyList()
            val severities: List<String> = command.filters?.severities()?.map { it.wire } ?: emptyList()
            if((stored["expected_revision"] as Number).toLong()!=command.expectedRevision.value || strings(stored["categories"])!=categories ||
                strings(stored["severities"])!=severities) return@execute NotificationEmailPreferenceResult.IdempotencyConflict
            val preference=decode(stored["result"].toString()) ?: return@execute NotificationEmailPreferenceResult.Unknown
            val outcome=NotificationEmailPreferenceOutcome.fromWire(stored["outcome"] as? String)
            if(outcome==NotificationEmailPreferenceOutcome.UNKNOWN) return@execute NotificationEmailPreferenceResult.Unknown
            return@execute NotificationEmailPreferenceResult.Recorded(NotificationEmailPreferenceReceipt(command.id,outcome,preference,(stored["recorded_at"] as Timestamp).toInstant()))
        }
        if(binding!=null) return@execute NotificationEmailPreferenceResult.Unknown
        jdbc.update("INSERT INTO notification_email_preferences(user_id,state,revision) VALUES (?,'DISABLED',0) ON CONFLICT DO NOTHING",actor.userId)
        val before=load(actor.userId,true) ?: return@execute NotificationEmailPreferenceResult.Unknown
        val account=jdbc.queryForMap("SELECT * FROM notification_email_account(?)",actor.userId)
        if(!authorized(actor)) return@execute NotificationEmailPreferenceResult.Unauthorized
        val current=if(account["eligible"]==true && account["verified"]==true) NotificationEmailBinding.create((account["email_version"] as Number).toLong(),account["email_digest"] as? String) else null
        val decision=ApplyNotificationEmailPreference.apply(before,command,current)
        if(decision.outcome==NotificationEmailPreferenceOutcome.APPLIED) {
            val after=decision.preference
            jdbc.update("""UPDATE notification_email_preferences SET state=?,revision=?,categories=?::text[],severities=?::text[],email_version=?,email_digest=?,consented_at=CASE WHEN ? THEN clock_timestamp() ELSE NULL END WHERE user_id=?""",
                after.state.wire,after.revision.value,array(after.filters?.categories()?.map { it.wire } ?: emptyList()),array(after.filters?.severities()?.map { it.wire } ?: emptyList()),
                after.binding?.version,after.binding?.digest?.value,after.state==NotificationEmailPreferenceState.ENABLED,actor.userId)
        }
        val at=jdbc.queryForObject("SELECT clock_timestamp()",Timestamp::class.java)!!
        jdbc.update("""INSERT INTO notification_email_preference_receipts(command_id,user_id,operation,expected_revision,categories,severities,payload_hash,outcome,result,recorded_at)
            VALUES (?,?,?,?,?::text[],?::text[],?,?,?::jsonb,?)""",command.id.value,actor.userId,command.operation.wire,command.expectedRevision.value,
            array(command.filters?.categories()?.map { it.wire } ?: emptyList()),array(command.filters?.severities()?.map { it.wire } ?: emptyList()),hash,decision.outcome.wire,encode(decision.preference),at)
        jdbc.update("INSERT INTO notification_email_preference_audit VALUES (?,?,?,'COMMAND',?,'COMMAND',?)",UUID.randomUUID(),actor.userId,command.id.value,decision.preference.revision.value,at)
        NotificationEmailPreferenceResult.Recorded(NotificationEmailPreferenceReceipt(command.id,decision.outcome,decision.preference,at.toInstant()))
    }!!
    private fun authorized(actor: InternalUserPrincipal)=actor.roles.any { it==InternalRole.ADMIN || it==InternalRole.OPERATOR } &&
        jdbc.queryForObject("SELECT notification_read_authorized(?,?)",Boolean::class.java,actor.userId,actor.sessionId)==true
    private fun load(user: Long,lock: Boolean): NotificationEmailPreference? {
        val row=jdbc.queryForList("SELECT * FROM notification_email_preferences WHERE user_id=?"+if(lock) " FOR UPDATE" else "",user).singleOrNull()
            ?: return NotificationEmailPreference.disabled()
        return NotificationEmailPreference.restore(NotificationEmailPreferenceState.fromWire(row["state"] as? String),
            NotificationRevision.fromWire((row["revision"] as Number).toLong()) ?: return null,
            if(row["state"]==NotificationEmailPreferenceState.ENABLED.wire) NotificationEmailFilters.create(strings(row["categories"]).map(NotificationCategory::fromWire),strings(row["severities"]).map(NotificationSeverity::fromWire)) else null,
            (row["email_version"] as? Number)?.let { NotificationEmailBinding.create(it.toLong(),row["email_digest"] as? String) })
    }
    private fun encode(value: NotificationEmailPreference)=mapper.writeValueAsString(linkedMapOf("state" to value.state.wire,"revision" to value.revision.value.toString(),
        "categories" to (value.filters?.categories()?.map { it.wire } ?: emptyList()),"severities" to (value.filters?.severities()?.map { it.wire } ?: emptyList()),
        "emailVersion" to value.binding?.version?.toString(),"emailDigest" to value.binding?.digest?.value))
    private fun decode(raw: String): NotificationEmailPreference?=runCatching {
        val node=mapper.readTree(raw)
        require(node.isObject && node.fieldNames().asSequence().toSet()==setOf("state","revision","categories","severities","emailVersion","emailDigest"))
        require(node["state"].isTextual && node["revision"].isTextual && node["categories"].isArray && node["severities"].isArray &&
            node["categories"].all { it.isTextual } && node["severities"].all { it.isTextual })
        val rev=node["revision"].textValue(); require(rev.toLong().toString()==rev)
        val state=NotificationEmailPreferenceState.fromWire(node["state"].textValue())
        val filters=if(state==NotificationEmailPreferenceState.ENABLED) NotificationEmailFilters.create(node["categories"].map { NotificationCategory.fromWire(it.textValue()) },node["severities"].map { NotificationSeverity.fromWire(it.textValue()) }) else null
        if(state!=NotificationEmailPreferenceState.ENABLED) require(node["categories"].isEmpty && node["severities"].isEmpty && node["emailVersion"].isNull && node["emailDigest"].isNull)
        val binding=if(node["emailVersion"].isTextual && node["emailDigest"].isTextual) NotificationEmailBinding.create(node["emailVersion"].textValue().toLong(),node["emailDigest"].textValue()) else null
        NotificationEmailPreference.restore(state,requireNotNull(NotificationRevision.fromWire(rev.toLong())),filters,binding)
    }.getOrNull()
    private fun strings(raw: Any?): List<String> = (raw as? java.sql.Array)?.array?.let { (it as Array<*>).map { value -> value as String } } ?: emptyList()
    private fun array(values: List<String>)="{"+values.joinToString(",")+"}"
}
