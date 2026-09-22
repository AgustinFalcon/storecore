package com.storecore.commerce.application.port.output

import java.util.UUID

/** Consume WEB reservations or one official ML channel sale. */
interface InventoryConsumePort {
    fun consumeSaga(saga: UUID, actor: String): Int
    fun consumeChannelSale(
        variantId: Long,
        quantity: Int,
        actor: String,
        externalOrderId: String,
        externalOrderItemId: String,
        variationId: String?,
    ): Long
}
