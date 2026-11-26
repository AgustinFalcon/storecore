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
    fun encode(details: ChannelReportCsvCompleteCollections = ChannelReportCsvCompleteCollections.empty()): ByteArray? {
        if (budget.admission != ChannelReportCsvDataRecordAdmission.ADMITTED) return null
        val records = sections.flatMap { it.records(details) ?: return null }
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
                ChannelReportCsvSectionPlan.appliedAccreditations(context, report.appliedAccreditations),
                ChannelReportCsvSectionPlan.bestSellers(context, report.bestSellers),
                ChannelReportCsvSectionPlan.paymentDisposition(context, report.paymentDisposition),
                ChannelReportCsvSectionPlan.inventoryMovements(context, report.inventoryMovements),
                ChannelReportCsvSectionPlan.lowStock(context, report.lowStock),
                ChannelReportCsvSectionPlan.returnReceipts(context, report.returnReceipts),
                ChannelReportCsvSectionPlan.confirmedReturnDisposition(context, report.confirmedReturnDisposition),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.NET_REVENUE, report.netRevenue),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.REVERSAL_AMOUNT, report.reversalAmount),
                ChannelReportCsvSectionPlan.statusOnly(context, ChannelReportCsvMetric.FISCAL_TOTAL, report.fiscalTotal),
                ChannelReportCsvSectionPlan.blackStoreModuleState(context, report.blackStoreModuleState),
                ChannelReportCsvSectionPlan.blackStoreRegistration(context, report.blackStoreRegistration),
                ChannelReportCsvSectionPlan.blackStoreOperations(context, report.blackStoreOperations),
                ChannelReportCsvSectionPlan.blackStoreCatalogToken(context, report.blackStoreCatalogToken),
                ChannelReportCsvSectionPlan.blackStoreCurrentStock(context, report.blackStoreCurrentStock),
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
    private val emitter: (ChannelReportCsvCompleteCollections) -> List<ChannelReportCsvRecord>?,
) {
    fun records(details: ChannelReportCsvCompleteCollections): List<ChannelReportCsvRecord>? = emitter(details)

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
                        additions = mapOf(
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
            return fixed(records)
        }

        fun bestSellers(context: ChannelReportCsvContext, source: ReportValue<BestSellerReport>): ChannelReportCsvSectionPlan? {
            val status = context.status(ChannelReportCsvMetric.BEST_SELLERS, source) ?: return null
            return when (source) {
                is ReportValue.Available -> {
                    val total = source.value.total.value
                    val count = BigInteger.valueOf(total).add(BigInteger.TWO)
                    ChannelReportCsvSectionPlan(count) { details ->
                        val items = details.bestSellers
                        if (items.size.toLong() != total || items.map { it.variantId.wire }.distinct().size != items.size ||
                            items != items.sortedWith(compareByDescending<BestSellerItem> { it.grossUnits.value }.thenBy { it.variantId.value }) ||
                            !sameBestSellerPrefix(source.value.items, items)
                        ) return@ChannelReportCsvSectionPlan null
                        val summary = context.record(ChannelReportCsvRecordKind.VALUE, ChannelReportCsvMetric.BEST_SELLERS, additions = mapOf(
                            ChannelReportCsvColumn.TOTAL to unsigned(source.value.total),
                            ChannelReportCsvColumn.EMPTY to ChannelReportCsvCell.openText((total == 0L).toString()),
                            ChannelReportCsvColumn.TRUNCATED to ChannelReportCsvCell.openText("false"),
                        )) ?: return@ChannelReportCsvSectionPlan null
                        listOf(status, summary) + items.map { item ->
                            context.record(ChannelReportCsvRecordKind.ITEM, ChannelReportCsvMetric.BEST_SELLERS, additions = mapOf(
                                ChannelReportCsvColumn.ENTITY_ID to unsigned(item.variantId),
                                ChannelReportCsvColumn.SKU to ChannelReportCsvCell.openText(item.sku),
                                ChannelReportCsvColumn.NAME to ChannelReportCsvCell.openText(item.name),
                                ChannelReportCsvColumn.UNITS to unsigned(item.grossUnits),
                            )) ?: return@ChannelReportCsvSectionPlan null
                        }
                    }
                }
                is ReportValue.Unavailable, is ReportValue.NotAvailable -> ChannelReportCsvSectionPlan(BigInteger.ONE) { details ->
                    if (details.bestSellers.isNotEmpty()) null else listOf(status)
                }
                ReportValue.Unknown -> null
            }
        }

        fun appliedAccreditations(context: ChannelReportCsvContext, source: ReportValue<AppliedAccreditationMetrics>) =
            valuePlan(context, ChannelReportCsvMetric.APPLIED_ACCREDITATIONS, source) { value ->
                context.record(ChannelReportCsvRecordKind.VALUE, ChannelReportCsvMetric.APPLIED_ACCREDITATIONS, additions = mapOf(
                    ChannelReportCsvColumn.COUNT to unsigned(value.count),
                    ChannelReportCsvColumn.CONFIRMED_GROSS to money(value.confirmedGross),
                    ChannelReportCsvColumn.MERCHANDISE_SUBTOTAL to money(value.merchandiseSubtotal),
                    ChannelReportCsvColumn.SHIPPING_AMOUNT to money(value.shippingAmount),
                    ChannelReportCsvColumn.CURRENCY to ChannelReportCsvCell.openText("ARS"),
                ))?.let(::listOf)
            }

        fun paymentDisposition(context: ChannelReportCsvContext, source: ReportValue<PaymentDispositionReport>) =
            valuePlan(context, ChannelReportCsvMetric.PAYMENT_DISPOSITION, source) { value ->
                ReportPaymentDisposition.admitted.map { disposition ->
                    context.record(ChannelReportCsvRecordKind.GROUP, ChannelReportCsvMetric.PAYMENT_DISPOSITION, additions = mapOf(
                        ChannelReportCsvColumn.STATE to ChannelReportCsvCell.openText(disposition.name),
                        ChannelReportCsvColumn.COUNT to unsigned(value.count(disposition)),
                    )) ?: return@valuePlan null
                }
            }

        fun inventoryMovements(context: ChannelReportCsvContext, source: ReportValue<InventoryMovementReport>) =
            valuePlan(context, ChannelReportCsvMetric.INVENTORY_MOVEMENTS, source) { value ->
                if (value.groups.isEmpty()) {
                    context.record(ChannelReportCsvRecordKind.VALUE, ChannelReportCsvMetric.INVENTORY_MOVEMENTS, additions = mapOf(
                        ChannelReportCsvColumn.EMPTY to ChannelReportCsvCell.openText("true"),
                    ))?.let(::listOf)
                } else {
                    value.groups.sortedWith(compareBy({ it.eventType.name }, { it.channel.name })).map { group ->
                        context.record(ChannelReportCsvRecordKind.GROUP, ChannelReportCsvMetric.INVENTORY_MOVEMENTS, additions = mapOf(
                            ChannelReportCsvColumn.EVENT_TYPE to ChannelReportCsvCell.openText(group.eventType.name),
                            ChannelReportCsvColumn.CHANNEL to ChannelReportCsvCell.openText(group.channel.name),
                            ChannelReportCsvColumn.COUNT to unsigned(group.count),
                            ChannelReportCsvColumn.QUANTITY_DELTA_SUM to signed(group.signedQuantity),
                        )) ?: return@valuePlan null
                    }
                }
            }

        fun returnReceipts(context: ChannelReportCsvContext, source: ReportValue<ReturnReceiptMetrics>) =
            valuePlan(context, ChannelReportCsvMetric.RETURN_RECEIPTS, source) { value ->
                context.record(ChannelReportCsvRecordKind.VALUE, ChannelReportCsvMetric.RETURN_RECEIPTS, additions = mapOf(
                    ChannelReportCsvColumn.COUNT to unsigned(value.returnCount),
                    ChannelReportCsvColumn.UNITS to unsigned(value.returnedUnits),
                ))?.let(::listOf)
            }

        fun confirmedReturnDisposition(context: ChannelReportCsvContext, source: ReportValue<ConfirmedReturnDispositionMetrics>) =
            valuePlan(context, ChannelReportCsvMetric.CONFIRMED_RETURN_DISPOSITION, source) { value ->
                context.record(ChannelReportCsvRecordKind.VALUE, ChannelReportCsvMetric.CONFIRMED_RETURN_DISPOSITION, additions = mapOf(
                    ChannelReportCsvColumn.COUNT to unsigned(value.confirmedReturnCount),
                    ChannelReportCsvColumn.RESTOCK_UNITS to unsigned(value.restockUnits),
                    ChannelReportCsvColumn.DAMAGED_UNITS to unsigned(value.damagedUnits),
                    ChannelReportCsvColumn.REJECTED_UNITS to unsigned(value.rejectedUnits),
                ))?.let(::listOf)
            }

        fun blackStoreModuleState(context: ChannelReportCsvContext, source: ReportValue<ReportModuleState>) =
            valuePlan(context, ChannelReportCsvMetric.BLACK_STORE_MODULE_STATE, source) { value ->
                context.record(ChannelReportCsvRecordKind.VALUE, ChannelReportCsvMetric.BLACK_STORE_MODULE_STATE, additions = mapOf(
                    ChannelReportCsvColumn.STATE to ChannelReportCsvCell.openText(value.name),
                ))?.let(::listOf)
            }

        fun blackStoreRegistration(context: ChannelReportCsvContext, source: ReportValue<BlackStoreRegistrationReport>) =
            valuePlan(context, ChannelReportCsvMetric.BLACK_STORE_REGISTRATION, source) { value ->
                context.record(ChannelReportCsvRecordKind.VALUE, ChannelReportCsvMetric.BLACK_STORE_REGISTRATION, additions = mapOf(
                    ChannelReportCsvColumn.STATE to ChannelReportCsvCell.openText(value.state.name),
                    ChannelReportCsvColumn.REVOKED_HISTORY_COUNT to unsigned(value.revokedHistoryCount),
                ))?.let(::listOf)
            }

        fun blackStoreOperations(context: ChannelReportCsvContext, source: ReportValue<BlackStoreOperationDiagnostics>) =
            valuePlan(context, ChannelReportCsvMetric.BLACK_STORE_OPERATIONS, source) { value ->
                val records = mutableListOf<ChannelReportCsvRecord>()
                for (state in BlackStoreOperationState.admitted) {
                    records += context.record(
                        ChannelReportCsvRecordKind.GROUP,
                        ChannelReportCsvMetric.BLACK_STORE_OPERATIONS,
                        ChannelReportCsvPart.RETAINED,
                        mapOf(
                            ChannelReportCsvColumn.STATE to ChannelReportCsvCell.openText(state.name),
                            ChannelReportCsvColumn.COUNT to unsigned(value.count(state)),
                        ),
                    ) ?: return@valuePlan null
                }
                for (state in BlackStoreRetiredOperationState.admitted) {
                    records += context.record(
                        ChannelReportCsvRecordKind.GROUP,
                        ChannelReportCsvMetric.BLACK_STORE_OPERATIONS,
                        ChannelReportCsvPart.RETIRED,
                        mapOf(
                            ChannelReportCsvColumn.STATE to ChannelReportCsvCell.openText(state.name),
                            ChannelReportCsvColumn.COUNT to unsigned(value.retiredCount(state)),
                        ),
                    ) ?: return@valuePlan null
                }
                records += context.activity(
                    ChannelReportCsvMetric.BLACK_STORE_OPERATIONS,
                    ChannelReportCsvPart.LATEST_RETAINED_ACTIVITY,
                    value.latestRetainedActivity,
                ) ?: return@valuePlan null
                records += context.activity(
                    ChannelReportCsvMetric.BLACK_STORE_OPERATIONS,
                    ChannelReportCsvPart.LATEST_RETIRED_ACTIVITY,
                    value.latestRetiredActivity,
                ) ?: return@valuePlan null
                records
            }

        fun blackStoreCatalogToken(context: ChannelReportCsvContext, source: ReportValue<OpaqueCatalogToken>) =
            valuePlan(context, ChannelReportCsvMetric.BLACK_STORE_CATALOG_TOKEN, source) { value ->
                context.record(ChannelReportCsvRecordKind.VALUE, ChannelReportCsvMetric.BLACK_STORE_CATALOG_TOKEN, additions = mapOf(
                    ChannelReportCsvColumn.CATALOG_TOKEN to ChannelReportCsvCell.openText(value.wire),
                ))?.let(::listOf)
            }

        fun lowStock(context: ChannelReportCsvContext, source: ReportValue<LowStockReport>): ChannelReportCsvSectionPlan? {
            val status = context.status(ChannelReportCsvMetric.LOW_STOCK, source) ?: return null
            return when (source) {
                is ReportValue.Available -> {
                    val total = source.value.total.value
                    ChannelReportCsvSectionPlan(BigInteger.valueOf(total).add(BigInteger.TWO)) { details ->
                        val items = details.lowStock
                        if (items.size.toLong() != total || items.map { it.variantId.wire }.distinct().size != items.size ||
                            items != items.sortedWith(compareBy<LowStockItem> { it.availableQuantity.value }.thenBy { it.variantId.value }) ||
                            !sameLowStockPrefix(source.value.items, items)
                        ) return@ChannelReportCsvSectionPlan null
                        val summary = context.record(ChannelReportCsvRecordKind.VALUE, ChannelReportCsvMetric.LOW_STOCK, additions = mapOf(
                            ChannelReportCsvColumn.TOTAL to unsigned(source.value.total),
                            ChannelReportCsvColumn.EMPTY to ChannelReportCsvCell.openText((total == 0L).toString()),
                            ChannelReportCsvColumn.TRUNCATED to ChannelReportCsvCell.openText("false"),
                        )) ?: return@ChannelReportCsvSectionPlan null
                        listOf(status, summary) + items.map { item ->
                            context.record(ChannelReportCsvRecordKind.ITEM, ChannelReportCsvMetric.LOW_STOCK, additions = mapOf(
                                ChannelReportCsvColumn.ENTITY_ID to unsigned(item.variantId),
                                ChannelReportCsvColumn.SKU to ChannelReportCsvCell.openText(item.sku),
                                ChannelReportCsvColumn.NAME to ChannelReportCsvCell.openText(item.productName),
                                ChannelReportCsvColumn.LABEL to ChannelReportCsvCell.openText(item.variantLabel),
                                ChannelReportCsvColumn.AVAILABLE_QUANTITY to unsigned(item.availableQuantity),
                                ChannelReportCsvColumn.SAFETY_STOCK to unsigned(item.safetyStock),
                            )) ?: return@ChannelReportCsvSectionPlan null
                        }
                    }
                }
                is ReportValue.Unavailable, is ReportValue.NotAvailable -> ChannelReportCsvSectionPlan(BigInteger.ONE) { details ->
                    if (details.lowStock.isNotEmpty()) null else listOf(status)
                }
                ReportValue.Unknown -> null
            }
        }

        fun blackStoreCurrentStock(
            context: ChannelReportCsvContext,
            source: ReportValue<BlackStoreCurrentStockReport>,
        ): ChannelReportCsvSectionPlan? {
            val status = context.status(ChannelReportCsvMetric.BLACK_STORE_CURRENT_STOCK, source) ?: return null
            return when (source) {
                is ReportValue.Available -> {
                    val total = source.value.total.value
                    ChannelReportCsvSectionPlan(BigInteger.valueOf(total).add(BigInteger.TWO)) { details ->
                        val items = details.blackStoreCurrentStock
                        if (items.size.toLong() != total || items.map { it.variantId.wire }.distinct().size != items.size ||
                            items != items.sortedBy { it.variantId.value } ||
                            !sameBlackStoreStockPrefix(source.value.items, items)
                        ) return@ChannelReportCsvSectionPlan null
                        var sellable = 0L
                        for (item in items) sellable = runCatching { Math.addExact(sellable, item.sellableQuantity.value) }.getOrNull()
                            ?: return@ChannelReportCsvSectionPlan null
                        if (sellable != source.value.sellableUnits.value ||
                            items.count { it.sellableQuantity.value == 0L }.toLong() != source.value.zeroSellableVariantCount.value
                        ) return@ChannelReportCsvSectionPlan null
                        val summary = context.record(ChannelReportCsvRecordKind.VALUE, ChannelReportCsvMetric.BLACK_STORE_CURRENT_STOCK, additions = mapOf(
                            ChannelReportCsvColumn.TOTAL to unsigned(source.value.total),
                            ChannelReportCsvColumn.SELLABLE_UNITS to unsigned(source.value.sellableUnits),
                            ChannelReportCsvColumn.ZERO_SELLABLE_VARIANT_COUNT to unsigned(source.value.zeroSellableVariantCount),
                            ChannelReportCsvColumn.EMPTY to ChannelReportCsvCell.openText((total == 0L).toString()),
                            ChannelReportCsvColumn.TRUNCATED to ChannelReportCsvCell.openText("false"),
                        )) ?: return@ChannelReportCsvSectionPlan null
                        listOf(status, summary) + items.map { item ->
                            context.record(ChannelReportCsvRecordKind.ITEM, ChannelReportCsvMetric.BLACK_STORE_CURRENT_STOCK, additions = mapOf(
                                ChannelReportCsvColumn.ENTITY_ID to unsigned(item.variantId),
                                ChannelReportCsvColumn.SKU to ChannelReportCsvCell.openText(item.sku),
                                ChannelReportCsvColumn.NAME to ChannelReportCsvCell.openText(item.productName),
                                ChannelReportCsvColumn.LABEL to ChannelReportCsvCell.openText(item.variantLabel),
                                ChannelReportCsvColumn.SELLABLE_QUANTITY to unsigned(item.sellableQuantity),
                            )) ?: return@ChannelReportCsvSectionPlan null
                        }
                    }
                }
                is ReportValue.Unavailable, is ReportValue.NotAvailable -> ChannelReportCsvSectionPlan(BigInteger.ONE) { details ->
                    if (details.blackStoreCurrentStock.isNotEmpty()) null else listOf(status)
                }
                ReportValue.Unknown -> null
            }
        }

        fun statusOnly(
            context: ChannelReportCsvContext,
            metric: ChannelReportCsvMetric,
            source: ReportValue<*>,
        ): ChannelReportCsvSectionPlan? {
            if (source is ReportValue.Available) return null
            val status = context.status(metric, source) ?: return null
            return ChannelReportCsvSectionPlan(BigInteger.ONE) { listOf(status) }
        }

        private fun <T : Any> valuePlan(
            context: ChannelReportCsvContext,
            metric: ChannelReportCsvMetric,
            source: ReportValue<T>,
            details: (T) -> List<ChannelReportCsvRecord>?,
        ): ChannelReportCsvSectionPlan? {
            val status = context.status(metric, source) ?: return null
            val records = when (source) {
                is ReportValue.Available -> listOf(status) + (details(source.value) ?: return null)
                is ReportValue.Unavailable, is ReportValue.NotAvailable -> listOf(status)
                ReportValue.Unknown -> return null
            }
            return fixed(records)
        }

        private fun fixed(records: List<ChannelReportCsvRecord>): ChannelReportCsvSectionPlan =
            ChannelReportCsvSectionPlan(BigInteger.valueOf(records.size.toLong())) { records }

        private fun unsigned(value: ReportUnsignedLong): ChannelReportCsvCell =
            requireNotNull(ChannelReportCsvCell.unsigned(value.wire))
        private fun signed(value: ReportSignedLong): ChannelReportCsvCell =
            requireNotNull(ChannelReportCsvCell.signed(value.wire))
        private fun money(value: ReportArsAmount): ChannelReportCsvCell =
            requireNotNull(ChannelReportCsvCell.money(value.wire))

        private fun sameBestSellerPrefix(expected: List<BestSellerItem>, actual: List<BestSellerItem>): Boolean =
            expected.size <= actual.size && expected.indices.all { index ->
                val left = expected[index]
                val right = actual[index]
                left.variantId == right.variantId && left.sku == right.sku && left.name == right.name && left.grossUnits == right.grossUnits
            }

        private fun sameLowStockPrefix(expected: List<LowStockItem>, actual: List<LowStockItem>): Boolean =
            expected.size <= actual.size && expected.indices.all { index ->
                val left = expected[index]
                val right = actual[index]
                left.variantId == right.variantId && left.sku == right.sku && left.productName == right.productName &&
                    left.variantLabel == right.variantLabel && left.availableQuantity == right.availableQuantity && left.safetyStock == right.safetyStock
            }

        private fun sameBlackStoreStockPrefix(expected: List<BlackStoreStockItem>, actual: List<BlackStoreStockItem>): Boolean =
            expected.size <= actual.size && expected.indices.all { index ->
                val left = expected[index]
                val right = actual[index]
                left.variantId == right.variantId && left.sku == right.sku && left.productName == right.productName &&
                    left.variantLabel == right.variantLabel && left.sellableQuantity == right.sellableQuantity
            }
    }
}

