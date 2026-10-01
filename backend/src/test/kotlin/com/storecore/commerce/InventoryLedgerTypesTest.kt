package com.storecore.commerce

import com.storecore.commerce.domain.InventoryChannel
import com.storecore.commerce.domain.InventoryEventType
import com.storecore.commerce.domain.InventoryLedgerPairing
import com.storecore.commerce.domain.ReservationStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class InventoryLedgerTypesTest {
    @Test
    fun `fromWire keeps V1 and V6 wires and does not echo unknown raw`() {
        assertSame(InventoryEventType.Sale, InventoryEventType.fromWire("SALE"))
        assertSame(InventoryEventType.StockCommitExternal, InventoryEventType.fromWire("STOCK_COMMIT_EXTERNAL"))
        assertSame(InventoryChannel.Web, InventoryChannel.fromWire("WEB"))
        assertSame(InventoryChannel.ExternalCompanion, InventoryChannel.fromWire("EXTERNAL_BLACKSTORE"))
        assertSame(ReservationStatus.Active, ReservationStatus.fromWire("ACTIVE"))
        val unknownEvent = InventoryEventType.fromWire("SALE_OK")
        assertSame(InventoryEventType.Unknown, unknownEvent)
        assertEquals("unknown", unknownEvent.wire)
        assertSame(InventoryChannel.Unknown, InventoryChannel.fromWire("POS"))
        assertEquals("unknown", InventoryChannel.Unknown.wire)
        assertSame(ReservationStatus.Unknown, ReservationStatus.fromWire("HELD"))
    }

    @Test
    fun `pairing matches the V6 event-channel check`() {
        assertTrue(InventoryLedgerPairing.allowed(InventoryEventType.Sale, InventoryChannel.Web))
        assertTrue(InventoryLedgerPairing.allowed(InventoryEventType.Sale, InventoryChannel.MercadoLibre))
        assertFalse(InventoryLedgerPairing.allowed(InventoryEventType.Sale, InventoryChannel.ExternalCompanion))
        assertTrue(InventoryLedgerPairing.allowed(InventoryEventType.StockCommitExternal, InventoryChannel.ExternalCompanion))
        assertFalse(InventoryLedgerPairing.allowed(InventoryEventType.StockCommitExternal, InventoryChannel.Web))
        assertTrue(InventoryLedgerPairing.allowed(InventoryEventType.Reservation, InventoryChannel.ExternalCompanion))
        assertTrue(InventoryLedgerPairing.allowed(InventoryEventType.Adjustment, InventoryChannel.Internal))
        assertFalse(InventoryLedgerPairing.allowed(InventoryEventType.Adjustment, InventoryChannel.ExternalCompanion))
        assertFalse(InventoryLedgerPairing.allowed(InventoryEventType.Unknown, InventoryChannel.Web))
    }
}
