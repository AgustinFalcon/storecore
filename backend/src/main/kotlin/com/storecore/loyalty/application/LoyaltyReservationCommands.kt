package com.storecore.loyalty.application

import com.storecore.loyalty.domain.*
import java.util.UUID

/** Typed application input assembled only after authentication and strict wire translation. */
class LoyaltyReservationQuoteCommand private constructor(
    val binding: LoyaltyCommandBinding,
    val customerId: Long,
    val cartRevision: LoyaltyRevision,
    val expectedWalletRevision: LoyaltyRevision,
    val points: LoyaltyPoints,
) {
    companion object {
        fun create(
            binding: LoyaltyCommandBinding,
            customerId: Long,
            cartRevision: String?,
            expectedWalletRevision: String?,
            points: String?,
        ): LoyaltyReservationQuoteCommand? {
            if (customerId <= 0 || binding.realm != LoyaltyRealm.CUSTOMER || binding.actorId != customerId ||
                binding.operation != LoyaltyCommandOperation.CREATE_RESERVATION ||
                binding.aggregateType != LoyaltyAggregateType.WALLET) return null
            val cart = LoyaltyRevision.fromWire(cartRevision) ?: return null
            val wallet = LoyaltyRevision.fromWire(expectedWalletRevision) ?: return null
            val requested = LoyaltyPoints.fromWire(points)?.takeIf { it.value > 0 } ?: return null
            return LoyaltyReservationQuoteCommand(binding, customerId, cart, wallet, requested)
        }
    }
}

/** CANCEL and explicit SYSTEM expiry share identity/revision shape, not authority or behavior. */
class LoyaltyReservationTerminalCommand private constructor(
    val binding: LoyaltyCommandBinding,
    val reservationId: UUID,
    val actorId: Long,
    val expectedReservationRevision: LoyaltyRevision,
) {
    val step: LoyaltyReservationStep
        get() = when (binding.operation) {
            LoyaltyCommandOperation.CANCEL_RESERVATION -> LoyaltyReservationStep.Cancel
            LoyaltyCommandOperation.EXPIRE_RESERVATION -> LoyaltyReservationStep.Expire
            else -> LoyaltyReservationStep.Unknown
        }

    companion object {
        fun create(
            binding: LoyaltyCommandBinding,
            reservationId: UUID,
            actorId: Long,
            expectedReservationRevision: String?,
        ): LoyaltyReservationTerminalCommand? {
            if (reservationId == UUID(0, 0) || actorId <= 0 || binding.actorId != actorId ||
                binding.aggregateType != LoyaltyAggregateType.RESERVATION ||
                binding.aggregateRef != reservationId.toString()) return null
            val authorityMatches = when (binding.operation) {
                LoyaltyCommandOperation.CANCEL_RESERVATION -> binding.realm == LoyaltyRealm.CUSTOMER
                LoyaltyCommandOperation.EXPIRE_RESERVATION -> binding.realm == LoyaltyRealm.SYSTEM
                else -> false
            }
            if (!authorityMatches) return null
            val revision = LoyaltyRevision.fromWire(expectedReservationRevision) ?: return null
            return LoyaltyReservationTerminalCommand(binding, reservationId, actorId, revision)
        }
    }
}
