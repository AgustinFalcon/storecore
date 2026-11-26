package com.storecore.channelreporting.infrastructure

import com.storecore.channelreporting.domain.ReportArsAmount
import com.storecore.channelreporting.domain.ReportSignedLong
import com.storecore.channelreporting.domain.ReportUnsignedLong
import java.math.BigInteger

enum class ChannelReportCsvColumn(val wire: String) {
    RECORD_KIND("recordKind"),
    METRIC("metric"),
    PART("part"),
    CSV_VERSION("csvVersion"),
    CONTRACT_VERSION("contractVersion"),
    REPORT_FROM_DATE("reportFromDate"),
    REPORT_TO_DATE_EXCLUSIVE("reportToDateExclusive"),
    REPORT_TIMEZONE("reportTimezone"),
    REPORT_FROM_INCLUSIVE("reportFromInclusive"),
    REPORT_TO_EXCLUSIVE("reportToExclusive"),
    REPORT_GENERATED_AT("reportGeneratedAt"),
    REPORT_PERIOD_TOKEN("reportPeriodToken"),
    AVAILABILITY("availability"),
    REASON("reason"),
    EVIDENCE_SOURCE("evidenceSource"),
    EVIDENCE_TIME_BASIS("evidenceTimeBasis"),
    EVIDENCE_OBSERVED_AT("evidenceObservedAt"),
    EVIDENCE_FRESHNESS("evidenceFreshness"),
    EVIDENCE_FROM_INCLUSIVE("evidenceFromInclusive"),
    EVIDENCE_TO_EXCLUSIVE("evidenceToExclusive"),
    EVIDENCE_PERIOD_TOKEN("evidencePeriodToken"),
    EMPTY("empty"),
    ENTITY_ID("entityId"),
    SKU("sku"),
    NAME("name"),
    LABEL("label"),
    STATE("state"),
    EVENT_TYPE("eventType"),
    CHANNEL("channel"),
    COUNT("count"),
    UNITS("units"),
    QUANTITY_DELTA_SUM("quantityDeltaSum"),
    NOMINAL_TOTAL("nominalTotal"),
    CONFIRMED_GROSS("confirmedGross"),
    CURRENCY("currency"),
    MERCHANDISE_SUBTOTAL("merchandiseSubtotal"),
    SHIPPING_AMOUNT("shippingAmount"),
    AVAILABLE_QUANTITY("availableQuantity"),
    SAFETY_STOCK("safetyStock"),
    SELLABLE_QUANTITY("sellableQuantity"),
    SELLABLE_UNITS("sellableUnits"),
    ZERO_SELLABLE_VARIANT_COUNT("zeroSellableVariantCount"),
    REVOKED_HISTORY_COUNT("revokedHistoryCount"),
    RESTOCK_UNITS("restockUnits"),
    DAMAGED_UNITS("damagedUnits"),
    REJECTED_UNITS("rejectedUnits"),
    ACTIVITY_AT("activityAt"),
    CATALOG_TOKEN("catalogToken"),
    TOTAL("total"),
    TRUNCATED("truncated"),
}

enum class ChannelReportCsvRecordKind {
    META, STATUS, VALUE, ITEM, GROUP, UNKNOWN;

    companion object {
        fun fromWire(raw: String?): ChannelReportCsvRecordKind =
            entries.firstOrNull { it != UNKNOWN && it.name == raw } ?: UNKNOWN
    }
}

enum class ChannelReportCsvMetric(val wire: String) {
    CREATED_ORDERS("createdOrders"),
    APPLIED_ACCREDITATIONS("appliedAccreditations"),
    BEST_SELLERS("bestSellers"),
    PAYMENT_DISPOSITION("paymentDisposition"),
    INVENTORY_MOVEMENTS("inventoryMovements"),
    LOW_STOCK("lowStock"),
    RETURN_RECEIPTS("returnReceipts"),
    CONFIRMED_RETURN_DISPOSITION("confirmedReturnDisposition"),
    NET_REVENUE("netRevenue"),
    REVERSAL_AMOUNT("reversalAmount"),
    FISCAL_TOTAL("fiscalTotal"),
    BLACK_STORE_MODULE_STATE("blackStoreModuleState"),
    BLACK_STORE_REGISTRATION("blackStoreRegistration"),
    BLACK_STORE_OPERATIONS("blackStoreOperations"),
    BLACK_STORE_CATALOG_TOKEN("blackStoreCatalogToken"),
    BLACK_STORE_CURRENT_STOCK("blackStoreCurrentStock"),
    BLACK_STORE_REMOTE_FRESHNESS("blackStoreRemoteFreshness"),
    BLACK_STORE_SALES("blackStoreSales"),
    BLACK_STORE_REVENUE("blackStoreRevenue"),
    BLACK_STORE_PAYMENTS("blackStorePayments"),
    BLACK_STORE_RETURNS("blackStoreReturns"),
    BLACK_STORE_MONETARY_CHANNEL_MIX("blackStoreMonetaryChannelMix"),
    BLACK_STORE_HISTORICAL_STOCK("blackStoreHistoricalStock"),
    BLACK_STORE_SYNCHRONIZATION("blackStoreSynchronization"),
    UNKNOWN("unknown");

    companion object {
        fun fromWire(raw: String?): ChannelReportCsvMetric =
            entries.firstOrNull { it != UNKNOWN && it.wire == raw } ?: UNKNOWN
    }
}