class ChannelReportCsvCompleteCollections private constructor(
    val bestSellers: List<BestSellerItem>,
    val lowStock: List<LowStockItem>,
    val blackStoreCurrentStock: List<BlackStoreStockItem>,
) {
    companion object {
        fun create(
            bestSellers: List<BestSellerItem>,
            lowStock: List<LowStockItem>,
            blackStoreCurrentStock: List<BlackStoreStockItem>,
        ): ChannelReportCsvCompleteCollections = ChannelReportCsvCompleteCollections(
            bestSellers.toList(), lowStock.toList(), blackStoreCurrentStock.toList(),
        )

        fun empty(): ChannelReportCsvCompleteCollections = create(emptyList(), emptyList(), emptyList())
    }
}

private class ChannelReportCsvContext private constructor(val values: Map<ChannelReportCsvColumn, ChannelReportCsvCell>) {
    fun record(
        kind: ChannelReportCsvRecordKind,
        metric: ChannelReportCsvMetric,
        part: ChannelReportCsvPart = ChannelReportCsvPart.ROOT,
        additions: Map<ChannelReportCsvColumn, ChannelReportCsvCell>,
    ): ChannelReportCsvRecord? {
        if (additions.keys.any(values::containsKey)) return null
        return ChannelReportCsvRecord.create(kind, metric, part, values + additions)
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
        return record(ChannelReportCsvRecordKind.STATUS, metric, additions = fields)
    }

