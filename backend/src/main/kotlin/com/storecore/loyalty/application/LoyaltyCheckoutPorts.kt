package com.storecore.loyalty.application

import com.storecore.configuration.application.CapabilityActionNotAllowed
import com.storecore.configuration.application.CapabilityActorNotAuthorized
import com.storecore.configuration.application.CapabilityConfigInvalid
import com.storecore.configuration.application.CapabilityDisabled
import com.storecore.configuration.application.CapabilityErrorState
import com.storecore.configuration.application.CapabilityKillSwitchActive
import com.storecore.configuration.application.CapabilityKillSwitchInvalid
import com.storecore.configuration.application.CapabilityPaused
import com.storecore.configuration.application.CapabilityReadOnly
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.domain.CustomerPrincipal
import com.storecore.loyalty.domain.CartFingerprint
import com.storecore.loyalty.domain.LoyaltyAction
import com.storecore.loyalty.domain.LoyaltyAdmissionDecision
import com.storecore.loyalty.domain.LoyaltyAdmissionDenial
import com.storecore.loyalty.domain.LoyaltyCartLine
import com.storecore.loyalty.domain.LoyaltyCheckoutSelection
import com.storecore.loyalty.domain.LoyaltyEvidenceAdmission
import com.storecore.loyalty.domain.LoyaltyEvidenceRevision
import com.storecore.loyalty.domain.LoyaltyEvidenceUnavailableReason
import com.storecore.loyalty.domain.LoyaltyFrozenLine
import com.storecore.loyalty.domain.LoyaltyMinorUnits
import com.storecore.loyalty.domain.LoyaltyOrderItemCorrelation
import com.storecore.loyalty.domain.LoyaltyPriceProfile
import com.storecore.loyalty.domain.LoyaltyQuoteEvidence
import java.time.Instant

sealed class LoyaltyCheckoutException(message: String) : RuntimeException(message)
class LoyaltyReservationNotFound : LoyaltyCheckoutException("LOYALTY_RESERVATION_NOT_FOUND")
class LoyaltyCheckoutConflict(code: String) : LoyaltyCheckoutException(code)
class LoyaltyEvidenceIneligible(val reason: LoyaltyEvidenceUnavailableReason) :
    LoyaltyCheckoutException("LOYALTY_EVIDENCE_INELIGIBLE_${reason.wire}")

interface LoyaltyActionAdmissionPort {
    fun admit(action: LoyaltyAction, actor: CapabilityActor): LoyaltyAdmissionDecision

    fun requireAdmitted(action: LoyaltyAction, actor: CapabilityActor) {
        when (val decision = admit(action, actor)) {
            LoyaltyAdmissionDecision.Admitted -> Unit
            is LoyaltyAdmissionDecision.Denied -> when (decision.reason) {
                LoyaltyAdmissionDenial.UNKNOWN_ACTION -> throw CapabilityActionNotAllowed()
                LoyaltyAdmissionDenial.ACTOR_NOT_AUTHORIZED -> throw CapabilityActorNotAuthorized()
                LoyaltyAdmissionDenial.KILL_SWITCH_ACTIVE -> throw CapabilityKillSwitchActive()
                LoyaltyAdmissionDenial.KILL_SWITCH_CORRUPT -> throw CapabilityKillSwitchInvalid()
                LoyaltyAdmissionDenial.MODULE_CONFIG_INVALID -> throw CapabilityConfigInvalid()
                LoyaltyAdmissionDenial.MODULE_DISABLED -> throw CapabilityDisabled()
                LoyaltyAdmissionDenial.MODULE_READ_ONLY -> throw CapabilityReadOnly()
                LoyaltyAdmissionDenial.MODULE_PAUSED -> throw CapabilityPaused()
                LoyaltyAdmissionDenial.MODULE_ERROR -> throw CapabilityErrorState()
            }
        }
    }
}

data class LoyaltyProfileHead(
    val profile: LoyaltyPriceProfile?,
    val latestRevision: LoyaltyEvidenceRevision,
)

data class LoyaltyEligibilityContext(
    val profilesByVariantId: Map<Long, LoyaltyProfileHead>,
    val redemptionFrozenLines: List<LoyaltyFrozenLine>?,
    val redemptionUnavailableReason: LoyaltyEvidenceUnavailableReason?,
)

data class PreparedLoyaltyBind(
    val quote: LoyaltyQuoteEvidence,
    val boundAt: Instant,
)

interface LoyaltyEligibilityPort {
    /** Must be called under held product and variant locks in ascending variant order. */
    fun resolveCheckoutEligibility(
        cartLines: List<LoyaltyCartLine>,
        selection: LoyaltyCheckoutSelection,
    ): LoyaltyEligibilityContext
}

interface LoyaltyCheckoutPort {
    fun admitBind(customer: CustomerPrincipal)

    fun assertLiveCustomerSession(customer: CustomerPrincipal)

    fun prepareRedemptionBind(
        customer: CustomerPrincipal,
        selection: LoyaltyCheckoutSelection.Reservation,
        cartFingerprint: CartFingerprint,
        eligibility: LoyaltyEligibilityContext,
    ): PreparedLoyaltyBind

    fun commitRedemptionBind(
        customer: CustomerPrincipal,
        selection: LoyaltyCheckoutSelection.Reservation,
        prepared: PreparedLoyaltyBind,
        orderId: Long,
        paymentId: Long,
        itemCorrelations: List<LoyaltyOrderItemCorrelation>,
        shippingMinor: LoyaltyMinorUnits,
    )

    fun recordZeroRedemptionEarning(
        orderId: Long,
        paymentId: Long,
        cartFingerprint: CartFingerprint,
        cartLines: List<LoyaltyCartLine>,
        itemIdsByCartItemId: Map<Long, Long>,
        eligibility: LoyaltyEligibilityContext,
        shippingMinor: LoyaltyMinorUnits,
    )
}
