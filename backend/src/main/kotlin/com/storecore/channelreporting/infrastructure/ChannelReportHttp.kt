package com.storecore.channelreporting.infrastructure

import com.fasterxml.jackson.annotation.JsonInclude
import com.storecore.channelreporting.application.*
import com.storecore.channelreporting.domain.*
import com.storecore.identity.application.AuthorizationDenied
import com.storecore.identity.infrastructure.web.InstallationOrigin
import jakarta.servlet.http.HttpServletRequest
import org.springframework.util.MultiValueMap
import java.net.URI
import java.time.Instant

data class ChannelReportQuery private constructor(val fromDate: String, val toDateExclusive: String) {
    companion object {
        fun fromWire(raw: MultiValueMap<String, String>): ChannelReportQuery? {
            if (raw.keys != setOf("fromDate", "toDateExclusive") || raw.values.any { it.size != 1 }) return null
            val from = raw["fromDate"]?.singleOrNull()
            val to = raw["toDateExclusive"]?.singleOrNull()
            return takeIf { ReportPeriod.validRequest(from, to) }?.let { ChannelReportQuery(from!!, to!!) }
        }
    }
}

data class ChannelReportCsvQuery private constructor(
    val fromDate: String,
    val toDateExclusive: String,
    val periodToken: ReportPeriodToken,
) {
    companion object {
        fun fromWire(raw: MultiValueMap<String, String>): ChannelReportCsvQuery? {
            if (raw.keys != setOf("fromDate", "toDateExclusive", "periodToken") || raw.values.any { it.size != 1 }) return null
            val from = raw["fromDate"]?.singleOrNull()
            val to = raw["toDateExclusive"]?.singleOrNull()
            val token = ReportPeriodToken.fromWire(raw["periodToken"]?.singleOrNull()) ?: return null
            return takeIf { ReportPeriod.validRequest(from, to) }?.let { ChannelReportCsvQuery(from!!, to!!, token) }
        }
    }
}

class ChannelReportReadOriginPolicy(private val installationOrigin: InstallationOrigin) {
    fun requireAdmitted(request: HttpServletRequest) {
        val origin = unique(request, "Origin")
        val fetchSite = unique(request, "Sec-Fetch-Site")
        val referer = unique(request, "Referer")
        val present = listOf(origin, fetchSite, referer).any { it != null }
        val valid = present &&
            (origin == null || installationOrigin.accepts(origin)) &&
            (fetchSite == null || fetchSite == "same-origin") &&
            (referer == null || installationOrigin.accepts(refererOrigin(referer)))
        if (!valid) throw AuthorizationDenied()
    }

    private fun unique(request: HttpServletRequest, name: String): String? {
        val values = request.getHeaders(name).toList()
        if (values.size > 1 || values.singleOrNull()?.isBlank() == true) throw AuthorizationDenied()
        return values.singleOrNull()
    }

    private fun refererOrigin(raw: String): String? = runCatching {
        val uri = URI(raw)
        if (!uri.isAbsolute || uri.userInfo != null || uri.host.isNullOrBlank()) return null
        URI(uri.scheme, null, uri.host, uri.port, null, null, null).toString()
    }.getOrNull()
}

@JsonInclude(JsonInclude.Include.NON_NULL)
data class ChannelReportValueDto<T : Any>(
    val availability: String,
    val value: T? = null,
    val evidence: ChannelReportEvidenceDto? = null,
    val reason: String? = null,
)

@JsonInclude(JsonInclude.Include.NON_NULL)
data class ChannelReportEvidenceDto(
    val source: String,
    val timeBasis: String,
    val observedAt: String,
    val freshness: String,
    val fromInclusive: String? = null,
    val toExclusive: String? = null,
    val periodToken: String? = null,
)

data class ChannelReportPeriodDto(
    val fromDate: String,
    val toDateExclusive: String,
    val timezone: String,
    val fromInclusive: String,
    val toExclusive: String,
    val generatedAt: String,
    val periodToken: String,
)

