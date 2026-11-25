package com.storecore.commercialcalendar.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.time.Instant

class JdbcCalendarQueries(private val jdbc: JdbcTemplate,private val transactions: TransactionTemplate,mapper: ObjectMapper,hasher: CalendarHasher,
    private val persistence: JdbcCalendarPersistence): CalendarQueryPort {
    private val codec=CalendarSnapshotCodec(mapper,hasher)
    private fun reader(actor: InternalUserPrincipal)=actor.roles.any { it==InternalRole.ADMIN || it==InternalRole.OPERATOR } && jdbc.queryForObject("SELECT notification_read_authorized(?,?)",Boolean::class.java,actor.userId,actor.sessionId)==true
    private fun admin(actor: InternalUserPrincipal)=InternalRole.ADMIN in actor.roles && jdbc.queryForObject("SELECT calendar_admin_authorized(?,?)",Boolean::class.java,actor.userId,actor.sessionId)==true
    private fun epoch(instant: Instant)=BigDecimal.valueOf(instant.epochSecond).add(BigDecimal.valueOf(instant.nano.toLong(),9))
    override fun list(actor: InternalUserPrincipal,query: CalendarEventQuery): CalendarQueryResult<CalendarPage<CalendarEvent>> = transactions.execute {
        if(!reader(actor)) return@execute CalendarQueryResult.Unauthorized
        val rows=jdbc.queryForList("""WITH filtered AS MATERIALIZED (
            SELECT id,snapshot,(snapshot->'definition'->>'startAt')::timestamptz AS start_at FROM calendar_events
            WHERE extract(epoch FROM (snapshot->'definition'->>'startAt')::timestamptz)<?::numeric
             AND extract(epoch FROM (snapshot->'definition'->>'endAt')::timestamptz)>?::numeric
             AND (?::text IS NULL OR lifecycle=?) AND (?::text IS NULL OR snapshot->'definition'->>'audience'=?)),
            selected AS (SELECT * FROM filtered ORDER BY start_at,id LIMIT ? OFFSET ?)
            SELECT (SELECT count(*) FROM filtered) AS total,selected.snapshot FROM (SELECT 1) singleton LEFT JOIN selected ON TRUE ORDER BY selected.start_at,selected.id""",
            epoch(query.to),epoch(query.from),query.lifecycle?.wire,query.lifecycle?.wire,query.audience?.wire,query.audience?.wire,query.paging.size,query.paging.offset)
        if(!reader(actor)) return@execute CalendarQueryResult.Unauthorized
        val items=runCatching { rows.mapNotNull { it["snapshot"]?.let { raw -> codec.event(raw.toString()) } } }.getOrNull() ?: return@execute CalendarQueryResult.Unknown
        if(!reader(actor)) CalendarQueryResult.Unauthorized else CalendarQueryResult.Found(CalendarPage(items,(rows.first()["total"] as Number).toLong(),query.paging))
    }!!
    override fun detail(actor: InternalUserPrincipal,id: CalendarEventId): CalendarQueryResult<CalendarEvent> = transactions.execute {
        if(!reader(actor)) return@execute CalendarQueryResult.Unauthorized
        val rows=jdbc.queryForList("SELECT snapshot FROM calendar_events WHERE id=?",id.value)
        if(!reader(actor)) return@execute CalendarQueryResult.Unauthorized
        if(rows.isEmpty()) return@execute CalendarQueryResult.Missing
        val event=runCatching { codec.event(rows.single()["snapshot"].toString()) }.getOrNull() ?: return@execute CalendarQueryResult.Unknown
        if(!reader(actor)) CalendarQueryResult.Unauthorized else CalendarQueryResult.Found(event)
    }!!
    override fun audit(actor: InternalUserPrincipal,id: CalendarEventId,paging: CalendarPageRequest): CalendarQueryResult<CalendarPage<CalendarReceipt>> = transactions.execute {
        if(!admin(actor)) return@execute CalendarQueryResult.Unauthorized
        if(jdbc.queryForObject("SELECT count(*) FROM calendar_events WHERE id=?",Long::class.java,id.value)==0L) return@execute CalendarQueryResult.Missing
        val rows=jdbc.queryForList("""WITH filtered AS MATERIALIZED (SELECT r.* FROM calendar_command_receipts r JOIN calendar_audit a USING(command_id) WHERE r.event_id=?),
            selected AS (SELECT command_id,recorded_at FROM filtered ORDER BY recorded_at,command_id LIMIT ? OFFSET ?)
            SELECT (SELECT count(*) FROM filtered) AS total,selected.command_id FROM (SELECT 1) singleton LEFT JOIN selected ON TRUE ORDER BY selected.recorded_at,selected.command_id""",id.value,paging.size,paging.offset)
        val receipts=runCatching { rows.mapNotNull { row -> (row["command_id"] as? java.util.UUID)?.let { persistence.historicalReceipt(requireNotNull(CalendarCommandId.fromWire(it))) } } }.getOrNull() ?: return@execute CalendarQueryResult.Unknown
        if(!admin(actor)) return@execute CalendarQueryResult.Unauthorized
        CalendarQueryResult.Found(CalendarPage(receipts,(rows.first()["total"] as Number).toLong(),paging))
    }!!
    override fun reminderSwitch(actor: InternalUserPrincipal): CalendarQueryResult<CalendarReminderSwitch> = transactions.execute {
        if(!admin(actor)) return@execute CalendarQueryResult.Unauthorized
        val value=runCatching { persistence.reminderSwitch() }.getOrNull() ?: return@execute CalendarQueryResult.Unknown
        if(!admin(actor)) CalendarQueryResult.Unauthorized else CalendarQueryResult.Found(value)
    }!!
}
