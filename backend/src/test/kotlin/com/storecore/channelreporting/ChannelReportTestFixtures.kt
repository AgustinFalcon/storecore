package com.storecore.channelreporting

import com.storecore.channelreporting.application.*
import com.storecore.channelreporting.domain.*
import com.storecore.channelreporting.infrastructure.Sha256ReportPeriodHasher
import java.time.Instant

internal fun channelReportFixture(
    createdEvidence: ((ReportPeriod) -> ReportEvidence)? = null,
    netRevenue: ((ReportPeriod) -> ReportValue<ReportArsAmount>)? = null,
    operations: ((ReportPeriod) -> ReportValue<BlackStoreOperationDiagnostics>)? = null,
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
    return StoreCoreCreatedOrderReport(
        period,
        ReportValue.available(CreatedOrderMetrics(ReportUnsignedLong.fromValue(2)!!, ReportArsAmount.fromWire("1234.50")!!), orderEvidence),
        missing(), missing(), missing(), missing(), missing(), missing(), missing(),
        netRevenue?.invoke(period) ?: reversal(), reversal(), reversal(),
        missing(), missing(), operations?.invoke(period) ?: missing(), missing(), missing(),
        requireNotNull(ReportValue.unavailable(ReportUnavailableReason.NO_EVIDENCE)),
        unsupported(), unsupported(), unsupported(), unsupported(), unsupported(), unsupported(), unsupported(),
    )
}
