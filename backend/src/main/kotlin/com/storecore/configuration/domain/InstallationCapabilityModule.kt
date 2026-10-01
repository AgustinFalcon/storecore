package com.storecore.configuration.domain

class InstallationCapabilityModule private constructor(
    val wire: String,
    val visibleOnConsole: Boolean,
) {
    companion object {
        private const val COMPANION_WIRE = "BLACKSTORE_INTEGRATION"
        private val COMPANION = InstallationCapabilityModule(COMPANION_WIRE, false)
        private val CONSOLE = listOf(
            "STOREFRONT",
            "CATALOG",
            "PROFILE_CONTENT",
            "PAYMENTS_MP",
            "MANUAL_FULFILLMENT",
            "MARKETPLACE_ML",
            "MANUAL_PROMOTIONS",
            "ML_COMPETITION_INSIGHTS",
            "ML_PRICE_AUTOMATION",
            "ML_PROMOTION_ORCHESTRATOR",
            "WEB_CROSS_SELL_DISCOUNTS",
            "COMMERCIAL_CALENDAR",
            "FAVORITES",
            "LOYALTY",
            "CARRIERS",
            "ML_VIRTUAL_KITS",
        ).associateWith { InstallationCapabilityModule(it, true) }

        fun fromWire(raw: String): InstallationCapabilityModule = when (raw) {
            COMPANION_WIRE -> COMPANION
            else -> CONSOLE[raw] ?: InstallationCapabilityModule(raw, false)
        }
    }
}