data class CreatedOrderMetricsDto(val count: String, val nominalTotal: String)
data class AppliedAccreditationMetricsDto(val count: String, val confirmedGross: String, val merchandiseSubtotal: String, val shippingAmount: String)
data class BestSellerItemDto(val variantId: String, val sku: String, val name: String, val grossUnits: String)
data class BestSellerReportDto(val items: List<BestSellerItemDto>, val total: String, val truncated: Boolean)
data class PaymentDispositionReportDto(
    val pending: String, val approved: String, val rejected: String, val cancelled: String,
    val refunded: String, val chargedBack: String,
)
data class InventoryMovementMetricDto(val eventType: String, val channel: String, val count: String, val quantityDeltaSum: String)
data class InventoryMovementReportDto(val groups: List<InventoryMovementMetricDto>)
data class LowStockItemDto(
    val variantId: String, val sku: String, val productName: String, val variantLabel: String,
    val availableQuantity: String, val safetyStock: String,
)
data class LowStockReportDto(val items: List<LowStockItemDto>, val total: String, val truncated: Boolean)
data class ReturnReceiptMetricsDto(val returnCount: String, val returnedUnits: String)
data class ConfirmedReturnDispositionMetricsDto(
    val confirmedReturnCount: String, val restockUnits: String, val damagedUnits: String, val rejectedUnits: String,
)
data class BlackStoreRegistrationReportDto(val state: String, val revokedHistoryCount: String)
data class BlackStoreOperationCountsDto(
    val pending: String, val reserved: String, val committed: String, val released: String, val expired: String,
)
data class BlackStoreRetiredOperationCountsDto(val committed: String, val released: String, val expired: String)
data class BlackStoreOperationDiagnosticsDto(
    val retained: BlackStoreOperationCountsDto,
    val retired: BlackStoreRetiredOperationCountsDto,
    val latestRetainedActivity: ChannelReportValueDto<String>,
    val latestRetiredActivity: ChannelReportValueDto<String>,
)
data class BlackStoreStockItemDto(
    val variantId: String, val sku: String, val productName: String, val variantLabel: String, val sellableQuantity: String,
)
data class BlackStoreCurrentStockReportDto(
    val items: List<BlackStoreStockItemDto>, val total: String, val sellableUnits: String,
    val zeroSellableVariantCount: String, val truncated: Boolean,
)

data class ChannelReportMetricsDto(
    val createdOrders: ChannelReportValueDto<CreatedOrderMetricsDto>,
    val appliedAccreditations: ChannelReportValueDto<AppliedAccreditationMetricsDto>,
    val bestSellers: ChannelReportValueDto<BestSellerReportDto>,
    val paymentDisposition: ChannelReportValueDto<PaymentDispositionReportDto>,
    val inventoryMovements: ChannelReportValueDto<InventoryMovementReportDto>,
    val lowStock: ChannelReportValueDto<LowStockReportDto>,
    val returnReceipts: ChannelReportValueDto<ReturnReceiptMetricsDto>,
    val confirmedReturnDisposition: ChannelReportValueDto<ConfirmedReturnDispositionMetricsDto>,
    val netRevenue: ChannelReportValueDto<String>,
    val reversalAmount: ChannelReportValueDto<String>,
    val fiscalTotal: ChannelReportValueDto<String>,
    val blackStoreModuleState: ChannelReportValueDto<String>,
    val blackStoreRegistration: ChannelReportValueDto<BlackStoreRegistrationReportDto>,
    val blackStoreOperations: ChannelReportValueDto<BlackStoreOperationDiagnosticsDto>,
    val blackStoreCatalogToken: ChannelReportValueDto<String>,
    val blackStoreCurrentStock: ChannelReportValueDto<BlackStoreCurrentStockReportDto>,
    val blackStoreRemoteFreshness: ChannelReportValueDto<String>,
    val blackStoreSales: ChannelReportValueDto<String>,
    val blackStoreRevenue: ChannelReportValueDto<String>,
    val blackStorePayments: ChannelReportValueDto<String>,
    val blackStoreReturns: ChannelReportValueDto<String>,
    val blackStoreMonetaryChannelMix: ChannelReportValueDto<String>,
    val blackStoreHistoricalStock: ChannelReportValueDto<String>,
    val blackStoreSynchronization: ChannelReportValueDto<String>,
)

