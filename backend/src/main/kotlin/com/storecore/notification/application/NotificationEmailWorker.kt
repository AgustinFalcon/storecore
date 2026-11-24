package com.storecore.notification.application

import com.storecore.notification.domain.*
import java.time.Clock
import java.util.UUID

sealed interface NotificationEmailWorkerResult {
    data object Skipped : NotificationEmailWorkerResult
    class Settled(val state: NotificationEmailDeliveryState) : NotificationEmailWorkerResult
    data object LeaseLost : NotificationEmailWorkerResult
}
class AcquireNotificationEmailStep(private val queue: NotificationEmailQueue,private val clock: Clock) {
    fun run(owner: UUID)=queue.acquire(owner,clock.instant())
}
class BeginNotificationEmailHandoffStep(private val queue: NotificationEmailQueue,private val readiness: NotificationEmailReadinessPort,private val clock: Clock) {
    fun run(lease: NotificationEmailLease)=if(readiness.current()==NotificationEmailReadiness.READY) queue.beginHandoff(lease,clock.instant()) else null
}
class SendNotificationEmailStep(private val transport: NotificationEmailTransport) {
    fun run(handoff: NotificationEmailHandoff,message: NotificationEmailRendered): NotificationEmailTransportResult = try { transport.send(handoff.destination,message) }
        catch(error: Exception) { if(error is InterruptedException) Thread.currentThread().interrupt(); NotificationEmailTransportResult.Uncertain }
}
class SettleNotificationEmailStep(private val queue: NotificationEmailQueue,private val policy: NotificationEmailRetryPolicy,private val clock: Clock) {
    fun run(lease: NotificationEmailLease,result: NotificationEmailTransportResult): NotificationEmailWorkerResult {
        val settlement=runCatching { policy.settle(result,lease.attempt,clock.instant()) }.getOrElse { NotificationEmailSettlement(NotificationEmailDeliveryState.UNCERTAIN,null) }
        return if(queue.settle(lease,settlement,clock.instant())) NotificationEmailWorkerResult.Settled(settlement.state) else NotificationEmailWorkerResult.LeaseLost
    }
}
/** Explicitly constructed worker only. Production has neither a transport bean nor a scheduler. */
class NotificationEmailWorker(private val queue: NotificationEmailQueue,private val readiness: NotificationEmailReadinessPort,
    transport: NotificationEmailTransport,private val link: NotificationEmailCenterLink,clock: Clock=Clock.systemUTC(),policy: NotificationEmailRetryPolicy=NotificationEmailRetryPolicy()) {
    private val acquire=AcquireNotificationEmailStep(queue,clock)
    private val begin=BeginNotificationEmailHandoffStep(queue,readiness,clock)
    private val send=SendNotificationEmailStep(transport)
    private val settle=SettleNotificationEmailStep(queue,policy,clock)
    fun run(owner: UUID): NotificationEmailWorkerResult {
        if(readiness.current()!=NotificationEmailReadiness.READY) return NotificationEmailWorkerResult.Skipped
        val lease=acquire.run(owner) ?: return NotificationEmailWorkerResult.Skipped
        val message=RenderNotificationEmail.render(lease.template,link) ?: return settle.run(lease,NotificationEmailTransportResult.PermanentPreDataFailure)
        val handoff=begin.run(lease) ?: return NotificationEmailWorkerResult.Skipped
        return settle.run(lease,send.run(handoff,message))
    }
}
