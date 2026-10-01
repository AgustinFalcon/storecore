package com.storecore.commerce.domain

object InventoryLedgerPairing {
    fun allowed(event: InventoryEventType, channel: InventoryChannel): Boolean = when (event) {
        is InventoryEventType.Sale -> channel is InventoryChannel.Web || channel is InventoryChannel.MercadoLibre
        is InventoryEventType.StockCommitExternal -> channel is InventoryChannel.ExternalCompanion
        is InventoryEventType.Reservation, is InventoryEventType.Release ->
            channel is InventoryChannel.Web ||
                channel is InventoryChannel.MercadoLibre ||
                channel is InventoryChannel.Internal ||
                channel is InventoryChannel.ExternalCompanion
        is InventoryEventType.Refund, is InventoryEventType.ReturnReceived,
        is InventoryEventType.Adjustment, is InventoryEventType.Reconciliation ->
            channel is InventoryChannel.Web ||
                channel is InventoryChannel.MercadoLibre ||
                channel is InventoryChannel.Internal
        is InventoryEventType.Unknown -> false
    }
}
