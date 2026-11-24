package com.storecore.notification.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.identity.domain.*
import com.storecore.notification.application.*
import com.storecore.notification.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import java.sql.ResultSet
import java.sql.Timestamp
import java.util.UUID

class JdbcNotificationQueries(private val jdbc: JdbcTemplate,private val transactions: TransactionTemplate,mapper: ObjectMapper) : NotificationQueryPort {
    private val alerts=NotificationAlertRowMapper()
    private val snapshots=NotificationSnapshotCodec(mapper)

    override fun list(actor: InternalUserPrincipal,query: NotificationInboxQuery): NotificationQueryResult<NotificationInboxPage> = transactions.execute {
        if(!canRead(actor) || !authorized(actor)) return@execute NotificationQueryResult.Unauthorized
        val mayTransition=InternalRole.ADMIN in actor.roles && admin(actor)
        val filters=mutableListOf<String>(); val args=mutableListOf<Any>()
        fun filter(column: String,value: String?) { if(value!=null) { filters.add("$column=?"); args.add(value) } }
        filter("severity",query.severity?.wire); filter("category",query.category?.wire)
        filter("lifecycle",query.lifecycle?.wire); filter("source_type",query.source?.wire)
        val where=if(filters.isEmpty()) "" else " WHERE "+filters.joinToString(" AND ")
        val sql="""SELECT page.*,tally.total FROM (SELECT count(*) AS total FROM notification_alerts$where) tally
            LEFT JOIN LATERAL (SELECT * FROM notification_alerts$where ORDER BY created_at DESC,id ASC LIMIT ? OFFSET ?) page ON TRUE
            ORDER BY page.created_at DESC,page.id ASC"""
        val values=(args+args+listOf(query.size,query.offset)).toTypedArray()
        val rows=jdbc.query(sql,{ rs,index -> rs.getLong("total") to if(rs.getObject("id")==null) null else read(rs,index,mayTransition) },*values)
        if(!authorized(actor)) return@execute NotificationQueryResult.Unauthorized
        if(rows.any { it.second==NotificationQueryResult.Unknown }) return@execute NotificationQueryResult.Unknown
        val items=rows.mapNotNull { pair -> when(val value=pair.second) { is NotificationQueryResult.Found -> value.value; else -> null } }
        NotificationQueryResult.Found(NotificationInboxPage(items,rows.first().first,query))
    }!!

    override fun detail(actor: InternalUserPrincipal,id: NotificationId): NotificationQueryResult<NotificationReadAlert> = transactions.execute {
        if(!canRead(actor) || !authorized(actor)) return@execute NotificationQueryResult.Unauthorized
        val mayTransition=InternalRole.ADMIN in actor.roles && admin(actor)
        val row=jdbc.query("SELECT * FROM notification_alerts WHERE id=?",{ rs,index -> read(rs,index,mayTransition) },id.value).singleOrNull()
        if(!authorized(actor)) NotificationQueryResult.Unauthorized else row ?: NotificationQueryResult.Missing
    }!!

    override fun receipt(actor: InternalUserPrincipal,id: NotificationId,commandId: NotificationCommandId): NotificationQueryResult<NotificationCommandReceipt> = transactions.execute {
        if(InternalRole.ADMIN !in actor.roles || !admin(actor)) return@execute NotificationQueryResult.Unauthorized
        // Ownership is part of the SQL predicate; foreign/cross-aggregate receipts never enter the codec.
        val row=jdbc.queryForList("SELECT * FROM notification_command_receipts WHERE command_id=? AND alert_id=? AND actor_id=?",
            commandId.value,id.value,actor.userId).singleOrNull()
        if(!admin(actor)) return@execute NotificationQueryResult.Unauthorized
        if(row==null) return@execute NotificationQueryResult.Missing
        val receipt=runCatching {
            val step=NotificationTransitionStep.fromWire(row["operation"] as? String)
            val reason=requireNotNull(NotificationReason.fromWire(row["reason"] as? String)); require(reason.value==row["reason"])
            val command=requireNotNull(NotificationCommand.ChangeLifecycle.create(commandId,id,requireNotNull(NotificationActorId.fromWire(actor.userId)),
                requireNotNull(NotificationRevision.fromWire((row["expected_revision"] as Number).toLong())),step,reason,(row["recorded_at"] as Timestamp).toInstant()))
            snapshots.receipt(command,row["payload_hash"] as String,row["outcome"] as String,row["before_snapshot"].toString())
        }.getOrNull() ?: return@execute NotificationQueryResult.Unknown
        NotificationQueryResult.Found(receipt)
    }!!

    private fun read(rs: ResultSet,index: Int,mayTransition: Boolean): NotificationQueryResult<NotificationReadAlert> = runCatching {
        NotificationReadAlert.create(alerts.mapRow(rs,index),rs.getTimestamp("created_at").toInstant(),mayTransition)?.let { NotificationQueryResult.Found(it) }
            ?: NotificationQueryResult.Unknown
    }.getOrDefault(NotificationQueryResult.Unknown)
    private fun canRead(actor: InternalUserPrincipal)=actor.roles.any { it==InternalRole.ADMIN || it==InternalRole.OPERATOR }
    private fun authorized(actor: InternalUserPrincipal)=jdbc.queryForObject("SELECT notification_read_authorized(?,?)",Boolean::class.java,actor.userId,actor.sessionId)==true
    private fun admin(actor: InternalUserPrincipal)=jdbc.queryForObject("SELECT notification_admin_authorized(?,?)",Boolean::class.java,actor.userId,actor.sessionId)==true
}
