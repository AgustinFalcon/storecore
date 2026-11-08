package com.storecore.offers.domain

import java.math.BigDecimal
import java.time.Instant

enum class OfferStatus(val wire: String) {
    DRAFT("DRAFT"), ACTIVE("ACTIVE"), PAUSED("PAUSED"), ENDED("ENDED"), UNKNOWN("unknown");

    companion object {
        fun fromWire(raw: String?): OfferStatus = entries.firstOrNull { it.wire == raw } ?: UNKNOWN
    }
}

enum class DiscountKind(val wire: String) {
    PERCENT("PERCENT"), FIXED("FIXED"), UNKNOWN("unknown");

    fun discount(base: BigDecimal, value: BigDecimal): BigDecimal? = when (this) {
        PERCENT -> base.multiply(value).divide(BigDecimal(100), 2, java.math.RoundingMode.HALF_UP).min(base)
        FIXED -> value.min(base)
        UNKNOWN -> null
    }

    companion object {
        fun fromWire(raw: String?): DiscountKind = entries.firstOrNull { it.wire == raw } ?: UNKNOWN
    }
}

sealed class OfferTransition(val wire: String, val target: OfferStatus) {
    data object Activate : OfferTransition("ACTIVATE", OfferStatus.ACTIVE)
    data object Pause : OfferTransition("PAUSE", OfferStatus.PAUSED)
    data object End : OfferTransition("END", OfferStatus.ENDED)
    data object Unknown : OfferTransition("unknown", OfferStatus.UNKNOWN)

    fun accepts(current: OfferStatus): Boolean = when (this) {
        Activate -> current == OfferStatus.DRAFT || current == OfferStatus.PAUSED
        Pause -> current == OfferStatus.ACTIVE
        End -> current == OfferStatus.DRAFT || current == OfferStatus.ACTIVE || current == OfferStatus.PAUSED
        Unknown -> false
    }

    companion object {
        fun fromWire(raw: String?): OfferTransition = when (raw) {
            Activate.wire -> Activate
            Pause.wire -> Pause
            End.wire -> End
            else -> Unknown
        }
    }
}

data class OfferDraft(
    val name: String,
    val priority: Int,
    val startsAt: Instant,
    val endsAt: Instant,
    val discountKind: DiscountKind,
    val discountValue: BigDecimal,
    val minMarginPercent: BigDecimal,
    val skus: List<String>,
)

data class OfferView(
    val id: Long,
    val name: String,
    val status: OfferStatus,
    val priority: Int,
    val startsAt: Instant,
    val endsAt: Instant,
    val discountKind: DiscountKind,
    val discountValue: BigDecimal,
    val minMarginPercent: BigDecimal,
    val skus: List<String>,
    val createdAt: Instant,
    val approvedAt: Instant?,
)
