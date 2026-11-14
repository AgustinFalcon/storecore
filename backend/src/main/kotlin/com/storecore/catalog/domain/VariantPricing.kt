package com.storecore.catalog.domain

import com.storecore.offers.domain.DiscountKind
import java.math.BigDecimal

/** Exact ARS boundary: no coercion, rounding or implicit zero. */
class ArsAmount private constructor(val value: BigDecimal) {
    companion object {
        private val decimal = Regex("(?:0|[1-9][0-9]*)(?:\\.[0-9]{1,2})?")
        private val maximum = BigDecimal("999999999999.99")
        fun fromWire(raw: Any?): ArsAmount? {
            val text = when(raw) { is BigDecimal -> raw.toPlainString(); is Number -> raw.toString(); is String -> raw; else -> return null }
            if (!decimal.matches(text)) return null
            val value = text.toBigDecimalOrNull() ?: return null
            return value.takeIf { it >= BigDecimal.ZERO && it <= maximum }?.let(::ArsAmount)
        }
    }
}

enum class VariantPriceMode { INHERITED, OVERRIDE, UNKNOWN }
data class VariantPricePolicyView(val mode: VariantPriceMode, val base: BigDecimal?)
sealed class VariantBasePricePolicy {
    abstract val amount: BigDecimal?
    abstract val view: VariantPricePolicyView
    data class Inherited(override val amount: BigDecimal): VariantBasePricePolicy() { override val view get() = VariantPricePolicyView(VariantPriceMode.INHERITED, null) }
    data class Override(override val amount: BigDecimal): VariantBasePricePolicy() { override val view get() = VariantPricePolicyView(VariantPriceMode.OVERRIDE, amount) }
    data object Unknown: VariantBasePricePolicy() { override val amount: BigDecimal? = null; override val view = VariantPricePolicyView(VariantPriceMode.UNKNOWN, null) }
    companion object {
        fun fromPersistence(productBase: Any?, override: Any?): VariantBasePricePolicy {
            val parent = ArsAmount.fromWire(productBase) ?: return Unknown
            return if (override == null) Inherited(parent.value) else ArsAmount.fromWire(override)?.let { Override(it.value) } ?: Unknown
        }
    }
}

enum class VariantPriceCommandMode { PRESERVE, INHERIT, OVERRIDE, UNKNOWN;
    companion object { fun fromWire(raw: Any?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}
sealed class VariantPriceCommand {
    data object Preserve: VariantPriceCommand()
    data object Inherit: VariantPriceCommand()
    data class Override(val amount: ArsAmount): VariantPriceCommand()
    data object Unknown: VariantPriceCommand()
    companion object {
        fun fromWire(present: Boolean, raw: Any?, existing: Boolean): VariantPriceCommand {
            if (!present) return if(existing) Preserve else Inherit
            val row = raw as? Map<*, *> ?: return Unknown
            if (row.keys.any { it != "mode" && it != "base" }) return Unknown
            return when(VariantPriceCommandMode.fromWire(row["mode"])) {
                VariantPriceCommandMode.PRESERVE -> if(existing && !row.containsKey("base")) Preserve else Unknown
                VariantPriceCommandMode.INHERIT -> if(!row.containsKey("base")) Inherit else Unknown
                VariantPriceCommandMode.OVERRIDE -> ArsAmount.fromWire(row["base"])?.let(::Override) ?: Unknown
                VariantPriceCommandMode.UNKNOWN -> Unknown
            }
        }
    }
}

enum class PriceResolutionState { KNOWN, UNKNOWN }
enum class PriceUnknownReason { INVALID_BASE, INVALID_OFFER, SKU_UNAVAILABLE }
sealed class SkuPriceResolution {
    abstract val state: PriceResolutionState
    data class Known(val price: PriceProjection): SkuPriceResolution() { override val state = PriceResolutionState.KNOWN }
    data class Unknown(val reason: PriceUnknownReason): SkuPriceResolution() { override val state = PriceResolutionState.UNKNOWN }
    fun knownPrice(): PriceProjection? = (this as? Known)?.price
}
data class SkuOffer(val id: String, val name: String, val kind: DiscountKind, val value: BigDecimal?)

/** Shared pure policy for batch projections and single-SKU authority. */
object SkuPricePolicy {
    fun resolve(policy: VariantBasePricePolicy, offer: SkuOffer?): SkuPriceResolution {
        val base = ArsAmount.fromWire(policy.amount)?.value ?: return SkuPriceResolution.Unknown(PriceUnknownReason.INVALID_BASE)
        val discount = if(offer == null) BigDecimal.ZERO else {
            val value=ArsAmount.fromWire(offer.value)?.value ?: return SkuPriceResolution.Unknown(PriceUnknownReason.INVALID_OFFER)
            if(offer.id.isBlank() || offer.name.isBlank() || value.signum() <= 0 || offer.kind == DiscountKind.UNKNOWN || (offer.kind == DiscountKind.PERCENT && value > BigDecimal(100)))
                return SkuPriceResolution.Unknown(PriceUnknownReason.INVALID_OFFER)
            offer.kind.discount(base, value) ?: return SkuPriceResolution.Unknown(PriceUnknownReason.INVALID_OFFER)
        }
        return SkuPriceResolution.Known(PriceProjection(base, base, base.subtract(discount), offer?.let { OfferProjection(it.id,it.name) }))
    }
}
