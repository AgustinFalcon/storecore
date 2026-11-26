package com.storecore.channelreporting.application

import com.storecore.channelreporting.domain.*

data class CreatedOrderMetrics(
    val count: ReportUnsignedLong,
    val nominalTotal: ReportArsAmount,
)

class AppliedAccreditationMetrics private constructor(
    val count: ReportUnsignedLong,
    val confirmedGross: ReportArsAmount,
    val merchandiseSubtotal: ReportArsAmount,
    val shippingAmount: ReportArsAmount,
) {
    companion object {
        fun create(
            count: ReportUnsignedLong,
            confirmedGross: ReportArsAmount,
            merchandiseSubtotal: ReportArsAmount,
            shippingAmount: ReportArsAmount,
        ): AppliedAccreditationMetrics? =
            takeIf {
                confirmedGross.value == merchandiseSubtotal.value + shippingAmount.value &&
                    (count.value != 0L || confirmedGross.value.signum() == 0)
            }
                ?.let { AppliedAccreditationMetrics(count, confirmedGross, merchandiseSubtotal, shippingAmount) }
    }
}

class BestSellerItem private constructor(
    val variantId: ReportUnsignedLong,
    val sku: String,
    val name: String,
    val grossUnits: ReportUnsignedLong,
) {
    companion object {
        fun create(variantId: ReportUnsignedLong, sku: String?, name: String?, grossUnits: ReportUnsignedLong): BestSellerItem? {
            val historicalSku = canonicalText(sku) ?: return null
            val historicalName = canonicalText(name) ?: return null
            if (grossUnits.value == 0L) return null
            return BestSellerItem(variantId, historicalSku, historicalName, grossUnits)
        }

        private fun canonicalText(raw: String?): String? = raw?.takeIf {
            it.isNotEmpty() && it.first().code > ASCII_SPACE && it.last().code > ASCII_SPACE
        }

        private const val ASCII_SPACE = 0x20
    }
}

class BestSellerReport private constructor(
    val items: List<BestSellerItem>,
    val total: ReportUnsignedLong,
    val truncated: Boolean,
) {
    companion object {
        const val LIMIT = 20
        fun create(items: List<BestSellerItem>, total: ReportUnsignedLong): BestSellerReport? =
            items.takeIf {
                it.size == minOf(total.value, LIMIT.toLong()).toInt() &&
                    it.map(BestSellerItem::variantId).distinct().size == it.size
            }
                ?.let { BestSellerReport(it.toList(), total, total.value > it.size) }
    }
}

enum class ReportPaymentDisposition {
    PENDING, APPROVED, REJECTED, CANCELLED, REFUNDED, CHARGED_BACK, UNKNOWN;
    companion object {
        fun fromWire(raw: String?): ReportPaymentDisposition = entries.firstOrNull { it.name == raw } ?: UNKNOWN
        val admitted: Set<ReportPaymentDisposition> = entries.filterTo(linkedSetOf()) { it != UNKNOWN }
    }
}

class PaymentDispositionReport private constructor(private val counts: Map<ReportPaymentDisposition, ReportUnsignedLong>) {
    fun count(disposition: ReportPaymentDisposition): ReportUnsignedLong =
        requireNotNull(counts[disposition.takeIf { it != ReportPaymentDisposition.UNKNOWN }])

    companion object {
        fun create(counts: Map<ReportPaymentDisposition, ReportUnsignedLong>): PaymentDispositionReport? =
            counts.takeIf { it.keys == ReportPaymentDisposition.admitted }
                ?.let { PaymentDispositionReport(it.toMap()) }
    }
}

enum class ReportInventoryEventType {
    RESERVATION, RELEASE, SALE, REFUND, RETURN_RECEIVED, ADJUSTMENT, RECONCILIATION,
    STOCK_COMMIT_EXTERNAL, RMA_RESTOCK, UNKNOWN;
    fun accepts(channel: ReportInventoryChannel): Boolean = when (this) {
        SALE -> channel in setOf(ReportInventoryChannel.WEB, ReportInventoryChannel.MERCADO_LIBRE)
        STOCK_COMMIT_EXTERNAL -> channel == ReportInventoryChannel.EXTERNAL_BLACKSTORE
        RESERVATION, RELEASE -> channel in setOf(ReportInventoryChannel.WEB, ReportInventoryChannel.MERCADO_LIBRE, ReportInventoryChannel.INTERNAL, ReportInventoryChannel.EXTERNAL_BLACKSTORE)
        REFUND, RETURN_RECEIVED, ADJUSTMENT, RECONCILIATION -> channel in setOf(ReportInventoryChannel.WEB, ReportInventoryChannel.MERCADO_LIBRE, ReportInventoryChannel.INTERNAL)
        RMA_RESTOCK -> channel == ReportInventoryChannel.INTERNAL
        UNKNOWN -> false
    }
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}

