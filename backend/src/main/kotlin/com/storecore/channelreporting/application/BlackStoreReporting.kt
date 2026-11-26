package com.storecore.channelreporting.application

import com.storecore.channelreporting.domain.ReportUnsignedLong
import com.storecore.channelreporting.domain.ReportValue
import java.time.Instant

enum class ReportModuleState {
    DISABLED, READ_ONLY, ACTIVE, PAUSED, ERROR, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}

enum class BlackStoreRegistrationState {
    ABSENT, DISABLED, ACTIVE, REVOKED_ONLY, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}

class BlackStoreRegistrationReport private constructor(
    val state: BlackStoreRegistrationState,
    val revokedHistoryCount: ReportUnsignedLong,
) {
    companion object {
        fun create(state: BlackStoreRegistrationState, revokedHistoryCount: ReportUnsignedLong): BlackStoreRegistrationReport? =
            state.takeIf {
                it != BlackStoreRegistrationState.UNKNOWN &&
                    (it != BlackStoreRegistrationState.ABSENT || revokedHistoryCount.value == 0L) &&
                    (it != BlackStoreRegistrationState.REVOKED_ONLY || revokedHistoryCount.value > 0L)
            }
                ?.let { BlackStoreRegistrationReport(it, revokedHistoryCount) }
    }
}

enum class BlackStoreOperationState {
    PENDING, RESERVED, COMMITTED, RELEASED, EXPIRED, UNKNOWN;
    companion object {
        fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN
        val admitted = entries.filterTo(linkedSetOf()) { it != UNKNOWN }
    }
}

enum class BlackStoreRetiredOperationState {
    COMMITTED, RELEASED, EXPIRED, UNKNOWN;
    companion object {
        fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN
        val admitted = entries.filterTo(linkedSetOf()) { it != UNKNOWN }
    }
}

class BlackStoreOperationDiagnostics private constructor(
    private val retainedCounts: Map<BlackStoreOperationState, ReportUnsignedLong>,
    private val retiredCounts: Map<BlackStoreRetiredOperationState, ReportUnsignedLong>,
    val latestRetainedActivity: ReportValue<Instant>,
    val latestRetiredActivity: ReportValue<Instant>,
) {
    fun count(state: BlackStoreOperationState): ReportUnsignedLong =
        requireNotNull(retainedCounts[state.takeIf { it != BlackStoreOperationState.UNKNOWN }])

    fun retiredCount(state: BlackStoreRetiredOperationState): ReportUnsignedLong =
        requireNotNull(retiredCounts[state.takeIf { it != BlackStoreRetiredOperationState.UNKNOWN }])

    companion object {
        fun create(
            retainedCounts: Map<BlackStoreOperationState, ReportUnsignedLong>,
            retiredCounts: Map<BlackStoreRetiredOperationState, ReportUnsignedLong>,
            latestRetainedActivity: ReportValue<Instant>,
            latestRetiredActivity: ReportValue<Instant>,
        ): BlackStoreOperationDiagnostics? =
            takeIf {
                retainedCounts.keys == BlackStoreOperationState.admitted &&
                    retiredCounts.keys == BlackStoreRetiredOperationState.admitted
            }?.let {
                BlackStoreOperationDiagnostics(
                    retainedCounts.toMap(),
                    retiredCounts.toMap(),
                    latestRetainedActivity,
                    latestRetiredActivity,
                )
            }
    }
}

@JvmInline
value class OpaqueCatalogToken private constructor(val wire: String) {
    companion object {
        fun fromWire(raw: String?): OpaqueCatalogToken? = raw
            ?.takeIf { it.isNotEmpty() && it.length <= 64 && it.first().code > ASCII_SPACE && it.last().code > ASCII_SPACE }
            ?.let(::OpaqueCatalogToken)

        private const val ASCII_SPACE = 0x20
    }
}

class BlackStoreStockItem private constructor(
    val variantId: ReportUnsignedLong,
    val sku: String,
    val productName: String,
    val variantLabel: String,
    val sellableQuantity: ReportUnsignedLong,
) {
    companion object {
        fun create(
            variantId: ReportUnsignedLong,
            sku: String?,
            productName: String?,
            variantLabel: String?,
            sellableQuantity: ReportUnsignedLong,
        ): BlackStoreStockItem? {
            fun text(raw: String?) = raw?.takeIf {
                it.isNotEmpty() && it.first().code > ASCII_SPACE && it.last().code > ASCII_SPACE
            }
            return BlackStoreStockItem(
                variantId,
                text(sku) ?: return null,
                text(productName) ?: return null,
                text(variantLabel) ?: return null,
                sellableQuantity,
            )
        }

        private const val ASCII_SPACE = 0x20
    }
}

class BlackStoreCurrentStockReport private constructor(
    val items: List<BlackStoreStockItem>,
    val total: ReportUnsignedLong,
    val sellableUnits: ReportUnsignedLong,
    val zeroSellableVariantCount: ReportUnsignedLong,
    val truncated: Boolean,
) {
    companion object {
        const val LIMIT = 50
        fun create(
            items: List<BlackStoreStockItem>,
            total: ReportUnsignedLong,
            sellableUnits: ReportUnsignedLong,
            zeroSellableVariantCount: ReportUnsignedLong,
        ): BlackStoreCurrentStockReport? {
            if (items.size != minOf(total.value, LIMIT.toLong()).toInt() ||
                items.map(BlackStoreStockItem::variantId).distinct().size != items.size
            ) return null
            val visibleSellable = items.fold(0L) { sum, item ->
                runCatching { Math.addExact(sum, item.sellableQuantity.value) }.getOrNull() ?: return null
            }
            val visibleZeroCount = items.count { it.sellableQuantity.value == 0L }.toLong()
            val hiddenCount = total.value - items.size
            val complete = hiddenCount == 0L
            val aggregatesProven = if (complete) {
                sellableUnits.value == visibleSellable && zeroSellableVariantCount.value == visibleZeroCount
            } else {
                val zeroCountValid = zeroSellableVariantCount.value in
                    visibleZeroCount..Math.addExact(visibleZeroCount, hiddenCount)
                val unitsValid = sellableUnits.value >= visibleSellable
                if (!zeroCountValid || !unitsValid) false else {
                    val hiddenZeroCount = zeroSellableVariantCount.value - visibleZeroCount
                    val hiddenPositiveCount = hiddenCount - hiddenZeroCount
                    val hiddenSellableUnits = sellableUnits.value - visibleSellable
                    if (hiddenPositiveCount == 0L) hiddenSellableUnits == 0L
                    else hiddenSellableUnits >= hiddenPositiveCount
                }
            }
            if (!aggregatesProven) return null
            return BlackStoreCurrentStockReport(
                items.toList(), total, sellableUnits, zeroSellableVariantCount, !complete,
            )
        }
    }
}
