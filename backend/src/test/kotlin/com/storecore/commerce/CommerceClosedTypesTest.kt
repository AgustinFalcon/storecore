package com.storecore.commerce

import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.ChannelAccountState
import com.storecore.commerce.domain.ChannelOutboxKind
import com.storecore.commerce.domain.DesiredStockOutcome
import com.storecore.commerce.domain.ListingLifecycleAction
import com.storecore.commerce.domain.MarketplaceChannel
import com.storecore.commerce.domain.OutboxDeliveryStatus
import com.storecore.commerce.domain.ProductCatalogStatus
import com.storecore.commerce.domain.ProjectionSourceCause
import com.storecore.commerce.domain.ProjectionState
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class CommerceClosedTypesTest {
    @Test
    fun `fromWire keeps DSP wires and does not echo unknown raw`() {
        assertSame(ProjectionSourceCause.WebConsume, ProjectionSourceCause.fromWire("WEB_CONSUME"))
        assertSame(ProjectionSourceCause.ExternalBlackStoreCommit, ProjectionSourceCause.fromWire("EXTERNAL_BLACKSTORE_COMMIT"))
        assertSame(ChannelAccountPurpose.ExternalMlSync, ChannelAccountPurpose.fromWire("EXTERNAL_ML_SYNC"))
        assertSame(ChannelAccountState.Active, ChannelAccountState.fromWire("ACTIVE"))
        assertSame(MarketplaceChannel.MercadoLibre, MarketplaceChannel.fromWire("MERCADO_LIBRE"))
        assertSame(ProjectionState.Emitted, ProjectionState.fromWire("EMITTED"))
        assertSame(ProductCatalogStatus.Draft, ProductCatalogStatus.fromWire("DRAFT"))
        assertSame(ChannelOutboxKind.StockDesiredChanged, ChannelOutboxKind.fromWire("STOCK_DESIRED_CHANGED"))
        assertSame(OutboxDeliveryStatus.Pending, OutboxDeliveryStatus.fromWire("PENDING"))
        assertSame(DesiredStockOutcome.Projected, DesiredStockOutcome.fromWire("PROJECTED"))
        assertSame(ListingLifecycleAction.Activate, ListingLifecycleAction.fromWire("activate"))
        assertSame(ListingLifecycleAction.ConfirmMapping, ListingLifecycleAction.fromWire(" CONFIRM_MAPPING "))

        val unknownCause = ProjectionSourceCause.fromWire("WEB_CONSUME_X")
        assertSame(ProjectionSourceCause.Unknown, unknownCause)
        assertEquals("unknown", unknownCause.wire)
        assertSame(ChannelAccountPurpose.Unknown, ChannelAccountPurpose.fromWire("manual-price-writer"))
        assertEquals("unknown", ChannelAccountPurpose.Unknown.wire)
        assertSame(ChannelAccountState.Unknown, ChannelAccountState.fromWire("bogus"))
        assertEquals("unknown", ChannelAccountState.Unknown.wire)
        assertSame(MarketplaceChannel.Unknown, MarketplaceChannel.fromWire("WEB"))
        assertEquals("unknown", MarketplaceChannel.Unknown.wire)
        assertSame(ProjectionState.Unknown, ProjectionState.fromWire("QUEUED"))
        assertEquals("unknown", ProjectionState.Unknown.wire)
        assertSame(ProductCatalogStatus.Unknown, ProductCatalogStatus.fromWire("SCHEDULED"))
        assertEquals("unknown", ProductCatalogStatus.Unknown.wire)
        assertSame(ChannelOutboxKind.Unknown, ChannelOutboxKind.fromWire("SALE_OK"))
        assertEquals("unknown", ChannelOutboxKind.Unknown.wire)
        assertSame(OutboxDeliveryStatus.Unknown, OutboxDeliveryStatus.fromWire("HELD"))
        assertEquals("unknown", OutboxDeliveryStatus.Unknown.wire)
        assertSame(DesiredStockOutcome.Unknown, DesiredStockOutcome.fromWire("EMITTED"))
        assertEquals("unknown", DesiredStockOutcome.Unknown.wire)
        assertSame(ListingLifecycleAction.Unknown, ListingLifecycleAction.fromWire("SHIP"))
        assertEquals("unknown", ListingLifecycleAction.Unknown.wire)
        assertSame(ListingLifecycleAction.Unknown, ListingLifecycleAction.fromWire(null))
    }

    @Test
    fun `data object identity keeps === call sites`() {
        assertTrue(ChannelAccountPurpose.fromWire("EXTERNAL_ML_SYNC") === ChannelAccountPurpose.ExternalMlSync)
        assertTrue(ChannelAccountPurpose.ExternalMlSync.allowsExternalMlSync())
        assertFalse(ChannelAccountPurpose.Unclassified.allowsExternalMlSync())
        assertTrue(ChannelAccountState.fromWire("ACTIVE").isActive())
        assertFalse(ChannelAccountState.fromWire("PAUSED").isActive())
        assertTrue(MarketplaceChannel.fromWire("MERCADO_LIBRE").isMercadoLibre())
        assertFalse(MarketplaceChannel.fromWire("WEB").isMercadoLibre())
        assertTrue(ProjectionState.Withheld.isWithheld())
        assertFalse(ProjectionState.Emitted.isWithheld())
        assertTrue(ProductCatalogStatus.Active.isActive())
        assertFalse(ProductCatalogStatus.Draft.isActive())
        assertTrue(OutboxDeliveryStatus.Pending.isPending())
        assertFalse(OutboxDeliveryStatus.Sent.isPending())
        assertTrue(ListingLifecycleAction.fromWire("PAUSE") === ListingLifecycleAction.Pause)
        assertTrue(ProjectionSourceCause.fromWire("LISTING_PAUSED") === ProjectionSourceCause.ListingPaused)
        assertFalse(ProjectionSourceCause.fromWire("LISTING_PAUSED") === ProjectionSourceCause.Unknown)
    }
}
