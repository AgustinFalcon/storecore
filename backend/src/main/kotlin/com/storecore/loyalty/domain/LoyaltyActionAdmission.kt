package com.storecore.loyalty.domain

import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.domain.CapabilityState
import com.storecore.identity.domain.InternalRole
import java.util.UUID

enum class LoyaltyAction(val wire: String) {
    READ_SELF("READ_SELF"),
    READ_ADMIN("READ_ADMIN"),
    RESERVE("RESERVE"),
    BIND_CHECKOUT("BIND_CHECKOUT"),
    CANCEL_HELD("CANCEL_HELD"),
    EXPIRE_QUOTED("EXPIRE_QUOTED"),
    ADMIN_ADJUST("ADMIN_ADJUST"),
    TERMINAL_SETTLE("TERMINAL_SETTLE"),
    UNKNOWN("UNKNOWN");

    val isSafetyOrRead: Boolean
        get() = this in SAFETY_OR_READ_ACTIONS

    companion object {
        private val SAFETY_OR_READ_ACTIONS = setOf(
            READ_SELF,
            READ_ADMIN,
            CANCEL_HELD,
            EXPIRE_QUOTED,
            TERMINAL_SETTLE,
        )

        fun fromWire(raw: String?): LoyaltyAction =
            entries.firstOrNull { it != UNKNOWN && it.wire == raw } ?: UNKNOWN
    }
}

enum class LoyaltyKillSwitchStatus {
    NONE,
    ACTIVE,
    CORRUPT,
}

enum class LoyaltyAdmissionDenial {
    UNKNOWN_ACTION,
    ACTOR_NOT_AUTHORIZED,
    KILL_SWITCH_ACTIVE,
    KILL_SWITCH_CORRUPT,
    MODULE_CONFIG_INVALID,
    MODULE_DISABLED,
    MODULE_READ_ONLY,
    MODULE_PAUSED,
    MODULE_ERROR,
}

sealed interface LoyaltyAdmissionDecision {
    data object Admitted : LoyaltyAdmissionDecision
    data class Denied(val reason: LoyaltyAdmissionDenial) : LoyaltyAdmissionDecision
}

/**
 * Closed matrix over LoyaltyAction, CapabilityState, kill switches and CapabilityActor.
 * READ_ONLY, PAUSED, ERROR and DISABLED admit reads and safety actions (CANCEL_HELD, EXPIRE_QUOTED,
 * TERMINAL_SETTLE) unless an active or corrupt kill switch applies; RESERVE, BIND_CHECKOUT and
 * ADMIN_ADJUST require ACTIVE with no active or corrupt kill switch.
 */
object LoyaltyActionAdmission {
    private val CUSTOMER_ACTIONS = setOf(
        LoyaltyAction.READ_SELF,
        LoyaltyAction.RESERVE,
        LoyaltyAction.BIND_CHECKOUT,
        LoyaltyAction.CANCEL_HELD,
    )
    private val ADMIN_ACTIONS = setOf(
        LoyaltyAction.READ_ADMIN,
        LoyaltyAction.ADMIN_ADJUST,
    )
    private val SYSTEM_ACTIONS = setOf(
        LoyaltyAction.EXPIRE_QUOTED,
        LoyaltyAction.TERMINAL_SETTLE,
    )

    fun evaluate(
        action: LoyaltyAction,
        actor: CapabilityActor,
        moduleState: CapabilityState,
        killSwitch: LoyaltyKillSwitchStatus,
    ): LoyaltyAdmissionDecision {
        if (action == LoyaltyAction.UNKNOWN) {
            return LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.UNKNOWN_ACTION)
        }
        if (!actorPermitted(action, actor)) {
            return LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.ACTOR_NOT_AUTHORIZED)
        }
        when (killSwitch) {
            LoyaltyKillSwitchStatus.CORRUPT ->
                return LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.KILL_SWITCH_CORRUPT)
            LoyaltyKillSwitchStatus.ACTIVE ->
                return LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.KILL_SWITCH_ACTIVE)
            LoyaltyKillSwitchStatus.NONE -> Unit
        }
        return when (moduleState) {
            CapabilityState.UNKNOWN ->
                LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.MODULE_CONFIG_INVALID)
            CapabilityState.ACTIVE ->
                LoyaltyAdmissionDecision.Admitted
            CapabilityState.READ_ONLY ->
                if (action.isSafetyOrRead) LoyaltyAdmissionDecision.Admitted
                else LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.MODULE_READ_ONLY)
            CapabilityState.PAUSED ->
                if (action.isSafetyOrRead) LoyaltyAdmissionDecision.Admitted
                else LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.MODULE_PAUSED)
            CapabilityState.ERROR ->
                if (action.isSafetyOrRead) LoyaltyAdmissionDecision.Admitted
                else LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.MODULE_ERROR)
            CapabilityState.DISABLED ->
                if (action.isSafetyOrRead) LoyaltyAdmissionDecision.Admitted
                else LoyaltyAdmissionDecision.Denied(LoyaltyAdmissionDenial.MODULE_DISABLED)
        }
    }

    private fun actorPermitted(action: LoyaltyAction, actor: CapabilityActor): Boolean = when (actor) {
        CapabilityActor.Public -> false
        CapabilityActor.System -> action in SYSTEM_ACTIONS
        is CapabilityActor.Customer ->
            actor.principal.customerId > 0 && action in CUSTOMER_ACTIONS
        is CapabilityActor.Internal ->
            InternalRole.ADMIN in actor.principal.roles && action in ADMIN_ACTIONS
    }
}

sealed interface LoyaltyCheckoutSelection {
    data object None : LoyaltyCheckoutSelection

    class Reservation private constructor(
        val reservationId: UUID,
        val expectedReservationRevision: LoyaltyRevision,
    ) : LoyaltyCheckoutSelection {
        override fun equals(other: Any?): Boolean =
            other is Reservation &&
                reservationId == other.reservationId &&
                expectedReservationRevision == other.expectedReservationRevision

        override fun hashCode(): Int = 31 * reservationId.hashCode() + expectedReservationRevision.hashCode()

        companion object {
            fun of(reservationId: UUID?, expectedRevision: Long?): LoyaltyCheckoutSelection {
                if (reservationId == null || reservationId == UUID(0, 0) || expectedRevision == null || expectedRevision < 0) {
                    return Invalid
                }
                val revision = LoyaltyRevision.fromWire(expectedRevision.toString()) ?: return Invalid
                return Reservation(reservationId, revision)
            }
        }
    }

    data object Invalid : LoyaltyCheckoutSelection
}