enum class ReportInventoryChannel {
    WEB, MERCADO_LIBRE, INTERNAL, EXTERNAL_BLACKSTORE, UNKNOWN;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
}

class InventoryMovementMetric private constructor(
    val eventType: ReportInventoryEventType,
    val channel: ReportInventoryChannel,
    val count: ReportUnsignedLong,
    val signedQuantity: ReportSignedLong,
) {
    companion object {
        fun create(
            eventType: ReportInventoryEventType,
            channel: ReportInventoryChannel,
            count: ReportUnsignedLong,
            signedQuantity: ReportSignedLong,
        ): InventoryMovementMetric? = takeIf {
            eventType.accepts(channel) && count.value > 0
        }?.let { InventoryMovementMetric(eventType, channel, count, signedQuantity) }
    }
}

class InventoryMovementReport private constructor(val groups: List<InventoryMovementMetric>) {
    fun quantity(eventType: ReportInventoryEventType, channel: ReportInventoryChannel): ReportSignedLong =
        requireNotNull(groups.singleOrNull { it.eventType == eventType && it.channel == channel }).signedQuantity

    companion object {
        fun create(groups: List<InventoryMovementMetric>): InventoryMovementReport? = groups.takeIf {
            it.map { row -> row.eventType to row.channel }.distinct().size == it.size
        }?.let { InventoryMovementReport(it.toList()) }
    }
}

class LowStockItem private constructor(
    val variantId: ReportUnsignedLong,
    val sku: String,
    val productName: String,
    val variantLabel: String,
    val availableQuantity: ReportUnsignedLong,
    val safetyStock: ReportUnsignedLong,
) {
    companion object {
        fun create(
            variantId: ReportUnsignedLong,
            sku: String?,
            productName: String?,
            variantLabel: String?,
            availableQuantity: ReportUnsignedLong,
            safetyStock: ReportUnsignedLong,
        ): LowStockItem? {
            fun text(raw: String?) = raw?.takeIf { it.isNotEmpty() && it.first().code > ASCII_SPACE && it.last().code > ASCII_SPACE }
            return LowStockItem(
                variantId,
                text(sku) ?: return null,
                text(productName) ?: return null,
                text(variantLabel) ?: return null,
                availableQuantity,
                safetyStock,
            ).takeIf { availableQuantity.value <= safetyStock.value }
        }
        private const val ASCII_SPACE = 0x20
    }
}

class LowStockReport private constructor(
    val items: List<LowStockItem>,
    val total: ReportUnsignedLong,
    val truncated: Boolean,
) {
    companion object {
        const val LIMIT = 50
        fun create(items: List<LowStockItem>, total: ReportUnsignedLong): LowStockReport? = items.takeIf {
            it.size == minOf(total.value, LIMIT.toLong()).toInt() && it.map(LowStockItem::variantId).distinct().size == it.size
        }?.let { LowStockReport(it.toList(), total, total.value > it.size) }
    }
}

class ReturnReceiptMetrics private constructor(
    val returnCount: ReportUnsignedLong,
    val returnedUnits: ReportUnsignedLong,
) {
    companion object {
        fun create(returnCount: ReportUnsignedLong, returnedUnits: ReportUnsignedLong): ReturnReceiptMetrics? =
            takeIf { (returnCount.value == 0L) == (returnedUnits.value == 0L) }
                ?.let { ReturnReceiptMetrics(returnCount, returnedUnits) }
    }
}

class ConfirmedReturnDispositionMetrics private constructor(
    val confirmedReturnCount: ReportUnsignedLong,
    val restockUnits: ReportUnsignedLong,
    val damagedUnits: ReportUnsignedLong,
    val rejectedUnits: ReportUnsignedLong,
) {
    companion object {
        fun create(
            confirmedReturnCount: ReportUnsignedLong,
            restockUnits: ReportUnsignedLong,
            damagedUnits: ReportUnsignedLong,
            rejectedUnits: ReportUnsignedLong,
        ): ConfirmedReturnDispositionMetrics? {
            val total = runCatching {
                Math.addExact(Math.addExact(restockUnits.value, damagedUnits.value), rejectedUnits.value)
            }.getOrNull() ?: return null
            return takeIf { (confirmedReturnCount.value == 0L) == (total == 0L) }
                ?.let { ConfirmedReturnDispositionMetrics(confirmedReturnCount, restockUnits, damagedUnits, rejectedUnits) }
        }
    }
}