enum class ChannelReportCsvPart {
    ROOT, RETAINED, RETIRED, LATEST_RETAINED_ACTIVITY, LATEST_RETIRED_ACTIVITY, UNKNOWN;

    companion object {
        fun fromWire(raw: String?): ChannelReportCsvPart =
            entries.firstOrNull { it != UNKNOWN && it.name == raw } ?: UNKNOWN
    }
}

enum class ChannelReportCsvDataRecordAdmission { ADMITTED, TOO_LARGE }

class ChannelReportCsvDataRecordBudget private constructor(private val expected: BigInteger) {
    val admission: ChannelReportCsvDataRecordAdmission =
        if (expected <= MAX_DATA_RECORDS) ChannelReportCsvDataRecordAdmission.ADMITTED
        else ChannelReportCsvDataRecordAdmission.TOO_LARGE

    fun matchesPreparedRecordCount(actual: BigInteger): Boolean = actual.signum() >= 0 && actual == expected

    companion object {
        fun create(sectionCounts: Iterable<BigInteger>): ChannelReportCsvDataRecordBudget? {
            var total = BigInteger.ZERO
            for (count in sectionCounts) {
                if (count.signum() < 0) return null
                total += count
            }
            return ChannelReportCsvDataRecordBudget(total)
        }

        private val MAX_DATA_RECORDS = BigInteger.valueOf(50_000)
    }
}

class ChannelReportCsvCell private constructor(
    val wire: String,
    internal val requiresFormulaProtection: Boolean,
) {
    companion object {
        val Empty = ChannelReportCsvCell("", false)

        fun openText(raw: String): ChannelReportCsvCell = ChannelReportCsvCell(raw, true)
        fun unsigned(raw: String): ChannelReportCsvCell? =
            ReportUnsignedLong.fromWire(raw)?.wire?.let { ChannelReportCsvCell(it, false) }
        fun signed(raw: String): ChannelReportCsvCell? =
            ReportSignedLong.fromWire(raw)?.wire?.let { ChannelReportCsvCell(it, false) }
        fun money(raw: String): ChannelReportCsvCell? =
            ReportArsAmount.fromWire(raw)?.wire?.let { ChannelReportCsvCell(it, false) }
        internal fun recordKind(value: ChannelReportCsvRecordKind): ChannelReportCsvCell =
            ChannelReportCsvCell(value.name, false)
        internal fun metric(value: ChannelReportCsvMetric): ChannelReportCsvCell =
            ChannelReportCsvCell(value.wire, false)
        internal fun part(value: ChannelReportCsvPart): ChannelReportCsvCell =
            ChannelReportCsvCell(value.name, false)
    }
}

class ChannelReportCsvRecord private constructor(val cells: List<ChannelReportCsvCell>) {
    companion object {
        private val RESERVED = setOf(
            ChannelReportCsvColumn.RECORD_KIND,
            ChannelReportCsvColumn.METRIC,
            ChannelReportCsvColumn.PART,
        )

        fun create(
            kind: ChannelReportCsvRecordKind,
            metric: ChannelReportCsvMetric?,
            part: ChannelReportCsvPart?,
            values: Map<ChannelReportCsvColumn, ChannelReportCsvCell>,
        ): ChannelReportCsvRecord? {
            if (kind == ChannelReportCsvRecordKind.UNKNOWN || values.keys.any(RESERVED::contains)) return null
            if (kind == ChannelReportCsvRecordKind.META) {
                if (metric != null || part != null) return null
            } else if (metric == null || metric == ChannelReportCsvMetric.UNKNOWN || part == null || part == ChannelReportCsvPart.UNKNOWN) {
                return null
            }
            val cells = ChannelReportCsvColumn.entries.map { column ->
                when (column) {
                    ChannelReportCsvColumn.RECORD_KIND -> ChannelReportCsvCell.recordKind(kind)
                    ChannelReportCsvColumn.METRIC -> metric?.let(ChannelReportCsvCell::metric) ?: ChannelReportCsvCell.Empty
                    ChannelReportCsvColumn.PART -> part?.let(ChannelReportCsvCell::part) ?: ChannelReportCsvCell.Empty
                    else -> values[column] ?: ChannelReportCsvCell.Empty
                }
            }
            return ChannelReportCsvRecord(cells)
        }
    }
}

object ChannelReportCsvEncoder {
    fun header(): String = ChannelReportCsvColumn.entries.joinToString(",") { it.wire } + CRLF

    fun record(record: ChannelReportCsvRecord): String = record.cells.joinToString(",", postfix = CRLF, transform = ::encodeCell)

    fun encodeCell(cell: ChannelReportCsvCell): String {
        val safe = if (cell.requiresFormulaProtection) protectFormula(cell.wire) else cell.wire
        return if (safe.any { it == ',' || it == '"' || it == '\r' || it == '\n' }) {
            "\"${safe.replace("\"", "\"\"")}\""
        } else {
            safe
        }
    }

    private fun protectFormula(raw: String): String {
        val candidate = raw.dropWhile { it == ' ' }.firstOrNull()
        return if (candidate in FORMULA_PREFIXES) "'$raw" else raw
    }

    private val FORMULA_PREFIXES = setOf('=', '+', '-', '@', '\t', '\r')
    private const val CRLF = "\r\n"
}
