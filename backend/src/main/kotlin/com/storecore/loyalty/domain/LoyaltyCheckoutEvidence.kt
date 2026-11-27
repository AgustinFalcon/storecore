package com.storecore.loyalty.domain

import java.time.Instant
import java.util.UUID

@JvmInline
value class CartFingerprint private constructor(val value: String) {
    companion object {
        fun fromWire(raw: String?): CartFingerprint? = raw?.takeIf { it.matches(Regex("[0-9a-f]{64}")) }?.let(::CartFingerprint)
    }
}

/** Snapshot revision is deliberately not interchangeable with wallet or reservation revision. */
@JvmInline
value class LoyaltyEvidenceRevision private constructor(val value: Long) {
    fun next(): LoyaltyEvidenceRevision? = if (value == Long.MAX_VALUE) null else LoyaltyEvidenceRevision(value + 1)
    companion object {
        fun fromWire(raw: String?): LoyaltyEvidenceRevision? = raw?.takeIf { it.matches(Regex("0|[1-9][0-9]*")) }
            ?.toLongOrNull()?.let(::LoyaltyEvidenceRevision)
    }
}

enum class LoyaltyEvidenceKind {
    MERCHANT_ACCOUNTANT_PROFILE, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyEvidenceKind = entries.firstOrNull { it.wire == raw } ?: UNKNOWN }
}

enum class LoyaltyEvidenceCurrency {
    ARS, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyEvidenceCurrency = entries.firstOrNull { it.wire == raw } ?: UNKNOWN }
}

enum class LoyaltyEvidencePurpose { REDEMPTION, EARNING, UNKNOWN }

enum class LoyaltyEvidenceUnavailableReason {
    MISSING_PROFILE, MISSING_TAX_EVIDENCE, WRONG_CURRENCY, CONTRADICTORY_BREAKDOWN,
    STALE_SOURCE, CART_CHANGED, DISCOUNT_PRESENT, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyEvidenceUnavailableReason = entries.firstOrNull { it.wire == raw } ?: UNKNOWN }
}

sealed interface LoyaltyEvidenceAdmission<out T> {
    class Available<T> internal constructor(val snapshot: T) : LoyaltyEvidenceAdmission<T>
    class Unavailable(val reason: LoyaltyEvidenceUnavailableReason) : LoyaltyEvidenceAdmission<Nothing>
}

/** Candidate merchant evidence, validated by the admission step before becoming a frozen line. */
data class LoyaltyPriceProfile(
    val id: Long, val variantId: Long, val revision: LoyaltyEvidenceRevision,
    val currency: LoyaltyEvidenceCurrency, val grossUnit: LoyaltyMinorUnits,
    val merchandiseExcludingTaxUnit: LoyaltyMinorUnits?, val excludedTaxUnit: LoyaltyMinorUnits?,
    val classification: LoyaltyItemClassification, val kind: LoyaltyEvidenceKind,
    val sourceReference: String, val authorizingCommandId: UUID, val recordedAt: Instant,
)

data class LoyaltyCartLine(
    val cartItemId: Long, val variantId: Long, val quantity: Long,
    val originalUnitPrice: LoyaltyMinorUnits, val effectiveUnitPrice: LoyaltyMinorUnits,
    /** PRESENT includes any offer, campaign, manual or other existing discount. */
    val discountState: LoyaltyDiscountState,
)

class LoyaltyFrozenLine internal constructor(
    val cart: LoyaltyCartLine, val source: LoyaltyPriceProfile,
    val grossLineBeforeLoyalty: LoyaltyMinorUnits, val merchandiseExcludingTax: LoyaltyMinorUnits,
    val excludedTax: LoyaltyMinorUnits, val eligiblePreRedemption: LoyaltyMinorUnits,
) {
    internal val identity: List<String> get() = listOf(
        cart.cartItemId.toString(), cart.variantId.toString(), cart.quantity.toString(),
        cart.originalUnitPrice.value.toString(), cart.effectiveUnitPrice.value.toString(), cart.discountState.wire,
        source.id.toString(), source.revision.value.toString(), source.currency.wire, source.classification.wire,
        source.kind.wire, source.sourceReference, source.authorizingCommandId.toString(), source.recordedAt.toString(),
        grossLineBeforeLoyalty.value.toString(), merchandiseExcludingTax.value.toString(), excludedTax.value.toString(), eligiblePreRedemption.value.toString(),
    )
}

internal object LoyaltyCheckedMoney {
    fun sum(values: Iterable<LoyaltyMinorUnits>): LoyaltyMinorUnits? = bounded(values.fold(java.math.BigInteger.ZERO) { sum, value -> sum + value.value.toBigInteger() })
    fun multiply(value: LoyaltyMinorUnits, quantity: Long): LoyaltyMinorUnits? =
        if (quantity <= 0) null else bounded(value.value.toBigInteger() * quantity.toBigInteger())
    fun subtract(value: LoyaltyMinorUnits, discount: LoyaltyMinorUnits): LoyaltyMinorUnits? = bounded(value.value.toBigInteger() - discount.value.toBigInteger())
    private fun bounded(value: java.math.BigInteger): LoyaltyMinorUnits? =
        if (value.signum() < 0 || value > Long.MAX_VALUE.toBigInteger()) null else LoyaltyMinorUnits.of(value.toLong())
}

