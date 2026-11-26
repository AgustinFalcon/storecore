package com.storecore.channelreporting.infrastructure

import com.storecore.channelreporting.application.*
import com.storecore.channelreporting.domain.*
import java.math.BigInteger
import java.nio.charset.StandardCharsets

class ChannelReportCsvPlan private constructor(
    private val metadata: ChannelReportCsvRecord,
    private val sections: List<ChannelReportCsvSectionPlan>,
    val budget: ChannelReportCsvDataRecordBudget,
) {
    fun encode(): ByteArray? {
        if (budget.admission != ChannelReportCsvDataRecordAdmission.ADMITTED) return null
        val records = sections.flatMap(ChannelReportCsvSectionPlan::records)
        if (!budget.matchesPreparedRecordCount(BigInteger.valueOf(records.size.toLong()))) return null
        val csv = buildString {
            append(ChannelReportCsvEncoder.header())
            append(ChannelReportCsvEncoder.record(metadata))
            records.forEach { append(ChannelReportCsvEncoder.record(it)) }
        }
        return csv.toByteArray(StandardCharsets.UTF_8)
    }

    companion object {
        fun create(report: StoreCoreCreatedOrderReport): ChannelReportCsvPlan? {
            try {
                ChannelReportHttpMapper.toDto(report)
            } catch (_: ChannelReportMappingUnavailable) {
                return null
            }
            val context = ChannelReportCsvContext.from(report.period)
            val metadata = ChannelReportCsvRecord.create(
                ChannelReportCsvRecordKind.META,
                null,
                null,
                context.values,
            ) ?: return null
            val sections = listOfNotNull(
                ChannelReportCsvSectionPlan.createdOrders(context, report.createdOrders),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.APPLIED_ACCREDITATIONS, report.appliedAccreditations),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BEST_SELLERS, report.bestSellers),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.PAYMENT_DISPOSITION, report.paymentDisposition),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.INVENTORY_MOVEMENTS, report.inventoryMovements),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.LOW_STOCK, report.lowStock),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.RETURN_RECEIPTS, report.returnReceipts),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.CONFIRMED_RETURN_DISPOSITION, report.confirmedReturnDisposition),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.NET_REVENUE, report.netRevenue),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.REVERSAL_AMOUNT, report.reversalAmount),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.FISCAL_TOTAL, report.fiscalTotal),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BLACK_STORE_MODULE_STATE, report.blackStoreModuleState),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BLACK_STORE_REGISTRATION, report.blackStoreRegistration),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BLACK_STORE_OPERATIONS, report.blackStoreOperations),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BLACK_STORE_CATALOG_TOKEN, report.blackStoreCatalogToken),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BLACK_STORE_CURRENT_STOCK, report.blackStoreCurrentStock),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BLACK_STORE_REMOTE_FRESHNESS, report.blackStoreRemoteFreshness),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BLACK_STORE_SALES, report.blackStoreSales),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BLACK_STORE_REVENUE, report.blackStoreRevenue),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BLACK_STORE_PAYMENTS, report.blackStorePayments),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BLACK_STORE_RETURNS, report.blackStoreReturns),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BLACK_STORE_MONETARY_CHANNEL_MIX, report.blackStoreMonetaryChannelMix),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BLACK_STORE_HISTORICAL_STOCK, report.blackStoreHistoricalStock),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.BLACK_STORE_SYNCHRONIZATION, report.blackStoreSynchronization),
            )
            if (sections.size != ChannelReportCsvMetric.entries.count { it != ChannelReportCsvMetric.UNKNOWN }) return null
            val budget = ChannelReportCsvDataRecordBudget.create(sections.map(ChannelReportCsvSectionPlan::dataRecordCount))
                ?: return null
            return ChannelReportCsvPlan(metadata, sections, budget)
        }
    }
}

private class ChannelReportCsvSectionPlan private constructor(
    val dataRecordCount: BigInteger,
    val records: List<ChannelReportCsvRecord>,
) {
    companion object {
        fun createdOrders(
            context: ChannelReportCsvContext,
            source: ReportValue<CreatedOrderMetrics>,
        ): ChannelReportCsvSectionPlan? {
            val status = context.status(ChannelReportCsvMetric.CREATED_ORDERS, source) ?: return null
            val records = when (source) {
                is ReportValue.Available -> {
                    val value = source.value
                    val row = context.record(
                        ChannelReportCsvRecordKind.VALUE,
                        ChannelReportCsvMetric.CREATED_ORDERS,
                        mapOf(
                            ChannelReportCsvColumn.COUNT to (ChannelReportCsvCell.unsigned(value.count.wire) ?: return null),
                            ChannelReportCsvColumn.NOMINAL_TOTAL to (ChannelReportCsvCell.money(value.nominalTotal.wire) ?: return null),
                            ChannelReportCsvColumn.CURRENCY to ChannelReportCsvCell.openText("ARS"),
                        ),
                    ) ?: return null
                    listOf(status, row)
                }
                is ReportValue.Unavailable, is ReportValue.NotAvailable -> listOf(status)
                ReportValue.Unknown -> return null
            }
            return ChannelReportCsvSectionPlan(BigInteger.valueOf(records.size.toLong()), records)
        }

        fun statusOnly(
            context: ChannelReportCsvContext,
            metric: ChannelReportCsvMetric,
            source: ReportValue<*>,
        ): ChannelReportCsvSectionPlan? {
            if (source is ReportValue.Available) return null
            val status = context.status(metric, source) ?: return null
            return ChannelReportCsvSectionPlan(BigInteger.ONE, listOf(status))
        }
    }
}

