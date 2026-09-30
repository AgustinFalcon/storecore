package com.storecore.commerce.application.port.output

import java.util.UUID

data class InventoryReserveLine(val lineKey: UUID, val variantId: Long, val quantity: Int)

/** Consume WEB reservations or one official ML channel sale. */
interface InventoryConsumePort {
    fun reserve(saga: UUID, lineKey: UUID, variantId: Long, quantity: Int, actor: String): Long
    fun reserveAll(saga: UUID, lines: List<InventoryReserveLine>, actor: String): List<Long>
    fun consumeSaga(saga: UUID, actor: String, orderId: Long? = null, attemptId: Long? = null): Int
    fun releaseSaga(saga: UUID, actor: String, orderId: Long? = null, attemptId: Long? = null): Int
    fun consumeChannelSale(
        variantId: Long,
        quantity: Int,
        actor: String,
        externalOrderId: String,
        externalOrderItemId: String,
        variationId: String?,
    ): Long
}
