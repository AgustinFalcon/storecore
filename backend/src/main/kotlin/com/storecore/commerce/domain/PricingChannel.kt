package com.storecore.commerce.domain

import java.math.BigDecimal
import java.time.Instant

enum class PricePolicyStatus {
    DRAFT, ACTIVE, PAUSED, ENDED, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}
enum class PriceScope {
    DEFAULT, CAMPAIGN, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}
enum class PriceCurrency {
    ARS, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}
enum class PriceWriter {
    MANUAL, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}
enum class ChannelState {
    DISABLED, READ_ONLY, ACTIVE, PAUSED, ERROR, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}
enum class ChannelFactState { KNOWN, UNAVAILABLE }
enum class ObservationFreshness { UNVERIFIED, UNAVAILABLE }
enum class ChannelUnavailableReason { EXTERNAL_NOT_AVAILABLE }
data class ChannelObservation<T>(val state: ChannelFactState, val value: T?, val freshness: ObservationFreshness, val reason: ChannelUnavailableReason?) {
    companion object {
        fun <T> historical(value: T?): ChannelObservation<T> = if (value == null)
            ChannelObservation(ChannelFactState.UNAVAILABLE, null, ObservationFreshness.UNAVAILABLE, ChannelUnavailableReason.EXTERNAL_NOT_AVAILABLE)
        else ChannelObservation(ChannelFactState.KNOWN, value, ObservationFreshness.UNVERIFIED, null)
    }
}
sealed class PricePolicyTransition(val target: PricePolicyStatus) {
    abstract fun accepts(status: PricePolicyStatus): Boolean
    data object Activate : PricePolicyTransition(PricePolicyStatus.ACTIVE) {
        override fun accepts(status: PricePolicyStatus) = status == PricePolicyStatus.DRAFT || status == PricePolicyStatus.PAUSED
    }
    data object Pause : PricePolicyTransition(PricePolicyStatus.PAUSED) {
        override fun accepts(status: PricePolicyStatus) = status == PricePolicyStatus.ACTIVE
    }
    data object End : PricePolicyTransition(PricePolicyStatus.ENDED) {
        override fun accepts(status: PricePolicyStatus) = status == PricePolicyStatus.ACTIVE || status == PricePolicyStatus.PAUSED
    }
    data object Unknown : PricePolicyTransition(PricePolicyStatus.UNKNOWN) {
        override fun accepts(status: PricePolicyStatus) = false
    }
    companion object {
        fun fromWire(raw: String?): PricePolicyTransition = when (raw) { "ACTIVATE" -> Activate; "PAUSE" -> Pause; "END" -> End; else -> Unknown }
    }
}
data class ManualPricePolicy(
    val currency: PriceCurrency, val scope: PriceScope, val writer: PriceWriter,
    val basePrice: BigDecimal, val desiredPrice: BigDecimal, val observedPrice: BigDecimal?, val effectivePromoPrice: BigDecimal?,
    val validFrom: Instant, val validTo: Instant,
) {
    fun valid() = currency == PriceCurrency.ARS && scope != PriceScope.UNKNOWN && writer == PriceWriter.MANUAL &&
        listOfNotNull(basePrice, desiredPrice, observedPrice, effectivePromoPrice).all { it.signum() >= 0 && it.scale() <= 2 && it.precision() - it.scale() <= 12 } &&
        (effectivePromoPrice == null || effectivePromoPrice <= desiredPrice) && validTo > validFrom
    fun canActivate(now: Instant) = valid() && validTo > now
}
data class PromoView(val id: String, val listingSku: String, val currency: PriceCurrency, val priceScope: PriceScope,
    val basePrice: BigDecimal, val desiredPrice: BigDecimal, val observedPrice: ChannelObservation<BigDecimal>, val effectivePromoPrice: BigDecimal?,
    val status: PricePolicyStatus, val validFrom: Instant, val validTo: Instant, val writer: PriceWriter, val approvedBy: String?, val approvedAt: Instant?)
data class MercadoLibreAccountView(val accountRef: String?, val status: ChannelState, val availability: ChannelFactState,
    val reason: ChannelUnavailableReason?, val updatedAt: Instant?)
data class MercadoLibreListingView(val listingId: String, val variationId: String, val sku: String, val accountRef: String,
    val status: ChannelState, val desiredQuantity: Int, val desiredPrice: BigDecimal?, val observedQuantity: ChannelObservation<Int>,
    val observedPrice: ChannelObservation<BigDecimal>, val manualInterventionRequired: Boolean, val updatedAt: Instant)