data class ChannelReportDto(
    val contractVersion: String,
    val period: ChannelReportPeriodDto,
    val metrics: ChannelReportMetricsDto,
)

class ChannelReportMappingUnavailable : RuntimeException()

object ChannelReportHttpMapper {
    private enum class EvidenceVariant { PERIOD, CURRENT }
    private data class MetricPolicy(
        val source: ReportSource,
        val timeBasis: ReportTimeBasis,
        val variant: EvidenceVariant,
    )
    private val ORDER_CREATED = MetricPolicy(ReportSource.STORECORE_ORDER, ReportTimeBasis.ORDER_CREATED, EvidenceVariant.PERIOD)
    private val PAYMENT_APPLIED = MetricPolicy(ReportSource.STORECORE_PAYMENT_APPLICATION, ReportTimeBasis.PAYMENT_APPLIED, EvidenceVariant.PERIOD)
    private val PAYMENT_DISPOSITION = MetricPolicy(ReportSource.STORECORE_PAYMENT_APPLICATION, ReportTimeBasis.ORDER_CREATED, EvidenceVariant.PERIOD)
    private val INVENTORY_LEDGER = MetricPolicy(ReportSource.STORECORE_INVENTORY_LEDGER, ReportTimeBasis.LEDGER_RECORDED, EvidenceVariant.PERIOD)
    private val CURRENT_INVENTORY = MetricPolicy(ReportSource.STORECORE_CURRENT_INVENTORY, ReportTimeBasis.CURRENT_SNAPSHOT, EvidenceVariant.CURRENT)
    private val RETURN_RECEIVED = MetricPolicy(ReportSource.STORECORE_RETURN, ReportTimeBasis.RETURN_RECEIVED, EvidenceVariant.PERIOD)
    private val RETURN_DISPOSITION = MetricPolicy(ReportSource.STORECORE_RETURN, ReportTimeBasis.DISPOSITION_CONFIRMED, EvidenceVariant.PERIOD)
    private val BLACKSTORE_CURRENT = MetricPolicy(ReportSource.BLACKSTORE_STOCK_SAGA, ReportTimeBasis.CURRENT_SNAPSHOT, EvidenceVariant.CURRENT)

