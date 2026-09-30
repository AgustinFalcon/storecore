package com.storecore.commerce.domain

class ProjectionSourceCause private constructor(val wire: String) {
    override fun equals(other: Any?) = other is ProjectionSourceCause && other.wire == wire
    override fun hashCode() = wire.hashCode()
    override fun toString() = wire

    companion object {
        val WebReserve = ProjectionSourceCause("WEB_RESERVE")
        val WebRelease = ProjectionSourceCause("WEB_RELEASE")
        val WebExpiry = ProjectionSourceCause("WEB_EXPIRY")
        val InternalAdjustment = ProjectionSourceCause("INTERNAL_ADJUSTMENT")
        val ListingActivated = ProjectionSourceCause("LISTING_ACTIVATED")
        val ListingMappingConfirmed = ProjectionSourceCause("LISTING_MAPPING_CONFIRMED")
        val ListingRemapped = ProjectionSourceCause("LISTING_REMAPPED")
        val ListingPaused = ProjectionSourceCause("LISTING_PAUSED")
        val ListingReactivated = ProjectionSourceCause("LISTING_REACTIVATED")
        val ProductDeactivated = ProjectionSourceCause("PRODUCT_DEACTIVATED")
        val VariantDeactivated = ProjectionSourceCause("VARIANT_DEACTIVATED")
        val ProductReactivated = ProjectionSourceCause("PRODUCT_REACTIVATED")
        val VariantReactivated = ProjectionSourceCause("VARIANT_REACTIVATED")
        val AccountReactivated = ProjectionSourceCause("ACCOUNT_REACTIVATED")
        val CapabilityReactivated = ProjectionSourceCause("CAPABILITY_REACTIVATED")
        val UpgradeQuarantine = ProjectionSourceCause("UPGRADE_QUARANTINE")
        val Unknown = ProjectionSourceCause("unknown")
        private val known = listOf(
            WebReserve, WebRelease, WebExpiry, InternalAdjustment, ListingActivated,
            ListingMappingConfirmed, ListingRemapped, ListingPaused, ListingReactivated,
            ProductDeactivated, VariantDeactivated, ProductReactivated, VariantReactivated,
            AccountReactivated, CapabilityReactivated, UpgradeQuarantine,
        )
        fun fromWire(raw: String?): ProjectionSourceCause {
            val normalized = raw?.trim().orEmpty()
            return known.firstOrNull { it.wire == normalized } ?: Unknown
        }
    }
}