object LoyaltyEvidenceAdmissionStep {
    fun admit(cart: LoyaltyCartLine, source: LoyaltyPriceProfile?, latestRevision: LoyaltyEvidenceRevision,
              purpose: LoyaltyEvidencePurpose): LoyaltyEvidenceAdmission<LoyaltyFrozenLine> {
        fun unavailable(reason: LoyaltyEvidenceUnavailableReason) = LoyaltyEvidenceAdmission.Unavailable(reason)
        if (purpose == LoyaltyEvidencePurpose.UNKNOWN) return unavailable(LoyaltyEvidenceUnavailableReason.UNKNOWN)
        if (source == null) return unavailable(LoyaltyEvidenceUnavailableReason.MISSING_PROFILE)
        if (source.currency != LoyaltyEvidenceCurrency.ARS) return unavailable(LoyaltyEvidenceUnavailableReason.WRONG_CURRENCY)
        val merchandiseUnit = source.merchandiseExcludingTaxUnit ?: return unavailable(LoyaltyEvidenceUnavailableReason.MISSING_TAX_EVIDENCE)
        val taxUnit = source.excludedTaxUnit ?: return unavailable(LoyaltyEvidenceUnavailableReason.MISSING_TAX_EVIDENCE)
        if (source.kind == LoyaltyEvidenceKind.UNKNOWN || source.classification == LoyaltyItemClassification.UNKNOWN || cart.discountState == LoyaltyDiscountState.UNKNOWN)
            return unavailable(LoyaltyEvidenceUnavailableReason.UNKNOWN)
        val sourceBytes = runCatching { source.sourceReference.loyaltyCanonicalUtf8() }.getOrNull()
        if (source.id <= 0 || cart.cartItemId <= 0 || cart.variantId <= 0 || cart.quantity <= 0 || source.revision.value <= 0 ||
            source.authorizingCommandId == UUID(0, 0) || source.recordedAt.nano != 0 || source.sourceReference.isBlank() ||
            source.sourceReference != source.sourceReference.trim() || source.sourceReference.any { it.isISOControl() } ||
            sourceBytes == null || sourceBytes.size !in 1..128) return unavailable(LoyaltyEvidenceUnavailableReason.UNKNOWN)
        if (source.variantId != cart.variantId || source.revision != latestRevision || source.grossUnit != cart.effectiveUnitPrice)
            return unavailable(LoyaltyEvidenceUnavailableReason.STALE_SOURCE)
        if (LoyaltyCheckedMoney.sum(listOf(merchandiseUnit, taxUnit)) != source.grossUnit ||
            cart.originalUnitPrice.value < cart.effectiveUnitPrice.value ||
            (cart.discountState == LoyaltyDiscountState.NONE && cart.originalUnitPrice != cart.effectiveUnitPrice) ||
            (cart.discountState == LoyaltyDiscountState.PRESENT && cart.originalUnitPrice.value <= cart.effectiveUnitPrice.value))
            return unavailable(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN)
        if (purpose == LoyaltyEvidencePurpose.REDEMPTION && cart.discountState != LoyaltyDiscountState.NONE) return unavailable(LoyaltyEvidenceUnavailableReason.DISCOUNT_PRESENT)
        val gross = LoyaltyCheckedMoney.multiply(source.grossUnit, cart.quantity) ?: return unavailable(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN)
        val merchandise = LoyaltyCheckedMoney.multiply(merchandiseUnit, cart.quantity) ?: return unavailable(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN)
        val tax = LoyaltyCheckedMoney.multiply(taxUnit, cart.quantity) ?: return unavailable(LoyaltyEvidenceUnavailableReason.CONTRADICTORY_BREAKDOWN)
        return LoyaltyEvidenceAdmission.Available(LoyaltyFrozenLine(cart, source, gross, merchandise, tax,
            if (source.classification.isEligible) merchandise else requireNotNull(LoyaltyMinorUnits.of(0))))
    }
}

class LoyaltyUnavailableEarningSnapshot private constructor(
    val cartFingerprint: CartFingerprint, val revision: LoyaltyEvidenceRevision,
    val reason: LoyaltyEvidenceUnavailableReason, val policy: LoyaltyPolicyId = LoyaltyPolicyId.V1,
) {
    val hash = LoyaltyFingerprint.canonical(listOf("loyalty-unavailable-earning-v1", cartFingerprint.value,
        revision.value.toString(), policy.wire, reason.wire))
    companion object {
        fun create(cartFingerprint: CartFingerprint, revision: LoyaltyEvidenceRevision, reason: LoyaltyEvidenceUnavailableReason) =
            LoyaltyUnavailableEarningSnapshot(cartFingerprint, revision, reason)
    }
}
