package com.storecore.configuration

import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.domain.InstallationCapabilityModule
import com.storecore.configuration.infrastructure.capabilityModuleView
import com.storecore.configuration.infrastructure.web.consoleCapabilityPayload
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test

class CapabilityModuleViewMappingTest {
    @Test
    fun `jdbc boundary maps a known module to its closed singleton`() {
        val view = capabilityModuleView("STOREFRONT", "ACTIVE", 7)

        assertSame(InstallationCapabilityModule.Storefront, view.module)
        assertEquals(CapabilityState.ACTIVE, view.state)
        assertEquals(7, view.configVersion)
    }

    @Test
    fun `jdbc boundary maps an unknown module to the hidden fixed Unknown`() {
        val view = capabilityModuleView("UNRECOGNIZED_MODULE", "DISABLED", 11)

        assertSame(InstallationCapabilityModule.Unknown, view.module)
        assertEquals("unknown", view.module.wire)
        assertEquals(false, view.module.visibleOnConsole)
        assertEquals(CapabilityState.DISABLED, view.state)
        assertEquals(11, view.configVersion)
    }

    @Test
    fun `console payload preserves known wires and hides companion and Unknown`() {
        val payload = consoleCapabilityPayload(
            listOf(
                capabilityModuleView("STOREFRONT", "ACTIVE", 7),
                capabilityModuleView("BLACKSTORE_INTEGRATION", "DISABLED", 3),
                capabilityModuleView("UNRECOGNIZED_MODULE", "DISABLED", 11),
            ),
        )

        assertEquals(
            listOf(mapOf("module" to "STOREFRONT", "state" to "ACTIVE", "configVersion" to 7)),
            payload,
        )
    }
}
