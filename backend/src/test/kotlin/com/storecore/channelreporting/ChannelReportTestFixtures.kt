package com.storecore.channelreporting

import com.storecore.channelreporting.application.*
import com.storecore.channelreporting.domain.*
import com.storecore.channelreporting.infrastructure.Sha256ReportPeriodHasher
import java.time.Instant

internal fun channelReportFixture(
    createdEvidence: ((ReportPeriod) -> ReportEvidence)? = null,
    netRevenue: ((ReportPeriod) -> ReportValue<ReportArsAmount>)? = null,
    operations: ((ReportPeriod) -> ReportValue<BlackStoreOperationDiagnostics>)? = null,
    scalarMetricsAvailable: Boolean = false,
    collectionMetricsAvailable: Boolean = false,
    bestSellerTotal: Long? = null,
    collectionTotal: Long? = null,
): StoreCoreCreatedOrderReport {
    val period = ReportPeriod.create(
        "2026-11-01", "2026-11-26", "America/Argentina/Buenos_Aires",
        Instant.parse("2026-11-25T20:00:00Z"), Sha256ReportPeriodHasher(),
    )!!
    val orderEvidence = createdEvidence?.invoke(period) ?: ReportEvidence.period(
        ReportSource.STORECORE_ORDER, ReportTimeBasis.ORDER_CREATED, ReportFreshness.CURRENT, period,
    )!!
    fun <T : Any> missing(): ReportValue<T> = requireNotNull(ReportValue.unavailable<T>(ReportUnavailableReason.SOURCE_MISSING))
    fun <T : Any> unsupported(): ReportValue<T> = requireNotNull(ReportValue.notAvailable<T>(ReportUnavailableReason.UNSUPPORTED_CONTRACT))
    fun reversal(): ReportValue<ReportArsAmount> = requireNotNull(ReportValue.notAvailable(ReportUnavailableReason.REVERSAL_AMOUNT_UNAVAILABLE))
    val paymentEvidence = ReportEvidence.period(
        ReportSource.STORECORE_PAYMENT_APPLICATION, ReportTimeBasis.PAYMENT_APPLIED, ReportFreshness.CURRENT, period,
    )!!
    val dispositionEvidence = ReportEvidence.period(
        ReportSource.STORECORE_PAYMENT_APPLICATION, ReportTimeBasis.ORDER_CREATED, ReportFreshness.CURRENT, period,
    )!!
    val inventoryEvidence = ReportEvidence.period(
        ReportSource.STORECORE_INVENTORY_LEDGER, ReportTimeBasis.LEDGER_RECORDED, ReportFreshness.CURRENT, period,
    )!!
    val receivedEvidence = ReportEvidence.period(
        ReportSource.STORECORE_RETURN, ReportTimeBasis.RETURN_RECEIVED, ReportFreshness.CURRENT, period,
    )!!
    val dispositionReturnEvidence = ReportEvidence.period(
        ReportSource.STORECORE_RETURN, ReportTimeBasis.DISPOSITION_CONFIRMED, ReportFreshness.CURRENT, period,
    )!!
    val blackStoreEvidence = ReportEvidence.current(
        ReportSource.BLACKSTORE_STOCK_SAGA, period.generatedAt, ReportFreshness.CURRENT,
    )!!
    val inventorySnapshotEvidence = ReportEvidence.current(
        ReportSource.STORECORE_CURRENT_INVENTORY, period.generatedAt, ReportFreshness.CURRENT,
    )!!
    val zero = ReportUnsignedLong.fromValue(0)!!
    val one = ReportUnsignedLong.fromValue(1)!!
    val applied = if (scalarMetricsAvailable) ReportValue.available(
        AppliedAccreditationMetrics.create(one, ReportArsAmount.fromWire("100.00")!!, ReportArsAmount.fromWire("90.00")!!, ReportArsAmount.fromWire("10.00")!!)!!,
        paymentEvidence,
    ) else missing()
    val paymentDisposition = if (scalarMetricsAvailable) ReportValue.available(
        PaymentDispositionReport.create(ReportPaymentDisposition.admitted.associateWith { if (it == ReportPaymentDisposition.APPROVED) one else zero })!!,
        dispositionEvidence,
    ) else missing()
    val inventoryMovements = if (scalarMetricsAvailable) ReportValue.available(
        InventoryMovementReport.create(listOf(
            InventoryMovementMetric.create(
                ReportInventoryEventType.SALE, ReportInventoryChannel.WEB, one, ReportSignedLong.fromValue(-1),
            )!!,
            InventoryMovementMetric.create(
                ReportInventoryEventType.RESERVATION, ReportInventoryChannel.INTERNAL,
                ReportUnsignedLong.fromValue(2)!!, ReportSignedLong.fromValue(-2),
            )!!,
        ))!!,
        inventoryEvidence,
    ) else missing()
    val returnReceipts = if (scalarMetricsAvailable) ReportValue.available(ReturnReceiptMetrics.create(one, one)!!, receivedEvidence) else missing()
    val confirmedReturns = if (scalarMetricsAvailable) ReportValue.available(
        ConfirmedReturnDispositionMetrics.create(one, one, zero, zero)!!,
        dispositionReturnEvidence,
    ) else missing()
    val moduleState = if (scalarMetricsAvailable) ReportValue.available(ReportModuleState.ACTIVE, blackStoreEvidence) else missing()
    val registration = if (scalarMetricsAvailable) ReportValue.available(
        BlackStoreRegistrationReport.create(BlackStoreRegistrationState.ACTIVE, zero)!!,
        blackStoreEvidence,
    ) else missing()
    val operationDiagnostics = if (scalarMetricsAvailable) {
        val retained = BlackStoreOperationState.admitted.associateWith { if (it == BlackStoreOperationState.COMMITTED) one else zero }
        val retired = BlackStoreRetiredOperationState.admitted.associateWith { zero }
        val activity = ReportValue.available(Instant.parse("2026-11-25T19:00:00Z"), blackStoreEvidence)
        val noEvidence = requireNotNull(ReportValue.unavailable<Instant>(ReportUnavailableReason.NO_EVIDENCE))
        ReportValue.available(BlackStoreOperationDiagnostics.create(retained, retired, activity, noEvidence)!!, blackStoreEvidence)
    } else operations?.invoke(period) ?: missing()
    val catalogToken = if (scalarMetricsAvailable) ReportValue.available(OpaqueCatalogToken.fromWire("catalog-v1")!!, blackStoreEvidence) else missing()
    val requestedSellerTotal = bestSellerTotal ?: collectionTotal ?: if (collectionMetricsAvailable) 2L else null
    val bestSellers = requestedSellerTotal?.let { total ->
        val items = (1..minOf(total, BestSellerReport.LIMIT.toLong()).toInt()).map { index ->
            BestSellerItem.create(
                ReportUnsignedLong.fromValue(index.toLong())!!,
                if (index == 1) "=DRILL-$index" else "DRILL-$index",
                "Drill $index",
                ReportUnsignedLong.fromValue((total - index + 1).coerceAtLeast(1))!!,
            )!!
        }
        ReportValue.available(BestSellerReport.create(items, ReportUnsignedLong.fromValue(total)!!)!!, paymentEvidence)
    } ?: missing()
    val lowStock = if (collectionMetricsAvailable) {
        val total = collectionTotal ?: 2L
        val items = (1..minOf(total, LowStockReport.LIMIT.toLong()).toInt()).map { index ->
            LowStockItem.create(
                ReportUnsignedLong.fromValue(100L + index)!!,
                "LOW-$index",
                if (index == 1) "+Low stock drill" else "Low stock tool $index",
                "Variant $index",
                ReportUnsignedLong.fromValue(index.toLong() - 1)!!,
                ReportUnsignedLong.fromValue(total)!!,
            )!!
        }
        ReportValue.available(LowStockReport.create(items, ReportUnsignedLong.fromValue(total)!!)!!, inventorySnapshotEvidence)
    } else missing()
    val currentStock = if (collectionMetricsAvailable) {
        val total = collectionTotal ?: 2L
        val items = (1..minOf(total, BlackStoreCurrentStockReport.LIMIT.toLong()).toInt()).map { index ->
            BlackStoreStockItem.create(
                ReportUnsignedLong.fromValue(200L + index)!!,
                "STOCK-$index",
                "Stock tool $index",
                if (index == 1) "@Red" else "Variant $index",
                one,
            )!!
        }
        ReportValue.available(
            BlackStoreCurrentStockReport.create(
                items, ReportUnsignedLong.fromValue(total)!!, ReportUnsignedLong.fromValue(total)!!, zero,
            )!!,
            inventorySnapshotEvidence,
        )
    } else missing()
    return StoreCoreCreatedOrderReport(
        period,
        ReportValue.available(CreatedOrderMetrics(ReportUnsignedLong.fromValue(2)!!, ReportArsAmount.fromWire("1234.50")!!), orderEvidence),
        applied, bestSellers, paymentDisposition, inventoryMovements, lowStock, returnReceipts, confirmedReturns,
        netRevenue?.invoke(period) ?: reversal(), reversal(), reversal(),
        moduleState, registration, operationDiagnostics, catalogToken, currentStock,
        requireNotNull(ReportValue.unavailable(ReportUnavailableReason.NO_EVIDENCE)),
        unsupported(), unsupported(), unsupported(), unsupported(), unsupported(), unsupported(), unsupported(),
    )
}
