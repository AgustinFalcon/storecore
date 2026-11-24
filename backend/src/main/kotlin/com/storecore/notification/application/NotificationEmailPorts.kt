package com.storecore.notification.application

import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.domain.CanonicalEmail
import com.storecore.notification.domain.*
import java.time.Instant
import java.util.UUID

fun interface NotificationEmailReadinessPort { fun current(): NotificationEmailReadiness }
fun interface NotificationEmailIntentProjection { fun firstAlert(alert: NotificationAlert) }
object NoNotificationEmailProjection : NotificationEmailIntentProjection { override fun firstAlert(alert: NotificationAlert) {} }
class NotificationEmailPreferenceView(val preference: NotificationEmailPreference,val verified: Boolean,val readiness: NotificationEmailReadiness)
class NotificationEmailPreferenceReceipt(val commandId: NotificationCommandId,val outcome: NotificationEmailPreferenceOutcome,
    val preference: NotificationEmailPreference,val recordedAt: Instant)
sealed interface NotificationEmailPreferenceResult {
    class Current(val view: NotificationEmailPreferenceView) : NotificationEmailPreferenceResult
    class Recorded(val receipt: NotificationEmailPreferenceReceipt) : NotificationEmailPreferenceResult
    data object Unauthorized : NotificationEmailPreferenceResult
    data object IdempotencyConflict : NotificationEmailPreferenceResult
    data object Unknown : NotificationEmailPreferenceResult
}
interface NotificationEmailPreferencePort {
    fun get(actor: InternalUserPrincipal): NotificationEmailPreferenceResult
    fun execute(actor: InternalUserPrincipal,command: NotificationEmailPreferenceCommand): NotificationEmailPreferenceResult
}
class NotificationEmailLease(val intentId: UUID,val owner: UUID,val attempt: Int,val expiresAt: Instant,val template: NotificationEmailTemplate)
class NotificationEmailHandoff(val destination: CanonicalEmail,val template: NotificationEmailTemplate)
interface NotificationEmailQueue {
    fun acquire(owner: UUID,now: Instant): NotificationEmailLease?
    fun beginHandoff(lease: NotificationEmailLease,now: Instant): NotificationEmailHandoff?
    fun settle(lease: NotificationEmailLease,settlement: NotificationEmailSettlement,now: Instant): Boolean
    fun reap(now: Instant): Int
}
fun interface NotificationEmailTransport { fun send(destination: CanonicalEmail,message: NotificationEmailRendered): NotificationEmailTransportResult }