    fun toDto(report: StoreCoreCreatedOrderReport): ChannelReportDto {
        val period = report.period
        return ChannelReportDto(
            ReportPeriod.CONTRACT_VERSION,
            ChannelReportPeriodDto(
                period.fromDate.toString(), period.toDateExclusive.toString(), period.timezone.id,
                period.fromInclusive.toString(), period.toExclusive.toString(), period.generatedAt.toString(), period.token.wire,
            ),
            ChannelReportMetricsDto(
                value(report.createdOrders, period, ORDER_CREATED) { CreatedOrderMetricsDto(it.count.wire, it.nominalTotal.wire) },
                value(report.appliedAccreditations, period, PAYMENT_APPLIED) { AppliedAccreditationMetricsDto(it.count.wire, it.confirmedGross.wire, it.merchandiseSubtotal.wire, it.shippingAmount.wire) },
                value(report.bestSellers, period, PAYMENT_APPLIED) { source -> BestSellerReportDto(source.items.map { BestSellerItemDto(it.variantId.wire, it.sku, it.name, it.grossUnits.wire) }, source.total.wire, source.truncated) },
                value(report.paymentDisposition, period, PAYMENT_DISPOSITION) { PaymentDispositionReportDto(
                    it.count(ReportPaymentDisposition.PENDING).wire, it.count(ReportPaymentDisposition.APPROVED).wire,
                    it.count(ReportPaymentDisposition.REJECTED).wire, it.count(ReportPaymentDisposition.CANCELLED).wire,
                    it.count(ReportPaymentDisposition.REFUNDED).wire, it.count(ReportPaymentDisposition.CHARGED_BACK).wire,
                ) },
                value(report.inventoryMovements, period, INVENTORY_LEDGER) { source -> InventoryMovementReportDto(source.groups.map {
                    InventoryMovementMetricDto(known(it.eventType), known(it.channel), it.count.wire, it.signedQuantity.wire)
                }) },
                value(report.lowStock, period, CURRENT_INVENTORY) { source -> LowStockReportDto(source.items.map {
                    LowStockItemDto(it.variantId.wire, it.sku, it.productName, it.variantLabel, it.availableQuantity.wire, it.safetyStock.wire)
                }, source.total.wire, source.truncated) },
                value(report.returnReceipts, period, RETURN_RECEIVED) { ReturnReceiptMetricsDto(it.returnCount.wire, it.returnedUnits.wire) },
                value(report.confirmedReturnDisposition, period, RETURN_DISPOSITION) { ConfirmedReturnDispositionMetricsDto(it.confirmedReturnCount.wire, it.restockUnits.wire, it.damagedUnits.wire, it.rejectedUnits.wire) },
                fixedNotAvailable(report.netRevenue, ReportUnavailableReason.REVERSAL_AMOUNT_UNAVAILABLE),
                fixedNotAvailable(report.reversalAmount, ReportUnavailableReason.REVERSAL_AMOUNT_UNAVAILABLE),
                fixedNotAvailable(report.fiscalTotal, ReportUnavailableReason.REVERSAL_AMOUNT_UNAVAILABLE),
                value(report.blackStoreModuleState, period, BLACKSTORE_CURRENT) { known(it) },
                value(report.blackStoreRegistration, period, BLACKSTORE_CURRENT) { BlackStoreRegistrationReportDto(known(it.state), it.revokedHistoryCount.wire) },
                value(report.blackStoreOperations, period, BLACKSTORE_CURRENT) { operations(it, period) },
                value(report.blackStoreCatalogToken, period, BLACKSTORE_CURRENT) { it.wire },
                value(report.blackStoreCurrentStock, period, CURRENT_INVENTORY) { source -> BlackStoreCurrentStockReportDto(source.items.map {
                    BlackStoreStockItemDto(it.variantId.wire, it.sku, it.productName, it.variantLabel, it.sellableQuantity.wire)
                }, source.total.wire, source.sellableUnits.wire, source.zeroSellableVariantCount.wire, source.truncated) },
                fixedUnavailable(report.blackStoreRemoteFreshness, ReportUnavailableReason.NO_EVIDENCE),
                fixedNotAvailable(report.blackStoreSales, ReportUnavailableReason.UNSUPPORTED_CONTRACT),
                fixedNotAvailable(report.blackStoreRevenue, ReportUnavailableReason.UNSUPPORTED_CONTRACT),
                fixedNotAvailable(report.blackStorePayments, ReportUnavailableReason.UNSUPPORTED_CONTRACT),
                fixedNotAvailable(report.blackStoreReturns, ReportUnavailableReason.UNSUPPORTED_CONTRACT),
                fixedNotAvailable(report.blackStoreMonetaryChannelMix, ReportUnavailableReason.UNSUPPORTED_CONTRACT),
                fixedNotAvailable(report.blackStoreHistoricalStock, ReportUnavailableReason.UNSUPPORTED_CONTRACT),
                fixedNotAvailable(report.blackStoreSynchronization, ReportUnavailableReason.UNSUPPORTED_CONTRACT),
            ),
        )
    }

