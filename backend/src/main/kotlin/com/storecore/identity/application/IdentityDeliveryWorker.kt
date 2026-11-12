package com.storecore.identity.application

import com.storecore.identity.domain.*
import java.time.Clock
import java.util.UUID

class DecryptIdentityDeliveryStep(private val encryption: IdentityMessageEncryption, private val codec: IdentityMessagePayloadCodec) {
    fun execute(lease: IdentityDeliveryLease): IdentityMessagePayload = encryption.decrypt(lease.context, lease.envelope).use { codec.decode(it) }
}

/** No network or long-lived transaction is opened by acquisition or settlement. */
class IdentityDeliveryWorker(
    private val queue: IdentityDeliveryQueue,
    private val decrypt: DecryptIdentityDeliveryStep,
    private val renderer: LocalIdentityMessageRenderer,
    private val smtp: IdentitySmtpTransport,
    private val policy: IdentityDeliveryPolicy,
    private val clock: Clock,
    private val observer: IdentityDeliveryObserver = IdentityDeliveryObserver { _, _ -> },
) {
    fun runOnce(owner: UUID): IdentityDeliveryRun {
        val lease = queue.acquire(owner, clock.instant(), IdentityDeliveryPolicy.LEASE) ?: return IdentityDeliveryRun.IDLE
        if (clock.instant() >= lease.tokenExpiresAt) return settle(lease, SmtpDeliveryResult.EXPIRED)
        val payload = try { decrypt.execute(lease) } catch (_: Exception) {
            return settle(lease, IdentityDeliverySettlement(IdentityOutboxState.DEAD, IdentityDeliveryError.PAYLOAD_INVALID))
        }
        payload.use {
            if (it.kind != lease.context.kind || it.realm != lease.realm || it.expiresAt != lease.tokenExpiresAt)
                return settle(lease, IdentityDeliverySettlement(IdentityOutboxState.DEAD, IdentityDeliveryError.PAYLOAD_INVALID))
            val message = try { renderer.render(lease.eventId, it) } catch (_: Exception) {
                return settle(lease, IdentityDeliverySettlement(IdentityOutboxState.DEAD, IdentityDeliveryError.PAYLOAD_INVALID))
            }
            message.use { rendered ->
                // Last authoritative identity read follows decryption/rendering and immediately precedes handoff.
                when (queue.revalidate(lease, clock.instant())) {
                    IdentityDeliveryEligibility.LEASE_LOST -> return IdentityDeliveryRun.LEASE_LOST
                    IdentityDeliveryEligibility.EXPIRED -> return settle(lease, SmtpDeliveryResult.EXPIRED)
                    IdentityDeliveryEligibility.INVALIDATED, IdentityDeliveryEligibility.Unknown -> return settle(lease, SmtpDeliveryResult.INVALIDATED)
                    IdentityDeliveryEligibility.READY -> Unit
                }
                if (clock.instant() >= lease.tokenExpiresAt) return settle(lease, SmtpDeliveryResult.EXPIRED)
                if (!queue.beginHandoff(lease, clock.instant())) return IdentityDeliveryRun.LEASE_LOST
                // An unclassified transport exception supplies no proof of a pre-DATA failure.
                val result = try { smtp.deliver(rendered) } catch (_: Exception) { SmtpDeliveryResult.ACCEPTANCE_UNCERTAIN }
                return settle(lease, result)
            }
        }
    }

    private fun settle(lease: IdentityDeliveryLease, result: SmtpDeliveryResult) =
        settle(lease, policy.settle(result, lease.attempt, clock.instant()))

    private fun settle(lease: IdentityDeliveryLease, settlement: IdentityDeliverySettlement): IdentityDeliveryRun {
        if (!queue.settle(lease, settlement, clock.instant())) return IdentityDeliveryRun.LEASE_LOST
        // Observability must not affect delivery state or cause a second handoff.
        try { observer.settled(settlement.state, settlement.error) } catch (_: Exception) { }
        return IdentityDeliveryRun.SETTLED
    }
}