    fun activity(
        metric: ChannelReportCsvMetric,
        part: ChannelReportCsvPart,
        source: ReportValue<java.time.Instant>,
    ): List<ChannelReportCsvRecord>? {
        val status = status(metric, part, source) ?: return null
        return when (source) {
            is ReportValue.Available -> {
                val value = record(ChannelReportCsvRecordKind.VALUE, metric, part, mapOf(
                    ChannelReportCsvColumn.ACTIVITY_AT to ChannelReportCsvCell.openText(source.value.toString()),
                )) ?: return null
                listOf(status, value)
            }
            is ReportValue.Unavailable -> listOf(status)
            else -> null
        }
    }

    private fun status(
        metric: ChannelReportCsvMetric,
        part: ChannelReportCsvPart,
        source: ReportValue<*>,
    ): ChannelReportCsvRecord? {
        val root = status(metric, source) ?: return null
        val additions = ChannelReportCsvColumn.entries
            .filterNot { it in setOf(ChannelReportCsvColumn.RECORD_KIND, ChannelReportCsvColumn.METRIC, ChannelReportCsvColumn.PART) }
            .mapNotNull { column -> root.cells[column.ordinal].takeIf { it.wire.isNotEmpty() }?.let { column to it } }
            .toMap()
        return ChannelReportCsvRecord.create(ChannelReportCsvRecordKind.STATUS, metric, part, additions)
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
