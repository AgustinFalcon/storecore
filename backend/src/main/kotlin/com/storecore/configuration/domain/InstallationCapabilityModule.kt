package com.storecore.configuration.domain

sealed class InstallationCapabilityModule(
    val wire: String,
    val visibleOnConsole: Boolean,
) {
    data object Storefront : InstallationCapabilityModule("STOREFRONT", true)
    data object Catalog : InstallationCapabilityModule("CATALOG", true)
    data object ProfileContent : InstallationCapabilityModule("PROFILE_CONTENT", true)
    data object PaymentsMp : InstallationCapabilityModule("PAYMENTS_MP", true)
    data object ManualFulfillment : InstallationCapabilityModule("MANUAL_FULFILLMENT", true)
    data object MarketplaceMl : InstallationCapabilityModule("MARKETPLACE_ML", true)
    data object ManualPromotions : InstallationCapabilityModule("MANUAL_PROMOTIONS", true)
    data object MlCompetitionInsights : InstallationCapabilityModule("ML_COMPETITION_INSIGHTS", true)
    data object MlPriceAutomation : InstallationCapabilityModule("ML_PRICE_AUTOMATION", true)
    data object MlPromotionOrchestrator : InstallationCapabilityModule("ML_PROMOTION_ORCHESTRATOR", true)
    data object WebCrossSellDiscounts : InstallationCapabilityModule("WEB_CROSS_SELL_DISCOUNTS", true)
    data object CommercialCalendar : InstallationCapabilityModule("COMMERCIAL_CALENDAR", true)
    data object Favorites : InstallationCapabilityModule("FAVORITES", true)
    data object Loyalty : InstallationCapabilityModule("LOYALTY", true)
    data object Carriers : InstallationCapabilityModule("CARRIERS", true)
    data object MlVirtualKits : InstallationCapabilityModule("ML_VIRTUAL_KITS", true)

    data object BlackStoreIntegration : InstallationCapabilityModule("BLACKSTORE_INTEGRATION", false)
    data object Unknown : InstallationCapabilityModule("unknown", false)

    companion object {
        fun fromWire(raw: String?): InstallationCapabilityModule = when (raw) {
            "STOREFRONT" -> Storefront
            "CATALOG" -> Catalog
            "PROFILE_CONTENT" -> ProfileContent
            "PAYMENTS_MP" -> PaymentsMp
            "MANUAL_FULFILLMENT" -> ManualFulfillment
            "MARKETPLACE_ML" -> MarketplaceMl
            "MANUAL_PROMOTIONS" -> ManualPromotions
            "ML_COMPETITION_INSIGHTS" -> MlCompetitionInsights
            "ML_PRICE_AUTOMATION" -> MlPriceAutomation
            "ML_PROMOTION_ORCHESTRATOR" -> MlPromotionOrchestrator
            "WEB_CROSS_SELL_DISCOUNTS" -> WebCrossSellDiscounts
            "COMMERCIAL_CALENDAR" -> CommercialCalendar
            "FAVORITES" -> Favorites
            "LOYALTY" -> Loyalty
            "CARRIERS" -> Carriers
            "ML_VIRTUAL_KITS" -> MlVirtualKits
            "BLACKSTORE_INTEGRATION" -> BlackStoreIntegration
            else -> Unknown
        }
    }
}
