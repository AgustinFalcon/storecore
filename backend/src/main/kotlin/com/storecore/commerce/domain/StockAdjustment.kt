package com.storecore.commerce.domain

import java.time.Instant
import java.util.UUID

data class StockBalanceSnapshot(val available: Int, val reserved: Int, val safety: Int) {
    init { require(available >= 0 && reserved >= 0 && safety >= 0) }
}

class InvalidStockAdjustmentCommand : IllegalArgumentException("INVALID_COMMAND")

class AdjustAvailableStockCommand private constructor(
    val commandId: UUID, val variantId: Long, val quantityDelta: Int,
    val expected: StockBalanceSnapshot, val reason: String,
) {
    companion object {
        fun create(commandId: UUID, variantId: Long, delta: Int, expected: StockBalanceSnapshot, reason: String): AdjustAvailableStockCommand {
            val normalized = reason.trim()
            if (variantId <= 0 || delta == 0 || normalized.isEmpty() || normalized.length > 500) throw InvalidStockAdjustmentCommand()
            return AdjustAvailableStockCommand(commandId, variantId, delta, expected, normalized)
        }
    }
}

enum class StockAdjustmentState { APPLIED, REJECTED, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}

enum class StockAdjustmentRejection {
    BALANCE_CHANGED, BALANCE_MISSING, WOULD_MAKE_AVAILABLE_NEGATIVE, QUANTITY_OVERFLOW, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}

enum class StockAdjustmentRequestError { INVALID_COMMAND, IDEMPOTENCY_CONFLICT, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}

data class StockAdjustmentReceipt(
    val commandId: UUID, val variantId: String, val state: StockAdjustmentState,
    val reason: StockAdjustmentRejection?, val before: StockBalanceSnapshot?, val after: StockBalanceSnapshot?,
    val ledgerId: String?, val recordedAt: Instant,
)

sealed interface StockAdjustmentExecution {
    data class Recorded(val receipt: StockAdjustmentReceipt) : StockAdjustmentExecution
    data class Invalid(val error: StockAdjustmentRequestError) : StockAdjustmentExecution
}

enum class StockAdjustmentLookupState { FOUND, NOT_FOUND, UNKNOWN;
    companion object { fun fromWire(value: String?) = entries.firstOrNull { it.name == value } ?: UNKNOWN }
}
data class StockAdjustmentLookup(val lookup: StockAdjustmentLookupState, val receipt: StockAdjustmentReceipt? = null)

/** The policy knows quantities and intent, never HTTP or persistence. */
object ApplyAvailableStockAdjustment {
    fun reject(command: AdjustAvailableStockCommand, current: StockBalanceSnapshot?): StockAdjustmentRejection? = when {
        current == null -> StockAdjustmentRejection.BALANCE_MISSING
        current != command.expected -> StockAdjustmentRejection.BALANCE_CHANGED
        current.available.toLong() + command.quantityDelta < 0 -> StockAdjustmentRejection.WOULD_MAKE_AVAILABLE_NEGATIVE
        current.available.toLong() + command.quantityDelta > Int.MAX_VALUE -> StockAdjustmentRejection.QUANTITY_OVERFLOW
        else -> null
    }
}