private class ChannelReportCsvContext private constructor(val values: Map<ChannelReportCsvColumn, ChannelReportCsvCell>) {
    fun record(
        kind: ChannelReportCsvRecordKind,
        metric: ChannelReportCsvMetric,
        additions: Map<ChannelReportCsvColumn, ChannelReportCsvCell>,
    ): ChannelReportCsvRecord? {
        if (additions.keys.any(values::containsKey)) return null
        return ChannelReportCsvRecord.create(kind, metric, ChannelReportCsvPart.ROOT, values + additions)
    }

    fun status(metric: ChannelReportCsvMetric, source: ReportValue<*>): ChannelReportCsvRecord? {
        val fields = linkedMapOf<ChannelReportCsvColumn, ChannelReportCsvCell>()
        fields[ChannelReportCsvColumn.AVAILABILITY] = ChannelReportCsvCell.openText(source.availability.name)
        when (source) {
            is ReportValue.Available -> {
                val evidence = source.evidence
                fields[ChannelReportCsvColumn.EVIDENCE_SOURCE] = ChannelReportCsvCell.openText(evidence.source.name)
                fields[ChannelReportCsvColumn.EVIDENCE_TIME_BASIS] = ChannelReportCsvCell.openText(evidence.timeBasis.name)
                fields[ChannelReportCsvColumn.EVIDENCE_OBSERVED_AT] = ChannelReportCsvCell.openText(evidence.observedAt.toString())
                fields[ChannelReportCsvColumn.EVIDENCE_FRESHNESS] = ChannelReportCsvCell.openText(evidence.freshness.name)
                if (evidence is ReportEvidence.Period) {
                    fields[ChannelReportCsvColumn.EVIDENCE_FROM_INCLUSIVE] = ChannelReportCsvCell.openText(evidence.period.fromInclusive.toString())
                    fields[ChannelReportCsvColumn.EVIDENCE_TO_EXCLUSIVE] = ChannelReportCsvCell.openText(evidence.period.toExclusive.toString())
                    fields[ChannelReportCsvColumn.EVIDENCE_PERIOD_TOKEN] = ChannelReportCsvCell.openText(evidence.period.token.wire)
                }
            }
            is ReportValue.Unavailable -> {
                fields[ChannelReportCsvColumn.REASON] = ChannelReportCsvCell.openText(source.reason.name)
            }
            is ReportValue.NotAvailable -> {
                fields[ChannelReportCsvColumn.REASON] = ChannelReportCsvCell.openText(source.reason.name)
            }
            ReportValue.Unknown -> return null
        }
        return record(ChannelReportCsvRecordKind.STATUS, metric, fields)
    }

    companion object {
        fun from(period: ReportPeriod): ChannelReportCsvContext {
            val values = linkedMapOf(
                ChannelReportCsvColumn.CSV_VERSION to ChannelReportCsvCell.openText(CSV_VERSION),
                ChannelReportCsvColumn.CONTRACT_VERSION to ChannelReportCsvCell.openText(ReportPeriod.CONTRACT_VERSION),
                ChannelReportCsvColumn.REPORT_FROM_DATE to ChannelReportCsvCell.openText(period.fromDate.toString()),
                ChannelReportCsvColumn.REPORT_TO_DATE_EXCLUSIVE to ChannelReportCsvCell.openText(period.toDateExclusive.toString()),
                ChannelReportCsvColumn.REPORT_TIMEZONE to ChannelReportCsvCell.openText(period.timezone.id),
                ChannelReportCsvColumn.REPORT_FROM_INCLUSIVE to ChannelReportCsvCell.openText(period.fromInclusive.toString()),
                ChannelReportCsvColumn.REPORT_TO_EXCLUSIVE to ChannelReportCsvCell.openText(period.toExclusive.toString()),
                ChannelReportCsvColumn.REPORT_GENERATED_AT to ChannelReportCsvCell.openText(period.generatedAt.toString()),
                ChannelReportCsvColumn.REPORT_PERIOD_TOKEN to ChannelReportCsvCell.openText(period.token.wire),
            )
            return ChannelReportCsvContext(values)
        }

        private const val CSV_VERSION = "storecore-channel-report-csv-v1"
    }
}
