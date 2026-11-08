package com.storecore.commerce

import com.storecore.commerce.infrastructure.mporders.MpOrdersAdapterMode
import com.storecore.commerce.infrastructure.mporders.MpOrdersProperties
import com.storecore.commerce.infrastructure.mporders.showcaseSafetyPayload
import com.storecore.commerce.infrastructure.mporders.ShowcaseExternalCapability
import com.storecore.configuration.domain.CapabilityModuleView
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.domain.InstallationCapabilityModule
import kotlin.test.Test
import kotlin.test.assertEquals

class ShowcaseSafetyPayloadTest {
    @Test
    fun `adapter mode translates known and unknown wires`() {
        assertEquals(MpOrdersAdapterMode.UNCONFIGURED, MpOrdersAdapterMode.fromWire("unconfigured"))
        assertEquals(MpOrdersAdapterMode.FAKE, MpOrdersAdapterMode.fromWire("fake"))
        assertEquals(MpOrdersAdapterMode.OFFICIAL, MpOrdersAdapterMode.fromWire("official"))
        assertEquals(MpOrdersAdapterMode.UNKNOWN, MpOrdersAdapterMode.fromWire("future"))
    }

    @Test
    fun `showcase safety permits only the unconfigured adapter`() {
        assertEquals(MpOrdersAdapterMode.UNCONFIGURED.wire, showcaseSafetyPayload(MpOrdersProperties())["mpOrdersAdapter"])
        assertEquals(true, showcaseSafetyPayload(MpOrdersProperties())["externalCheckoutDisabled"])
        assertEquals(false, showcaseSafetyPayload(MpOrdersProperties(adapter = "fake"))["externalCheckoutDisabled"])
        assertEquals(false, showcaseSafetyPayload(MpOrdersProperties(adapter = "official"))["externalCheckoutDisabled"])
        assertEquals(false, showcaseSafetyPayload(MpOrdersProperties(adapter = "future"))["externalCheckoutDisabled"])
    }

    @Test
    fun `external safety includes hidden BlackStore and missing or duplicate authority stays unknown`() {
        val disabled = ShowcaseExternalCapability.entries.map { CapabilityModuleView(it.module, CapabilityState.DISABLED, 1) }
        fun rows(source: List<CapabilityModuleView>) = showcaseSafetyPayload(MpOrdersProperties(), source)["externalCapabilities"]
        val expected = ShowcaseExternalCapability.entries.map { mapOf("module" to it.module.wire, "state" to CapabilityState.DISABLED.wire) }
        assertEquals(expected, rows(disabled))
        val blackstore = disabled.single { it.module == InstallationCapabilityModule.BlackStoreIntegration }
        val unknown = expected.map { if (it["module"] == blackstore.module.wire) it + ("state" to CapabilityState.UNKNOWN.wire) else it }
        assertEquals(unknown, rows(disabled - blackstore))
        assertEquals(unknown, rows(disabled + blackstore))
        val active = expected.map { if (it["module"] == blackstore.module.wire) it + ("state" to CapabilityState.ACTIVE.wire) else it }
        assertEquals(active, rows(disabled - blackstore + blackstore.copy(state = CapabilityState.ACTIVE)))
    }
}
