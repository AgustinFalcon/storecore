package com.storecore.identity.application

import com.storecore.identity.domain.*
import java.time.Duration
import java.time.Instant
import java.util.UUID

class IdentityDeliveryLease(
    val eventId: UUID, val owner: UUID, val attempt: Int, val expiresAt: Instant,
    val context: IdentityMessageEncryptionContext, val realm: RecoveryRealm,
    val tokenExpiresAt: Instant, val envelope: IdentityMessageEnvelope,
) {
    init {
        require(attempt in 1..IdentityDeliveryPolicy.MAX_ATTEMPTS)
        require(eventId == context.eventId && realm != RecoveryRealm.Unknown)
    }
}

enum class IdentityDeliveryEligibility { READY, INVALIDATED, EXPIRED, LEASE_LOST, Unknown }
enum class IdentityDeliveryRun { IDLE, SETTLED, LEASE_LOST }

interface IdentityDeliveryQueue {
    /** Cancels/reclaims expired work and crypto-shreds terminal payloads without performing network I/O. */
    fun reapExpired(now: Instant): Int = 0
    /**
     * Short transaction, SKIP LOCKED, increment attempt; reclaim must never resend a begun handoff.
     * Expired leases use IdentityDeliveryPolicy.recoverExpiredLease and terminal outcomes erase secrets.
     */
    fun acquire(owner: UUID, now: Instant, duration: Duration): IdentityDeliveryLease?
    /** Checks token, account eligibility, realm, email digest/version and DB expiry against current identity. */
    fun revalidate(lease: IdentityDeliveryLease, now: Instant): IdentityDeliveryEligibility
    /**
     * CAS lease owner and unexpired deadline; durable handoff_started_at prevents replay after process death.
     * Clear the marker only when committing a proven pre-DATA RETRY; never on an expired-lease reclaim.
     */
    fun beginHandoff(lease: IdentityDeliveryLease, now: Instant): Boolean
    /** Atomic CAS of lease owner and state plus secret destruction for every terminal settlement. */
    fun settle(lease: IdentityDeliveryLease, settlement: IdentityDeliverySettlement, now: Instant): Boolean
}

interface IdentitySmtpTransport {
    /** Implementations classify protocol evidence with SmtpResultClassifier; never expose provider exceptions. */
    fun deliver(message: RenderedIdentityMessage): SmtpDeliveryResult
}

/** Aggregate observer receives closed categories only, with no event, recipient or exception. */
fun interface IdentityDeliveryObserver { fun settled(state: IdentityOutboxState, error: IdentityDeliveryError) }
