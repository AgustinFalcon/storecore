package com.storecore.configuration

import com.storecore.configuration.domain.InstallationCapabilityModule
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class InstallationCapabilityModuleTest {
    @Test
    fun `console lists web modules and hides the companion POS wire`() {
        assertTrue(InstallationCapabilityModule.fromWire("STOREFRONT").visibleOnConsole)
        assertTrue(InstallationCapabilityModule.fromWire("CATALOG").visibleOnConsole)
        assertTrue(InstallationCapabilityModule.fromWire("PAYMENTS_MP").visibleOnConsole)
        assertFalse(InstallationCapabilityModule.fromWire("BLACKSTORE_INTEGRATION").visibleOnConsole)
        assertFalse(InstallationCapabilityModule.fromWire("NOT_A_MODULE").visibleOnConsole)
    }
}
