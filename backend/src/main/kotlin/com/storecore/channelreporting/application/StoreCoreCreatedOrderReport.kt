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

class StoreCoreCreatedOrderReport(
    val period: ReportPeriod,
    val createdOrders: ReportValue<CreatedOrderMetrics>,
    val appliedAccreditations: ReportValue<AppliedAccreditationMetrics>,
    val bestSellers: ReportValue<BestSellerReport>,
) {
    fun createdOrdersValue(): CreatedOrderMetrics? = (createdOrders as? ReportValue.Available)?.value
    fun appliedAccreditationsValue(): AppliedAccreditationMetrics? = (appliedAccreditations as? ReportValue.Available)?.value
    fun bestSellersValue(): BestSellerReport? = (bestSellers as? ReportValue.Available)?.value
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