    private fun operations(value: BlackStoreOperationDiagnostics, period: ReportPeriod) = BlackStoreOperationDiagnosticsDto(
        BlackStoreOperationCountsDto(
            value.count(BlackStoreOperationState.PENDING).wire, value.count(BlackStoreOperationState.RESERVED).wire,
            value.count(BlackStoreOperationState.COMMITTED).wire, value.count(BlackStoreOperationState.RELEASED).wire,
            value.count(BlackStoreOperationState.EXPIRED).wire,
        ),
        BlackStoreRetiredOperationCountsDto(
            value.retiredCount(BlackStoreRetiredOperationState.COMMITTED).wire,
            value.retiredCount(BlackStoreRetiredOperationState.RELEASED).wire,
            value.retiredCount(BlackStoreRetiredOperationState.EXPIRED).wire,
        ),
        activity(value.latestRetainedActivity, period),
        activity(value.latestRetiredActivity, period),
    )

    private fun activity(source: ReportValue<Instant>, period: ReportPeriod): ChannelReportValueDto<String> = when (source) {
        is ReportValue.Available -> ChannelReportValueDto(
            ReportAvailability.AVAILABLE.name,
            source.value.toString(),
            evidence(source.evidence, period, BLACKSTORE_CURRENT),
        )
        is ReportValue.Unavailable -> {
            if (source.reason != ReportUnavailableReason.NO_EVIDENCE) throw ChannelReportMappingUnavailable()
            ChannelReportValueDto(ReportAvailability.UNAVAILABLE.name, reason = source.reason.name)
        }
        else -> throw ChannelReportMappingUnavailable()
    }

    private fun <T : Any, R : Any> value(
        source: ReportValue<T>,
        period: ReportPeriod,
        policy: MetricPolicy,
        mapper: (T) -> R,
    ): ChannelReportValueDto<R> = when (source) {
        is ReportValue.Available -> ChannelReportValueDto(
            ReportAvailability.AVAILABLE.name, mapper(source.value), evidence(source.evidence, period, policy),
        )
        is ReportValue.Unavailable -> ChannelReportValueDto(
            ReportAvailability.UNAVAILABLE.name, reason = known(source.reason),
        )
        else -> throw ChannelReportMappingUnavailable()
    }

    private fun <T : Any> fixedNotAvailable(
        source: ReportValue<T>,
        expected: ReportUnavailableReason,
    ): ChannelReportValueDto<String> {
        if (source !is ReportValue.NotAvailable || source.reason != expected) throw ChannelReportMappingUnavailable()
        return ChannelReportValueDto(ReportAvailability.NOT_AVAILABLE.name, reason = expected.name)
    }

    private fun <T : Any> fixedUnavailable(
        source: ReportValue<T>,
        expected: ReportUnavailableReason,
    ): ChannelReportValueDto<String> {
        if (source !is ReportValue.Unavailable || source.reason != expected) throw ChannelReportMappingUnavailable()
        return ChannelReportValueDto(ReportAvailability.UNAVAILABLE.name, reason = expected.name)
    }

    private fun evidence(source: ReportEvidence, outer: ReportPeriod, policy: MetricPolicy): ChannelReportEvidenceDto {
        if (source.observedAt != outer.generatedAt || source.source != policy.source || source.timeBasis != policy.timeBasis ||
            source.freshness != ReportFreshness.CURRENT
        ) throw ChannelReportMappingUnavailable()
        val periodFields = when (source) {
            is ReportEvidence.Period -> {
                if (policy.variant != EvidenceVariant.PERIOD || source.period.token != outer.token ||
                    source.period.fromInclusive != outer.fromInclusive || source.period.toExclusive != outer.toExclusive
                ) {
                    throw ChannelReportMappingUnavailable()
                }
                Triple(source.period.fromInclusive.toString(), source.period.toExclusive.toString(), source.period.token.wire)
            }
            is ReportEvidence.Current -> {
                if (policy.variant != EvidenceVariant.CURRENT) throw ChannelReportMappingUnavailable()
                Triple(null, null, null)
            }
        }
        return ChannelReportEvidenceDto(
            known(source.source), known(source.timeBasis), source.observedAt.toString(), known(source.freshness),
            periodFields.first, periodFields.second, periodFields.third,
        )
    }

    private fun known(value: Enum<*>): String = value.name.takeIf { it != "UNKNOWN" } ?: throw ChannelReportMappingUnavailable()
}
