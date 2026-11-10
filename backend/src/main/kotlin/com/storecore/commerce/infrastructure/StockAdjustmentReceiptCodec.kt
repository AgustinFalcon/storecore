package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.domain.*
import java.time.Instant
import java.util.UUID

/** Stored JSON crosses one strict boundary; an incomplete receipt never becomes success. */
internal class StockAdjustmentReceiptCodec(private val mapper: ObjectMapper) {
    fun decode(raw: String, commandId: UUID, variantId: Long, recordedAt: Instant): StockAdjustmentReceipt {
        val node = runCatching { mapper.readTree(raw) }.getOrNull()
        val unknown = StockAdjustmentReceipt(commandId, variantId.toString(), StockAdjustmentState.UNKNOWN,
            StockAdjustmentRejection.UNKNOWN, null, null, null, recordedAt)
        if (node == null || node.path("commandId").asText() != commandId.toString() || node.path("variantId").asText() != variantId.toString()) return unknown
        if (!node.isObject || listOf("commandId","variantId","state","reason","before","after","ledgerId","recordedAt").any { !node.has(it) } ||
            (!node.path("reason").isNull && !node.path("reason").isTextual)) return unknown
        val state = StockAdjustmentState.fromWire(node.path("state").textValue())
        val reason = node.path("reason").takeUnless { it.isMissingNode || it.isNull }?.textValue()?.let(StockAdjustmentRejection::fromWire)
        val before = snapshot(node.path("before"))
        val after = snapshot(node.path("after"))
        val ledger = node.path("ledgerId").textValue()?.takeIf { it.toLongOrNull()?.let { id -> id > 0 } == true }
        if (runCatching { Instant.parse(node.path("recordedAt").textValue()) }.getOrNull() != recordedAt) return unknown
        return when (state) {
            StockAdjustmentState.APPLIED -> if (reason == null && before != null && after != null && ledger != null &&
                before.available != after.available && before.reserved == after.reserved && before.safety == after.safety)
                StockAdjustmentReceipt(commandId, variantId.toString(), state, null, before, after, ledger, recordedAt) else unknown
            StockAdjustmentState.REJECTED -> if (reason != null && reason != StockAdjustmentRejection.UNKNOWN &&
                node.path("ledgerId").isNull && ledger == null && node.path("after").isNull && after == null &&
                ((reason == StockAdjustmentRejection.BALANCE_MISSING && node.path("before").isNull && before == null) ||
                    (reason != StockAdjustmentRejection.BALANCE_MISSING && before != null)))
                StockAdjustmentReceipt(commandId, variantId.toString(), state, reason, before, null, null, recordedAt) else unknown
            StockAdjustmentState.UNKNOWN -> unknown
        }
    }

    private fun snapshot(node: JsonNode): StockBalanceSnapshot? {
        fun number(field: String) = node.path(field).takeIf { it.isIntegralNumber && it.canConvertToInt() }?.intValue()?.takeIf { it >= 0 }
        val available = number("available") ?: return null
        val reserved = number("reserved") ?: return null
        val safety = number("safety") ?: return null
        return StockBalanceSnapshot(available, reserved, safety)
    }
}
