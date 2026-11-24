package com.storecore.notification.infrastructure

import com.storecore.identity.domain.CanonicalEmail
import com.storecore.notification.application.*
import com.storecore.notification.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

/** Queue operations commit independently; no transport executes inside these transactions. */
class JdbcNotificationEmailQueue(private val jdbc: JdbcTemplate,transactions: TransactionTemplate,
    private val policy: NotificationEmailRetryPolicy=NotificationEmailRetryPolicy()) : NotificationEmailQueue {
    private val transactions=TransactionTemplate(requireNotNull(transactions.transactionManager)).apply { propagationBehavior=TransactionDefinition.PROPAGATION_REQUIRES_NEW }
    override fun acquire(owner: UUID,now: Instant): NotificationEmailLease?=transactions.execute {
        require(owner!=UUID(0,0)); reapInside(now)
        val row=jdbc.queryForList("""SELECT d.intent_id,o.template FROM notification_email_delivery d JOIN notification_email_outbox o ON o.id=d.intent_id
            WHERE d.state IN ('PENDING','RETRY') AND d.available_at<=GREATEST(clock_timestamp(),?::timestamptz)
            AND o.expires_at>GREATEST(clock_timestamp(),?::timestamptz) AND d.attempts<5
            ORDER BY d.available_at,d.intent_id LIMIT 1 FOR UPDATE OF d SKIP LOCKED""",Timestamp.from(now),Timestamp.from(now)).singleOrNull() ?: return@execute null
        val lease=jdbc.queryForMap("""UPDATE notification_email_delivery SET state='LEASED',attempts=attempts+1,lease_owner=?,
            lease_until=GREATEST(clock_timestamp(),?::timestamptz)+interval '60 seconds',updated_at=clock_timestamp(),reason='NONE'
            WHERE intent_id=? RETURNING attempts,lease_until""",owner,Timestamp.from(now),row["intent_id"])
        NotificationEmailLease(row["intent_id"] as UUID,owner,(lease["attempts"] as Number).toInt(),(lease["lease_until"] as Timestamp).toInstant(),NotificationEmailTemplate.fromWire(row["template"] as? String))
    }
    override fun beginHandoff(lease: NotificationEmailLease,now: Instant): NotificationEmailHandoff?=transactions.execute {
        val destination=jdbc.queryForObject("SELECT notification_email_begin_handoff(?,?,?,?,?)",String::class.java,lease.intentId,lease.owner,lease.attempt,Timestamp.from(lease.expiresAt),Timestamp.from(now))
            ?: return@execute null
        NotificationEmailHandoff(CanonicalEmail.fromWire(destination) ?: error("Invalid verified email binding"),lease.template)
    }
    override fun settle(lease: NotificationEmailLease,settlement: NotificationEmailSettlement,now: Instant): Boolean=transactions.execute {
        if(settlement.state !in setOf(NotificationEmailDeliveryState.SENT,NotificationEmailDeliveryState.RETRY,NotificationEmailDeliveryState.UNCERTAIN,NotificationEmailDeliveryState.DEAD,NotificationEmailDeliveryState.CANCELLED)) return@execute false
        jdbc.update("""UPDATE notification_email_delivery SET state=?,available_at=COALESCE(?::timestamptz,available_at),lease_owner=NULL,lease_until=NULL,
            handoff_started_at=CASE WHEN ? THEN NULL ELSE handoff_started_at END,terminal_at=CASE WHEN ? THEN clock_timestamp() ELSE NULL END,
            updated_at=clock_timestamp(),reason=? WHERE intent_id=? AND state='LEASED' AND lease_owner=? AND attempts=? AND lease_until=?
            AND lease_until>GREATEST(clock_timestamp(),?::timestamptz)""",settlement.state.wire,settlement.retryAt?.let(Timestamp::from),
            settlement.state==NotificationEmailDeliveryState.RETRY,settlement.state.terminal,reason(settlement.state,lease.attempt).wire,lease.intentId,lease.owner,lease.attempt,Timestamp.from(lease.expiresAt),Timestamp.from(now))==1
    }==true
    override fun reap(now: Instant): Int=transactions.execute { reapInside(now) } ?: 0
    private fun reapInside(now: Instant): Int {
        val rows=jdbc.queryForList("""SELECT d.*,o.expires_at FROM notification_email_delivery d JOIN notification_email_outbox o ON o.id=d.intent_id
            WHERE (d.state IN ('PENDING','RETRY') AND o.expires_at<=GREATEST(clock_timestamp(),?::timestamptz))
            OR (d.state='LEASED' AND (d.lease_until<=GREATEST(clock_timestamp(),?::timestamptz) OR o.expires_at<=GREATEST(clock_timestamp(),?::timestamptz)))
            ORDER BY d.intent_id LIMIT 100 FOR UPDATE OF d SKIP LOCKED""",Timestamp.from(now),Timestamp.from(now),Timestamp.from(now))
        rows.forEach { row ->
            val checked=maxOf(now,jdbc.queryForObject("SELECT clock_timestamp()",Timestamp::class.java)!!.toInstant())
            val started=row["handoff_started_at"]!=null
            val settlement=when {
                started -> NotificationEmailSettlement(NotificationEmailDeliveryState.UNCERTAIN,null)
                (row["expires_at"] as Timestamp).toInstant()<=checked -> NotificationEmailSettlement(NotificationEmailDeliveryState.CANCELLED,null)
                else -> policy.retry((row["attempts"] as Number).toInt(),checked)
            }
            jdbc.update("""UPDATE notification_email_delivery SET state=?,available_at=COALESCE(?::timestamptz,available_at),lease_owner=NULL,lease_until=NULL,
                handoff_started_at=CASE WHEN ? THEN NULL ELSE handoff_started_at END,terminal_at=CASE WHEN ? THEN clock_timestamp() ELSE NULL END,
                updated_at=clock_timestamp(),reason=? WHERE intent_id=?""",settlement.state.wire,settlement.retryAt?.let(Timestamp::from),
                settlement.state==NotificationEmailDeliveryState.RETRY,settlement.state.terminal,
                (if(started) NotificationEmailDeliveryReason.UNCERTAIN else if(settlement.state==NotificationEmailDeliveryState.CANCELLED) NotificationEmailDeliveryReason.EXPIRED else NotificationEmailDeliveryReason.LEASE_LOST).wire,row["intent_id"])
        }
        return rows.size
    }
    private fun reason(state: NotificationEmailDeliveryState,attempt: Int)=when(state) {
        NotificationEmailDeliveryState.SENT -> NotificationEmailDeliveryReason.NONE
        NotificationEmailDeliveryState.RETRY -> NotificationEmailDeliveryReason.PRE_DATA_FAILURE
        NotificationEmailDeliveryState.UNCERTAIN -> NotificationEmailDeliveryReason.UNCERTAIN
        NotificationEmailDeliveryState.DEAD -> if(attempt>=5) NotificationEmailDeliveryReason.PRE_DATA_FAILURE else NotificationEmailDeliveryReason.PERMANENT_FAILURE
        NotificationEmailDeliveryState.CANCELLED -> NotificationEmailDeliveryReason.INVALIDATED
        else -> error("Unknown notification email settlement")
    }
}
