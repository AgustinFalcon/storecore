package com.storecore.commerce.application

import com.storecore.commerce.domain.*
import com.storecore.identity.domain.InternalUserPrincipal
import java.util.UUID

interface StockAdjustmentUseCases {
    fun adjust(actor: InternalUserPrincipal, command: AdjustAvailableStockCommand): StockAdjustmentExecution
    fun lookup(actor: InternalUserPrincipal, variantId: Long, commandId: UUID): StockAdjustmentLookup
}
