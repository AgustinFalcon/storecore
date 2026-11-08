package com.storecore.commerce

import com.storecore.commerce.infrastructure.mporders.MpOrdersAdapterMode
import com.storecore.commerce.infrastructure.mporders.MpOrdersProperties
import com.storecore.commerce.infrastructure.mporders.showcaseSafetyPayload
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
        assertEquals(
            mapOf("mpOrdersAdapter" to "unconfigured", "externalCheckoutDisabled" to true),
            showcaseSafetyPayload(MpOrdersProperties()),
        )
        assertEquals(false, showcaseSafetyPayload(MpOrdersProperties(adapter = "fake"))["externalCheckoutDisabled"])
        assertEquals(false, showcaseSafetyPayload(MpOrdersProperties(adapter = "official"))["externalCheckoutDisabled"])
        assertEquals(false, showcaseSafetyPayload(MpOrdersProperties(adapter = "future"))["externalCheckoutDisabled"])
    }
}
