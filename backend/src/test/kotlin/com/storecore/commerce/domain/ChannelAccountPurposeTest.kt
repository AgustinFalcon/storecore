package com.storecore.commerce.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ChannelAccountPurposeTest {
    @Test
    fun fromWireMapsCanonicalPurposesAndUnknown() {
        assertEquals(ChannelAccountPurpose.Unclassified, ChannelAccountPurpose.fromWire("UNCLASSIFIED"))
        assertEquals(ChannelAccountPurpose.ExternalMlSync, ChannelAccountPurpose.fromWire(" EXTERNAL_ML_SYNC "))
        assertEquals(ChannelAccountPurpose.InternalPricePolicy, ChannelAccountPurpose.fromWire("INTERNAL_PRICE_POLICY"))
        assertEquals(ChannelAccountPurpose.Unknown, ChannelAccountPurpose.fromWire("manual-price-writer"))
        assertEquals(ChannelAccountPurpose.Unknown, ChannelAccountPurpose.fromWire(null))
        assertTrue(ChannelAccountPurpose.ExternalMlSync.allowsExternalMlSync())
        assertFalse(ChannelAccountPurpose.Unclassified.allowsExternalMlSync())
        assertFalse(ChannelAccountPurpose.InternalPricePolicy.allowsExternalMlSync())
        assertFalse(ChannelAccountPurpose.Unknown.allowsExternalMlSync())
    }

    @Test
    fun accountStateAndChannelRejectUnknown() {
        assertTrue(ChannelAccountState.fromWire("ACTIVE").isActive())
        assertFalse(ChannelAccountState.fromWire("PAUSED").isActive())
        assertFalse(ChannelAccountState.fromWire("bogus").isActive())
        assertTrue(MarketplaceChannel.fromWire("MERCADO_LIBRE").isMercadoLibre())
        assertFalse(MarketplaceChannel.fromWire("WEB").isMercadoLibre())
    }
}
