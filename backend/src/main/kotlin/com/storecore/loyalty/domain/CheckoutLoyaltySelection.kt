package com.storecore.loyalty.domain

import java.util.UUID

/** The absence of redemption is an explicit command choice and part of replay identity. */
sealed interface CheckoutLoyaltySelection {
    data object None : CheckoutLoyaltySelection
    data object Unknown : CheckoutLoyaltySelection
    class Reservation private constructor(val reservationId: UUID, val expectedRevision: LoyaltyRevision) : CheckoutLoyaltySelection {
        companion object {
            internal fun create(id: UUID, revision: LoyaltyRevision) = Reservation(id, revision)
        }
    }

    val replayIdentity: List<String?>
        get() = when (this) {
            None -> listOf(null)
            Unknown -> listOf("UNKNOWN")
            is Reservation -> listOf(reservationId.toString(), expectedRevision.value.toString())
        }

    companion object {
        /** Strict HTTP parsing remains at the boundary; missing is distinct from explicit null. */
        fun fromWire(present: Boolean, reservationId: String?, expectedRevision: String?): CheckoutLoyaltySelection {
            if (!present) return Unknown
            if (reservationId == null && expectedRevision == null) return None
            val id = reservationId?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?.takeIf { it != UUID(0, 0) && it.toString() == reservationId } ?: return Unknown
            val revision = LoyaltyRevision.fromWire(expectedRevision) ?: return Unknown
            return Reservation.create(id, revision)
        }
    }
}
