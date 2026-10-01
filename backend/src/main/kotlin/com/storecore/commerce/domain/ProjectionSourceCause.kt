package com.storecore.commerce.domain

sealed class ProjectionSourceCause {
    abstract val wire: String

    data object WebReserve : ProjectionSourceCause() {
        override val wire: String = "WEB_RESERVE"
    }
    data object WebConsume : ProjectionSourceCause() {
        override val wire: String = "WEB_CONSUME"
    }
    data object WebRelease : ProjectionSourceCause() {
        override val wire: String = "WEB_RELEASE"
    }
    data object WebExpiry : ProjectionSourceCause() {
        override val wire: String = "WEB_EXPIRY"
    }
    data object InternalAdjustment : ProjectionSourceCause() {
        override val wire: String = "INTERNAL_ADJUSTMENT"
    }
    data object ListingActivated : ProjectionSourceCause() {
        override val wire: String = "LISTING_ACTIVATED"
    }
    data object ListingMappingConfirmed : ProjectionSourceCause() {
        override val wire: String = "LISTING_MAPPING_CONFIRMED"
    }
    data object ListingRemapped : ProjectionSourceCause() {
        override val wire: String = "LISTING_REMAPPED"
    }
    data object ListingPaused : ProjectionSourceCause() {
        override val wire: String = "LISTING_PAUSED"
    }
    data object ListingReactivated : ProjectionSourceCause() {
        override val wire: String = "LISTING_REACTIVATED"
    }
    data object ProductDeactivated : ProjectionSourceCause() {
        override val wire: String = "PRODUCT_DEACTIVATED"
    }
    data object VariantDeactivated : ProjectionSourceCause() {
        override val wire: String = "VARIANT_DEACTIVATED"
    }
    data object ProductReactivated : ProjectionSourceCause() {
        override val wire: String = "PRODUCT_REACTIVATED"
    }
    data object VariantReactivated : ProjectionSourceCause() {
        override val wire: String = "VARIANT_REACTIVATED"
    }
    data object AccountReactivated : ProjectionSourceCause() {
        override val wire: String = "ACCOUNT_REACTIVATED"
    }
    data object CapabilityReactivated : ProjectionSourceCause() {
        override val wire: String = "CAPABILITY_REACTIVATED"
    }
    data object UpgradeQuarantine : ProjectionSourceCause() {
        override val wire: String = "UPGRADE_QUARANTINE"
    }
    data object ExternalBlackStoreCommit : ProjectionSourceCause() {
        override val wire: String = "EXTERNAL_BLACKSTORE_COMMIT"
    }
    data object ExternalBlackStoreRelease : ProjectionSourceCause() {
        override val wire: String = "EXTERNAL_BLACKSTORE_RELEASE"
    }
    data object ExternalBlackStoreExpiry : ProjectionSourceCause() {
        override val wire: String = "EXTERNAL_BLACKSTORE_EXPIRY"
    }
    data object Unknown : ProjectionSourceCause() {
        override val wire: String = "unknown"
    }

    companion object {
        fun fromWire(raw: String?): ProjectionSourceCause = when (raw?.trim()) {
            "WEB_RESERVE" -> WebReserve
            "WEB_CONSUME" -> WebConsume
            "WEB_RELEASE" -> WebRelease
            "WEB_EXPIRY" -> WebExpiry
            "INTERNAL_ADJUSTMENT" -> InternalAdjustment
            "LISTING_ACTIVATED" -> ListingActivated
            "LISTING_MAPPING_CONFIRMED" -> ListingMappingConfirmed
            "LISTING_REMAPPED" -> ListingRemapped
            "LISTING_PAUSED" -> ListingPaused
            "LISTING_REACTIVATED" -> ListingReactivated
            "PRODUCT_DEACTIVATED" -> ProductDeactivated
            "VARIANT_DEACTIVATED" -> VariantDeactivated
            "PRODUCT_REACTIVATED" -> ProductReactivated
            "VARIANT_REACTIVATED" -> VariantReactivated
            "ACCOUNT_REACTIVATED" -> AccountReactivated
            "CAPABILITY_REACTIVATED" -> CapabilityReactivated
            "UPGRADE_QUARANTINE" -> UpgradeQuarantine
            "EXTERNAL_BLACKSTORE_COMMIT" -> ExternalBlackStoreCommit
            "EXTERNAL_BLACKSTORE_RELEASE" -> ExternalBlackStoreRelease
            "EXTERNAL_BLACKSTORE_EXPIRY" -> ExternalBlackStoreExpiry
            else -> Unknown
        }
    }
}
