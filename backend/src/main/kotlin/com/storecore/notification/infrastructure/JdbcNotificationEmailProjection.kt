package com.storecore.notification.infrastructure

import com.storecore.notification.application.*
import com.storecore.notification.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.transaction.support.TransactionSynchronizationManager

class JdbcNotificationEmailProjection(private val jdbc: JdbcTemplate,private val readiness: NotificationEmailReadinessPort) : NotificationEmailIntentProjection {
    override fun firstAlert(alert: NotificationAlert) {
        check(TransactionSynchronizationManager.isActualTransactionActive())
        if(readiness.current()!=NotificationEmailReadiness.READY) return
        jdbc.update("""WITH candidates AS (
            SELECT p.user_id,p.revision,p.email_version,p.email_digest FROM notification_email_preferences p
            JOIN notification_alerts first_alert ON first_alert.id=?
            CROSS JOIN LATERAL notification_email_account(p.user_id) a
            WHERE p.state='ENABLED' AND ?=ANY(p.categories) AND ?=ANY(p.severities) AND a.eligible AND a.verified
            AND a.email_version=p.email_version AND a.email_digest=p.email_digest AND p.consented_at<=first_alert.created_at
          ), inserted AS (
            INSERT INTO notification_email_outbox(id,alert_id,user_id,preference_revision,email_version,email_digest,template,created_at,expires_at)
            SELECT gen_random_uuid(),?,user_id,revision,email_version,email_digest,'OPERATIONAL_ALERT_V1',statement_timestamp(),statement_timestamp()+interval '24 hours' FROM candidates
            ON CONFLICT(alert_id,user_id) DO NOTHING RETURNING id,created_at
          ) INSERT INTO notification_email_delivery(intent_id,state,attempts,available_at,updated_at,reason)
            SELECT id,'PENDING',0,created_at,created_at,'NONE' FROM inserted""",alert.id.value,alert.category.wire,alert.severity.wire,alert.id.value)
    }
}
