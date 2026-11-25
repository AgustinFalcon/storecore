package com.storecore.channelreporting.application

import com.storecore.channelreporting.domain.*

data class CreatedOrderMetrics(
    val count: ReportUnsignedLong,
    val nominalTotal: ReportArsAmount,
)

class StoreCoreCreatedOrderReport(
    val period: ReportPeriod,
    val createdOrders: ReportValue<CreatedOrderMetrics>,
) {
    fun createdOrdersValue(): CreatedOrderMetrics? = (createdOrders as? ReportValue.Available)?.value
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
