package com.storecore.loyalty.application

import com.storecore.loyalty.domain.*
import java.time.Instant
import java.util.UUID

data class LoyaltyPersistedReservation(
    val id: String?,
    val walletId: String?,
    val customerId: String?,
    val cartRevision: String?,
    val walletRevision: String?,
    val revision: String?,
    val policy: String?,
    val state: String?,
    val points: String?,
    val createdAt: Instant,
    val expiresAt: Instant,
)

data class LoyaltyPersistedReservationAllocation(
    val reservationId: String?,
    val walletId: String?,
    val ordinal: Int?,
    val lotId: String?,
    val points: String?,
)

enum class LoyaltyReservationUnavailableReason { CORRUPT_EVIDENCE }

sealed class LoyaltyReservationRead {
    class Available(val reservation: LoyaltyReservationAggregate) : LoyaltyReservationRead()
    class Unavailable(val reason: LoyaltyReservationUnavailableReason) : LoyaltyReservationRead()
}

/** One boundary translates all untrusted rows before the complete aggregate can escape. */
object LoyaltyReservationTranslator {
    fun fromWire(
        row: LoyaltyPersistedReservation,
        allocations: List<LoyaltyPersistedReservationAllocation>,
        walletId: Long,
        customerId: Long,
        now: Instant,
    ): LoyaltyReservationRead {
        fun corrupt() = LoyaltyReservationRead.Unavailable(LoyaltyReservationUnavailableReason.CORRUPT_EVIDENCE)
        val id = canonicalUuid(row.id) ?: return corrupt()
        val ownerWallet = positiveIdentity(row.walletId) ?: return corrupt()
        val ownerCustomer = positiveIdentity(row.customerId) ?: return corrupt()
        if (ownerWallet != walletId || ownerCustomer != customerId) return corrupt()
        val cartRevision = LoyaltyRevision.fromWire(row.cartRevision) ?: return corrupt()
        val walletRevision = LoyaltyRevision.fromWire(row.walletRevision) ?: return corrupt()
        val revision = LoyaltyRevision.fromWire(row.revision) ?: return corrupt()
        val policy = LoyaltyPolicyId.fromWire(row.policy)
        val state = LoyaltyReservationState.fromWire(row.state)
        val points = LoyaltyPoints.fromWire(row.points) ?: return corrupt()
        val window = LoyaltyReservationWindow.create(row.createdAt) ?: return corrupt()
        if (window.expiresAt != row.expiresAt) return corrupt()
        val translated = allocations.map { allocation ->
            if (canonicalUuid(allocation.reservationId) != id || positiveIdentity(allocation.walletId) != walletId) return corrupt()
            LoyaltyReservationAllocation.create(
                allocation.ordinal ?: return corrupt(),
                positiveIdentity(allocation.lotId) ?: return corrupt(),
                LoyaltyPoints.fromWire(allocation.points) ?: return corrupt(),
            ) ?: return corrupt()
        }
        val aggregate = LoyaltyReservationAggregate.create(id, ownerWallet, ownerCustomer, cartRevision,
            walletRevision, revision, policy, state, points, window, translated, now) ?: return corrupt()
        return LoyaltyReservationRead.Available(aggregate)
    }

    private fun positiveIdentity(raw: String?): Long? = LoyaltyPoints.fromWire(raw)?.value?.takeIf { it > 0 }

    private fun canonicalUuid(raw: String?): UUID? {
        if (raw == null) return null
        return try {
            UUID.fromString(raw).takeIf { it != UUID(0, 0) && it.toString() == raw }
        } catch (_: IllegalArgumentException) {
            null
        }
    }
}
