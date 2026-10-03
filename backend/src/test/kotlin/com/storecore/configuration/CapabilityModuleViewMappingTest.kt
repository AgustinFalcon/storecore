package com.storecore.configuration

import com.storecore.configuration.application.CapabilityConfigInvalid
import com.storecore.configuration.application.CapabilityConfigurationMissing
import com.storecore.configuration.application.CapabilityKillSwitchVersionConflict
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.domain.InstallationCapabilityModule
import com.storecore.configuration.infrastructure.capabilityModuleView
import com.storecore.configuration.infrastructure.requireMatchingKillModule
import com.storecore.configuration.infrastructure.web.consoleCapabilityPayload
import com.storecore.configuration.infrastructure.web.requireCapabilityState
import com.storecore.configuration.infrastructure.web.requireConsoleModule
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class CapabilityModuleViewMappingTest {
    @Test
    fun `jdbc boundary maps known wires to their closed types`() {
        val view = capabilityModuleView("STOREFRONT", "ACTIVE", 7)

        assertSame(InstallationCapabilityModule.Storefront, view.module)
        assertSame(CapabilityState.ACTIVE, view.state)
        assertEquals(7, view.configVersion)
    }

    @Test
    fun `jdbc boundary collapses unknown wires without preserving raw text`() {
        val view = capabilityModuleView("UNRECOGNIZED_MODULE", "BROKEN_STATE", 11)

        assertSame(InstallationCapabilityModule.Unknown, view.module)
        assertEquals("unknown", view.module.wire)
        assertSame(CapabilityState.UNKNOWN, view.state)
        assertEquals("unknown", view.state.wire)
    }

    @Test
    fun `console payload preserves known wires and hides companion and unknown modules`() {
        val payload = consoleCapabilityPayload(
            listOf(
                capabilityModuleView("STOREFRONT", "ACTIVE", 7),
                capabilityModuleView("CATALOG", "BROKEN_STATE", 8),
                capabilityModuleView("BLACKSTORE_INTEGRATION", "DISABLED", 3),
                capabilityModuleView("UNRECOGNIZED_MODULE", "DISABLED", 11),
            ),
        )

        assertEquals(
            listOf(
                mapOf("module" to "STOREFRONT", "state" to "ACTIVE", "configVersion" to 7),
                mapOf("module" to "CATALOG", "state" to "unknown", "configVersion" to 8),
            ),
            payload,
        )
    }

    @Test
    fun `console command boundary rejects companion unknown modules and unknown states`() {
        assertSame(InstallationCapabilityModule.Catalog, requireConsoleModule("CATALOG"))
        assertSame(CapabilityState.PAUSED, requireCapabilityState("PAUSED"))
        assertThrows(CapabilityConfigurationMissing::class.java) { requireConsoleModule("BLACKSTORE_INTEGRATION") }
        assertThrows(CapabilityConfigurationMissing::class.java) { requireConsoleModule("NOT_A_MODULE") }
        assertThrows(CapabilityConfigInvalid::class.java) { requireCapabilityState("BROKEN_STATE") }
        assertThrows(CapabilityConfigInvalid::class.java) { requireCapabilityState(" active ") }
    }

    @Test
    fun `kill mutation boundary binds id ownership to the visible module`() {
        requireMatchingKillModule(InstallationCapabilityModule.Catalog, InstallationCapabilityModule.Catalog)

        assertThrows(CapabilityKillSwitchVersionConflict::class.java) {
            requireMatchingKillModule(InstallationCapabilityModule.Catalog, InstallationCapabilityModule.Storefront)
        }
        assertThrows(CapabilityKillSwitchVersionConflict::class.java) {
            requireMatchingKillModule(InstallationCapabilityModule.Catalog, InstallationCapabilityModule.BlackStoreIntegration)
        }
        assertThrows(CapabilityKillSwitchVersionConflict::class.java) {
            requireMatchingKillModule(InstallationCapabilityModule.BlackStoreIntegration, InstallationCapabilityModule.BlackStoreIntegration)
        }
    }
}
