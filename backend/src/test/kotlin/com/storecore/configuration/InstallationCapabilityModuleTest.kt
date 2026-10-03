package com.storecore.configuration

import com.storecore.configuration.domain.InstallationCapabilityModule
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class InstallationCapabilityModuleTest {
    @Test
    fun `known wires round trip to their closed singleton and preserve console visibility`() {
        val consoleModules = listOf(
            "STOREFRONT" to InstallationCapabilityModule.Storefront,
            "CATALOG" to InstallationCapabilityModule.Catalog,
            "PROFILE_CONTENT" to InstallationCapabilityModule.ProfileContent,
            "PAYMENTS_MP" to InstallationCapabilityModule.PaymentsMp,
            "MANUAL_FULFILLMENT" to InstallationCapabilityModule.ManualFulfillment,
            "MARKETPLACE_ML" to InstallationCapabilityModule.MarketplaceMl,
            "MANUAL_PROMOTIONS" to InstallationCapabilityModule.ManualPromotions,
            "ML_COMPETITION_INSIGHTS" to InstallationCapabilityModule.MlCompetitionInsights,
            "ML_PRICE_AUTOMATION" to InstallationCapabilityModule.MlPriceAutomation,
            "ML_PROMOTION_ORCHESTRATOR" to InstallationCapabilityModule.MlPromotionOrchestrator,
            "WEB_CROSS_SELL_DISCOUNTS" to InstallationCapabilityModule.WebCrossSellDiscounts,
            "COMMERCIAL_CALENDAR" to InstallationCapabilityModule.CommercialCalendar,
            "FAVORITES" to InstallationCapabilityModule.Favorites,
            "LOYALTY" to InstallationCapabilityModule.Loyalty,
            "CARRIERS" to InstallationCapabilityModule.Carriers,
            "ML_VIRTUAL_KITS" to InstallationCapabilityModule.MlVirtualKits,
        )

        consoleModules.forEach { (wire, module) ->
            assertEquals(wire, module.wire)
            assertSame(module, InstallationCapabilityModule.fromWire(wire))
            assertTrue(module.visibleOnConsole)
        }

        assertSame(
            InstallationCapabilityModule.BlackStoreIntegration,
            InstallationCapabilityModule.fromWire("BLACKSTORE_INTEGRATION"),
        )
        assertFalse(InstallationCapabilityModule.BlackStoreIntegration.visibleOnConsole)
    }

    @Test
    fun `invalid wires translate to one hidden Unknown with a fixed wire`() {
        listOf(null, "", " ", "unknown", "catalog", " CATALOG ", "NOT_A_MODULE").forEach { raw ->
            assertSame(InstallationCapabilityModule.Unknown, InstallationCapabilityModule.fromWire(raw))
        }

        assertEquals("unknown", InstallationCapabilityModule.Unknown.wire)
        assertFalse(InstallationCapabilityModule.Unknown.visibleOnConsole)
    }
}