class StoreCoreCreatedOrderReport(
    val period: ReportPeriod,
    val createdOrders: ReportValue<CreatedOrderMetrics>,
    val appliedAccreditations: ReportValue<AppliedAccreditationMetrics>,
    val bestSellers: ReportValue<BestSellerReport>,
    val paymentDisposition: ReportValue<PaymentDispositionReport>,
    val inventoryMovements: ReportValue<InventoryMovementReport>,
    val lowStock: ReportValue<LowStockReport>,
    val returnReceipts: ReportValue<ReturnReceiptMetrics>,
    val confirmedReturnDisposition: ReportValue<ConfirmedReturnDispositionMetrics>,
    val netRevenue: ReportValue<ReportArsAmount>,
    val reversalAmount: ReportValue<ReportArsAmount>,
    val fiscalTotal: ReportValue<ReportArsAmount>,
    val blackStoreModuleState: ReportValue<ReportModuleState>,
    val blackStoreRegistration: ReportValue<BlackStoreRegistrationReport>,
    val blackStoreOperations: ReportValue<BlackStoreOperationDiagnostics>,
    val blackStoreCatalogToken: ReportValue<OpaqueCatalogToken>,
    val blackStoreCurrentStock: ReportValue<BlackStoreCurrentStockReport>,
    val blackStoreRemoteFreshness: ReportValue<ReportFreshness>,
    val blackStoreSales: ReportValue<ReportUnsignedLong>,
    val blackStoreRevenue: ReportValue<ReportArsAmount>,
    val blackStorePayments: ReportValue<ReportUnsignedLong>,
    val blackStoreReturns: ReportValue<ReportUnsignedLong>,
    val blackStoreMonetaryChannelMix: ReportValue<ReportArsAmount>,
    val blackStoreHistoricalStock: ReportValue<ReportUnsignedLong>,
    val blackStoreSynchronization: ReportValue<ReportFreshness>,
) {
    fun createdOrdersValue(): CreatedOrderMetrics? = (createdOrders as? ReportValue.Available)?.value
    fun appliedAccreditationsValue(): AppliedAccreditationMetrics? = (appliedAccreditations as? ReportValue.Available)?.value
    fun bestSellersValue(): BestSellerReport? = (bestSellers as? ReportValue.Available)?.value
    fun paymentDispositionValue(): PaymentDispositionReport? = (paymentDisposition as? ReportValue.Available)?.value
    fun inventoryMovementsValue(): InventoryMovementReport? = (inventoryMovements as? ReportValue.Available)?.value
    fun lowStockValue(): LowStockReport? = (lowStock as? ReportValue.Available)?.value
    fun returnReceiptsValue(): ReturnReceiptMetrics? = (returnReceipts as? ReportValue.Available)?.value
    fun confirmedReturnDispositionValue(): ConfirmedReturnDispositionMetrics? =
        (confirmedReturnDisposition as? ReportValue.Available)?.value
    fun blackStoreModuleStateValue(): ReportModuleState? = (blackStoreModuleState as? ReportValue.Available)?.value
    fun blackStoreRegistrationValue(): BlackStoreRegistrationReport? =
        (blackStoreRegistration as? ReportValue.Available)?.value
    fun blackStoreOperationsValue(): BlackStoreOperationDiagnostics? =
        (blackStoreOperations as? ReportValue.Available)?.value
    fun blackStoreCatalogTokenValue(): OpaqueCatalogToken? = (blackStoreCatalogToken as? ReportValue.Available)?.value
    fun blackStoreCurrentStockValue(): BlackStoreCurrentStockReport? =
        (blackStoreCurrentStock as? ReportValue.Available)?.value
}

sealed interface StoreCoreCreatedOrderReadResult {
    data class Found(val report: StoreCoreCreatedOrderReport) : StoreCoreCreatedOrderReadResult
    data object InvalidPeriod : StoreCoreCreatedOrderReadResult
    data object TimezoneUnavailable : StoreCoreCreatedOrderReadResult
    class SourceUnavailable private constructor(val reason: ReportUnavailableReason) : StoreCoreCreatedOrderReadResult {
        companion object {
            fun create(reason: ReportUnavailableReason): SourceUnavailable? =
                reason.takeIf { it.availability == ReportAvailability.UNAVAILABLE }?.let(::SourceUnavailable)
        }
    }
}

fun interface StoreCoreCreatedOrderReportRepository {
    fun read(fromDate: String?, toDateExclusive: String?): StoreCoreCreatedOrderReadResult
}
