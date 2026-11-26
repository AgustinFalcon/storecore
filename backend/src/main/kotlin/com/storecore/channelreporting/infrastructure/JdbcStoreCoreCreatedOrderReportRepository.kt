package com.storecore.channelreporting.infrastructure

import com.storecore.channelreporting.application.*
import com.storecore.channelreporting.domain.*
import org.springframework.dao.DataAccessException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.TransactionException
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.sql.Timestamp
import javax.sql.DataSource

internal enum class ChannelReportCsvPreparationStage {
    METRIC_PROJECTION,
    DETAIL_COLLECTION,
}

internal fun interface ChannelReportCsvPreparationObserver {
    fun reached(stage: ChannelReportCsvPreparationStage)
}

internal fun interface PreparedChannelReportCsvFactory {
    fun create(bytes: ByteArray): PreparedChannelReportCsv
}

class JdbcStoreCoreCreatedOrderReportRepository internal constructor(
    source: DataSource,
    private val hasher: ReportPeriodHasher,
    private val preparationObserver: ChannelReportCsvPreparationObserver,
    private val artifactFactory: PreparedChannelReportCsvFactory,
) : StoreCoreCreatedOrderReportRepository, ChannelReportCsvPreparationPort {
    constructor(source: DataSource, hasher: ReportPeriodHasher) : this(
        source,
        hasher,
        ChannelReportCsvPreparationObserver { },
        PreparedChannelReportCsvFactory(PreparedChannelReportCsv::create),
    )

    private val jdbc = JdbcTemplate(source)
    private val transaction = TransactionTemplate(DataSourceTransactionManager(source)).apply {
        isolationLevel = TransactionDefinition.ISOLATION_REPEATABLE_READ
        isReadOnly = true
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
    }

    override fun read(fromDate: String?, toDateExclusive: String?): StoreCoreCreatedOrderReadResult {
        if (!ReportPeriod.validRequest(fromDate, toDateExclusive)) return StoreCoreCreatedOrderReadResult.InvalidPeriod
        return executeOwnedSnapshot(
            failure = { unavailable(ReportUnavailableReason.READ_FAILED) },
            work = { readWithinSnapshot(fromDate!!, toDateExclusive!!) },
        )
    }

    override fun prepare(request: ChannelReportCsvPreparationRequest): ChannelReportCsvPreparationResult {
        var provisional: PreparedChannelReportCsv? = null
        val result = executeOwnedSnapshot(
            failure = { SnapshotCsvPreparation.SourceUnavailable },
            onFailure = { provisional?.close() },
            work = {
                when (val prepared = prepareWithinSnapshot(request)) {
                    is SnapshotCsvPreparation.Ready -> {
                        val artifact = artifactFactory.create(prepared.bytes)
                        provisional = artifact
                        SnapshotCsvPreparation.CommittedCandidate(artifact)
                    }
                    else -> prepared
                }
            },
        )
        return when (result) {
            is SnapshotCsvPreparation.CommittedCandidate -> ChannelReportCsvPreparationResult.Prepared.create(result.artifact)
            SnapshotCsvPreparation.StalePeriod -> ChannelReportCsvPreparationResult.StalePeriod
            SnapshotCsvPreparation.TooLarge -> ChannelReportCsvPreparationResult.TooLarge
            SnapshotCsvPreparation.SourceUnavailable,
            is SnapshotCsvPreparation.Ready -> ChannelReportCsvPreparationResult.SourceUnavailable
        }
    }

    private fun prepareWithinSnapshot(request: ChannelReportCsvPreparationRequest): SnapshotCsvPreparation {
        val period = when (val resolution = resolvePeriodWithinSnapshot(request.fromDate, request.toDateExclusive)) {
            is SnapshotPeriodResolution.Found -> resolution.period
            SnapshotPeriodResolution.TimezoneUnavailable,
            SnapshotPeriodResolution.SourceUnavailable -> return SnapshotCsvPreparation.SourceUnavailable
        }
        if (period.token != request.periodToken) return SnapshotCsvPreparation.StalePeriod
        preparationObserver.reached(ChannelReportCsvPreparationStage.METRIC_PROJECTION)
        val report = when (val projection = projectWithinSnapshot(period)) {
            is StoreCoreCreatedOrderReadResult.Found -> projection.report
            else -> return SnapshotCsvPreparation.SourceUnavailable
        }
        val plan = ChannelReportCsvPlan.create(report) ?: return SnapshotCsvPreparation.SourceUnavailable
        if (plan.budget.admission == ChannelReportCsvDataRecordAdmission.TOO_LARGE) return SnapshotCsvPreparation.TooLarge
        preparationObserver.reached(ChannelReportCsvPreparationStage.DETAIL_COLLECTION)
        val bestSellers = if (report.bestSellers is ReportValue.Available) bestSellerItems(period, ReportCollectionMode.EXPORT_ALL) ?: return SnapshotCsvPreparation.SourceUnavailable else emptyList()
        val lowStock = if (report.lowStock is ReportValue.Available) lowStockItems(ReportCollectionMode.EXPORT_ALL) ?: return SnapshotCsvPreparation.SourceUnavailable else emptyList()
        val currentStock = if (report.blackStoreCurrentStock is ReportValue.Available) blackStoreStockItems(ReportCollectionMode.EXPORT_ALL) ?: return SnapshotCsvPreparation.SourceUnavailable else emptyList()
        val details = ChannelReportCsvCompleteCollections.create(bestSellers, lowStock, currentStock)
        return plan.encode(details)?.let(SnapshotCsvPreparation::Ready) ?: SnapshotCsvPreparation.SourceUnavailable
    }

    private fun readWithinSnapshot(fromDate: String, toDateExclusive: String): StoreCoreCreatedOrderReadResult {
        return when (val resolution = resolvePeriodWithinSnapshot(fromDate, toDateExclusive)) {
            is SnapshotPeriodResolution.Found -> projectWithinSnapshot(resolution.period)
            SnapshotPeriodResolution.TimezoneUnavailable -> StoreCoreCreatedOrderReadResult.TimezoneUnavailable
            SnapshotPeriodResolution.SourceUnavailable -> unavailable(ReportUnavailableReason.READ_FAILED)
        }
    }

    private fun resolvePeriodWithinSnapshot(fromDate: String, toDateExclusive: String): SnapshotPeriodResolution {
        val zone = jdbc.query("SELECT timezone FROM installation_settings WHERE installation_id=1", { row, _ -> row.getString(1) }).singleOrNull()
            ?: return SnapshotPeriodResolution.TimezoneUnavailable
        val generatedAt = jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)?.toInstant()
            ?: return SnapshotPeriodResolution.SourceUnavailable
        val period = ReportPeriod.create(fromDate, toDateExclusive, zone, generatedAt, hasher)
            ?: return SnapshotPeriodResolution.TimezoneUnavailable
        return SnapshotPeriodResolution.Found(period)
    }

    private fun projectWithinSnapshot(period: ReportPeriod): StoreCoreCreatedOrderReadResult {
        val row = jdbc.queryForMap(
            """SELECT count(*) row_count, COALESCE(sum(total),0.00) nominal_total,
                      count(*) FILTER (WHERE currency<>'ARS' OR total<0 OR subtotal<0 OR shipping_cost<0 OR total<>subtotal+shipping_cost) contradiction_count
               FROM orders WHERE created_at>=? AND created_at<?""",
            Timestamp.from(period.fromInclusive), Timestamp.from(period.toExclusive),
        )
        if ((row["contradiction_count"] as Number).toLong() != 0L) {
            return unavailable(ReportUnavailableReason.SOURCE_CONTRADICTORY)
        }
        val count = ReportUnsignedLong.fromValue((row["row_count"] as Number).toLong())
        val amount = ReportArsAmount.fromValue(row["nominal_total"] as BigDecimal)
        val evidence = ReportEvidence.period(ReportSource.STORECORE_ORDER, ReportTimeBasis.ORDER_CREATED, ReportFreshness.CURRENT, period)
        if (count == null || amount == null || evidence == null) {
            return unavailable(ReportUnavailableReason.SOURCE_CONTRADICTORY)
        }
        val paymentProjection = appliedAccreditations(period)
        val remoteFreshness = requireNotNull(ReportValue.unavailable<ReportFreshness>(ReportUnavailableReason.NO_EVIDENCE))
        val unsupportedCount = requireNotNull(ReportValue.notAvailable<ReportUnsignedLong>(ReportUnavailableReason.UNSUPPORTED_CONTRACT))
        val unsupportedAmount = requireNotNull(ReportValue.notAvailable<ReportArsAmount>(ReportUnavailableReason.UNSUPPORTED_CONTRACT))
        val unsupportedSynchronization = requireNotNull(ReportValue.notAvailable<ReportFreshness>(ReportUnavailableReason.UNSUPPORTED_CONTRACT))
        val reversalUnavailable = requireNotNull(ReportValue.notAvailable<ReportArsAmount>(ReportUnavailableReason.REVERSAL_AMOUNT_UNAVAILABLE))
        return StoreCoreCreatedOrderReadResult.Found(StoreCoreCreatedOrderReport(
            period,
            ReportValue.available(CreatedOrderMetrics(count, amount), evidence),
            paymentProjection.metrics,
            paymentProjection.bestSellers,
            paymentDisposition(period),
            inventoryMovements(period),
            lowStock(period),
            returnReceipts(period),
            confirmedReturnDisposition(period),
            reversalUnavailable,
            reversalUnavailable,
            reversalUnavailable,
            blackStoreModuleState(period),
            blackStoreRegistration(period),
            blackStoreOperations(period),
            blackStoreCatalogToken(period),
            blackStoreCurrentStock(period),
            remoteFreshness,
            unsupportedCount,
            unsupportedAmount,
            unsupportedCount,
            unsupportedCount,
            unsupportedAmount,
            unsupportedCount,
            unsupportedSynchronization,
        ))
    }

    private fun <T : Any> executeOwnedSnapshot(
        failure: () -> T,
        onFailure: () -> Unit = {},
        work: () -> T,
    ): T = try {
        transaction.execute {
            val contract = jdbc.queryForMap(
                "SELECT current_setting('transaction_isolation') isolation, current_setting('transaction_read_only') read_only",
            )
            if (contract["isolation"] != "repeatable read" || contract["read_only"] != "on") failure() else work()
        } ?: run { onFailure(); failure() }
    } catch (_: DataAccessException) {
        onFailure()
        failure()
    } catch (_: TransactionException) {
        onFailure()
        failure()
    }

    private fun unavailable(reason: ReportUnavailableReason): StoreCoreCreatedOrderReadResult.SourceUnavailable =
        requireNotNull(StoreCoreCreatedOrderReadResult.SourceUnavailable.create(reason))

    private fun appliedAccreditations(period: ReportPeriod): PaymentProjection {
        val parameters = arrayOf(Timestamp.from(period.fromInclusive), Timestamp.from(period.toExclusive))
        val summary = jdbc.queryForMap(
            paymentAuthorityCte() + """SELECT count(*) FILTER (WHERE valid_authority IS NOT TRUE) contradiction_count,
                count(*) FILTER (WHERE valid_authority IS TRUE) application_count,
                COALESCE(sum(confirmed_amount) FILTER (WHERE valid_authority IS TRUE),0.00) confirmed_gross,
                COALESCE(sum(subtotal) FILTER (WHERE valid_authority IS TRUE),0.00) merchandise_subtotal,
                COALESCE(sum(shipping_cost) FILTER (WHERE valid_authority IS TRUE),0.00) shipping_amount
                FROM authority""",
            *parameters,
        )
        val paymentEvidence = ReportEvidence.period(
            ReportSource.STORECORE_PAYMENT_APPLICATION,
            ReportTimeBasis.PAYMENT_APPLIED,
            ReportFreshness.CURRENT,
            period,
        ) ?: return contradictoryPaymentProjection()
        if ((summary["contradiction_count"] as Number).toLong() != 0L) return contradictoryPaymentProjection()
        val metrics = AppliedAccreditationMetrics.create(
            ReportUnsignedLong.fromValue((summary["application_count"] as Number).toLong()) ?: return contradictoryPaymentProjection(),
            ReportArsAmount.fromValue(summary["confirmed_gross"] as BigDecimal) ?: return contradictoryPaymentProjection(),
            ReportArsAmount.fromValue(summary["merchandise_subtotal"] as BigDecimal) ?: return contradictoryPaymentProjection(),
            ReportArsAmount.fromValue(summary["shipping_amount"] as BigDecimal) ?: return contradictoryPaymentProjection(),
        ) ?: return contradictoryPaymentProjection()
        val snapshotContradictions = jdbc.queryForObject(
            paymentAuthorityCte() + """SELECT count(*) FROM (
                SELECT a.order_id
                FROM authority a LEFT JOIN order_items oi ON oi.order_id=a.order_id
                WHERE a.valid_authority IS TRUE
                GROUP BY a.order_id,a.subtotal
                HAVING count(oi.id)=0 OR COALESCE(sum(oi.subtotal),0.00)<>a.subtotal
                UNION ALL
                SELECT a.order_id
                FROM authority a JOIN order_items oi ON oi.order_id=a.order_id
                WHERE a.valid_authority IS TRUE AND (
                    jsonb_typeof(oi.product_snapshot->'sku') IS DISTINCT FROM 'string'
                    OR jsonb_typeof(oi.product_snapshot->'name') IS DISTINCT FROM 'string'
                    OR length(oi.product_snapshot->>'sku')=0
                    OR length(oi.product_snapshot->>'name')=0
                    OR ascii(left(oi.product_snapshot->>'sku',1))<=32
                    OR ascii(right(oi.product_snapshot->>'sku',1))<=32
                    OR ascii(left(oi.product_snapshot->>'name',1))<=32
                    OR ascii(right(oi.product_snapshot->>'name',1))<=32
                )
            ) contradictory_items""",
            Long::class.java,
            *parameters,
        ) ?: return PaymentProjection(ReportValue.available(metrics, paymentEvidence), unavailableValue())
        if (snapshotContradictions != 0L) {
            return PaymentProjection(ReportValue.available(metrics, paymentEvidence), unavailableValue())
        }
        val total = jdbc.queryForObject(
            paymentAuthorityCte() + """SELECT count(DISTINCT oi.variant_id)
                FROM authority a JOIN order_items oi ON oi.order_id=a.order_id WHERE a.valid_authority IS TRUE""",
            Long::class.java,
            *parameters,
        ) ?: return PaymentProjection(ReportValue.available(metrics, paymentEvidence), unavailableValue())
        val items = bestSellerItems(period, ReportCollectionMode.DASHBOARD)
            ?: return PaymentProjection(ReportValue.available(metrics, paymentEvidence), unavailableValue())
        val sellerReport = BestSellerReport.create(items, ReportUnsignedLong.fromValue(total) ?: return contradictoryPaymentProjection())
            ?: return contradictoryPaymentProjection()
        return PaymentProjection(
            ReportValue.available(metrics, paymentEvidence),
            ReportValue.available(sellerReport, paymentEvidence),
        )
    }

    private fun paymentAuthorityCte(): String = """WITH scoped_applications AS (
        SELECT c.id application_id,c.attempt_id,c.order_id,c.provider_order_id,c.confirmed_amount,c.confirmed_currency,c.applied_at,
               o.subtotal,o.shipping_cost,o.total order_total,o.currency order_currency
        FROM mp_order_commercial_applications c JOIN orders o ON o.id=c.order_id
        WHERE c.transition='PAYMENT_ACCREDITED' AND c.applied_at>=? AND c.applied_at<?
    ), authority AS (
        SELECT sa.*,
          COALESCE((a.id IS NOT NULL AND p.id IS NOT NULL
           AND a.order_id=sa.order_id AND p.order_id=sa.order_id
           AND a.provider_order_id=sa.provider_order_id AND a.state='ACCREDITED'
           AND p.amount=a.amount AND a.amount=sa.confirmed_amount AND sa.confirmed_amount=sa.order_total
           AND p.currency=a.currency AND a.currency=sa.confirmed_currency AND sa.confirmed_currency=sa.order_currency
           AND (
             p.status='APPROVED'
             OR (p.status IN ('REFUNDED','CHARGED_BACK','CANCELLED') AND EXISTS (
               SELECT 1 FROM mp_order_reversal_cases r
               WHERE r.attempt_id=a.id AND r.review_status='RESOLVED' AND r.provider_order_id=a.provider_order_id
             ))
           )
           AND NOT EXISTS (
             SELECT 1 FROM payments orphan
             WHERE orphan.order_id=sa.order_id AND orphan.status IN ('APPROVED','REFUNDED','CHARGED_BACK')
               AND orphan.id<>p.id
           )
           AND NOT EXISTS (
             SELECT 1 FROM mp_order_incidents incident
             WHERE incident.order_id=sa.order_id AND incident.kind='DUPLICATE_REMOTE_CREDIT'
               AND incident.review_status NOT IN ('RESOLVED','REJECTED')
           )
          ),FALSE) valid_authority
        FROM scoped_applications sa
        LEFT JOIN mp_checkout_attempts a ON a.id=sa.attempt_id
        LEFT JOIN payments p ON p.id=a.payment_id
    ) """

    private fun contradictoryPaymentProjection() = PaymentProjection(unavailableValue(), unavailableValue())

    private fun paymentDisposition(period: ReportPeriod): ReportValue<PaymentDispositionReport> {
        val rows = jdbc.query(
            paymentDispositionCte() + """SELECT projected_payment,count(*) disposition_count
                FROM classified GROUP BY projected_payment ORDER BY projected_payment""",
            { rs, _ -> ReportPaymentDisposition.fromWire(rs.getString("projected_payment")) to rs.getLong("disposition_count") },
            Timestamp.from(period.fromInclusive), Timestamp.from(period.toExclusive),
        )
        if (rows.any { it.first == ReportPaymentDisposition.UNKNOWN || it.second < 0 }) return unavailableValue()
        val observed = rows.associate { it.first to it.second }
        val counts = ReportPaymentDisposition.admitted.associateWith { disposition ->
            ReportUnsignedLong.fromValue(observed[disposition] ?: 0L) ?: return unavailableValue()
        }
        val report = PaymentDispositionReport.create(counts) ?: return unavailableValue()
        val evidence = ReportEvidence.period(
            ReportSource.STORECORE_PAYMENT_APPLICATION,
            ReportTimeBasis.ORDER_CREATED,
            ReportFreshness.CURRENT,
            period,
        ) ?: return unavailableValue()
        return ReportValue.available(report, evidence)
    }

    private fun paymentDispositionCte(): String = """WITH scoped_orders AS (
        SELECT o.id,o.status,o.total,o.currency
        FROM orders o WHERE o.created_at>=? AND o.created_at<?
    ), authority AS (
        SELECT so.*,
          (SELECT count(*) FROM mp_order_commercial_applications c
             WHERE c.order_id=so.id AND c.transition='PAYMENT_ACCREDITED') credits,
          (SELECT count(*) FROM mp_order_commercial_applications c
             JOIN mp_checkout_attempts a ON a.id=c.attempt_id
             JOIN payments p ON p.id=a.payment_id
             WHERE c.order_id=so.id AND c.transition='PAYMENT_ACCREDITED'
               AND a.order_id=c.order_id AND p.order_id=c.order_id
               AND a.provider_order_id=c.provider_order_id AND a.state='ACCREDITED'
               AND p.amount=a.amount AND a.amount=c.confirmed_amount AND c.confirmed_amount=so.total
               AND p.currency=a.currency AND a.currency=c.confirmed_currency AND c.confirmed_currency=so.currency
               AND p.status IN ('APPROVED','CANCELLED','REFUNDED','CHARGED_BACK')) valid_credits,
          (SELECT min(p.status) FROM mp_order_commercial_applications c
             JOIN mp_checkout_attempts a ON a.id=c.attempt_id JOIN payments p ON p.id=a.payment_id
             WHERE c.order_id=so.id AND c.transition='PAYMENT_ACCREDITED') credited_status,
          (SELECT count(*) FROM payments p WHERE p.order_id=so.id) payment_count,
          (SELECT min(p.status) FROM payments p WHERE p.order_id=so.id) raw_status,
          (SELECT count(*) FROM payments p WHERE p.order_id=so.id AND p.status IN ('APPROVED','REFUNDED','CHARGED_BACK')
             AND NOT EXISTS (SELECT 1 FROM mp_order_commercial_applications c
               JOIN mp_checkout_attempts a ON a.id=c.attempt_id
               WHERE c.order_id=so.id AND c.transition='PAYMENT_ACCREDITED' AND a.payment_id=p.id)) orphan_funded,
          EXISTS(SELECT 1 FROM mp_order_incidents i WHERE i.order_id=so.id
             AND i.review_status NOT IN ('RESOLVED','REJECTED')) incident,
          EXISTS(SELECT 1 FROM mp_order_reversal_cases r JOIN mp_checkout_attempts a ON a.id=r.attempt_id
             WHERE a.order_id=so.id AND (r.review_status NOT IN ('RESOLVED','REJECTED')
               OR (r.review_status='RESOLVED' AND (r.provider_order_id IS DISTINCT FROM a.provider_order_id
                 OR NOT EXISTS (SELECT 1 FROM mp_order_commercial_applications c
                    WHERE c.order_id=so.id AND c.attempt_id=a.id AND c.provider_order_id=r.provider_order_id
                      AND c.transition='PAYMENT_ACCREDITED'))))) ambiguous_reversal,
          (SELECT min(r.kind) FROM mp_order_reversal_cases r JOIN mp_checkout_attempts a ON a.id=r.attempt_id
             WHERE a.order_id=so.id AND r.review_status='RESOLVED' AND r.provider_order_id=a.provider_order_id
               AND EXISTS (SELECT 1 FROM mp_order_commercial_applications c
                 WHERE c.order_id=so.id AND c.attempt_id=a.id AND c.provider_order_id=r.provider_order_id
                   AND c.transition='PAYMENT_ACCREDITED')) reversal_kind
        FROM scoped_orders so
    ), checked AS (
        SELECT *, (incident OR ambiguous_reversal OR orphan_funded>0
          OR (credits>0 AND (credits<>1 OR valid_credits<>1))
          OR (credits=0 AND (status IN ('PAID','PAID_STOCK_REVIEW','REFUNDED')
            OR reversal_kind IS NOT NULL OR raw_status IN ('APPROVED','REFUNDED','CHARGED_BACK')))) contradictory
        FROM authority
    ), projected AS (
        SELECT *,CASE
          WHEN contradictory THEN 'UNKNOWN'
          WHEN credits=1 AND valid_credits=1 THEN
            CASE WHEN reversal_kind='CHARGEBACK' THEN 'CHARGED_BACK'
                 WHEN reversal_kind IS NOT NULL THEN 'REFUNDED'
                 ELSE COALESCE(credited_status,'UNKNOWN') END
          WHEN credits=0 AND payment_count=1 AND raw_status IN ('PENDING','REJECTED','CANCELLED') THEN raw_status
          ELSE 'UNKNOWN' END projected_payment_candidate
        FROM checked
    ), classified AS (
        SELECT *,projected_payment_candidate projected_payment
        FROM projected
    ) """

    private fun inventoryMovements(period: ReportPeriod): ReportValue<InventoryMovementReport> {
        val rows = jdbc.query(
            """SELECT event_type,channel,count(*) movement_count,sum(quantity_delta::numeric) signed_quantity
               FROM inventory_ledger WHERE created_at>=? AND created_at<?
               GROUP BY event_type,channel ORDER BY event_type,channel""",
            { rs, _ ->
                val event = ReportInventoryEventType.fromWire(rs.getString("event_type"))
                val channel = ReportInventoryChannel.fromWire(rs.getString("channel"))
                val count = ReportUnsignedLong.fromValue(rs.getLong("movement_count"))
                val quantity = runCatching { rs.getBigDecimal("signed_quantity").longValueExact() }.getOrNull()?.let(ReportSignedLong::fromValue)
                if (count == null || quantity == null) null else InventoryMovementMetric.create(event, channel, count, quantity)
            },
            Timestamp.from(period.fromInclusive), Timestamp.from(period.toExclusive),
        )
        if (rows.any { it == null }) return unavailableValue()
        val report = InventoryMovementReport.create(rows.filterNotNull()) ?: return unavailableValue()
        val evidence = ReportEvidence.period(
            ReportSource.STORECORE_INVENTORY_LEDGER,
            ReportTimeBasis.LEDGER_RECORDED,
            ReportFreshness.CURRENT,
            period,
        ) ?: return unavailableValue()
        return ReportValue.available(report, evidence)
    }

    private fun lowStock(period: ReportPeriod): ReportValue<LowStockReport> {
        val summary = jdbc.queryForMap(
            """SELECT count(*) FILTER (WHERE b.variant_id IS NULL) missing_count,
                      count(*) FILTER (WHERE b.variant_id IS NOT NULL AND b.available_quantity<=b.safety_stock) low_count,
                      count(*) FILTER (WHERE b.variant_id IS NOT NULL AND b.available_quantity<=b.safety_stock AND (
                        length(v.sku)=0 OR length(p.name)=0 OR length(v.label)=0
                        OR ascii(left(v.sku,1))<=32 OR ascii(right(v.sku,1))<=32
                        OR ascii(left(p.name,1))<=32 OR ascii(right(p.name,1))<=32
                        OR ascii(left(v.label,1))<=32 OR ascii(right(v.label,1))<=32
                      )) invalid_text_count
               FROM product_variants v JOIN products p ON p.id=v.product_id
               LEFT JOIN inventory_balances b ON b.variant_id=v.id
               WHERE v.active=TRUE AND p.status='ACTIVE'""",
        )
        if ((summary["missing_count"] as Number).toLong() != 0L) return unavailableValue()
        if ((summary["invalid_text_count"] as Number).toLong() != 0L) return unavailableValue()
        val total = ReportUnsignedLong.fromValue((summary["low_count"] as Number).toLong()) ?: return unavailableValue()
        val items = lowStockItems(ReportCollectionMode.DASHBOARD) ?: return unavailableValue()
        val report = LowStockReport.create(items, total) ?: return unavailableValue()
        val evidence = ReportEvidence.current(
            ReportSource.STORECORE_CURRENT_INVENTORY,
            period.generatedAt,
            ReportFreshness.CURRENT,
        ) ?: return unavailableValue()
        return ReportValue.available(report, evidence)
    }

    private fun returnReceipts(period: ReportPeriod): ReportValue<ReturnReceiptMetrics> {
        val row = jdbc.queryForMap(
            """WITH selected AS (
                 SELECT r.id,r.status,r.received_at,r.created_at,r.updated_at,
                        count(ri.id) item_count,
                        count(DISTINCT ri.order_item_id) distinct_item_count,
                        COALESCE(sum(ri.quantity::numeric),0) returned_units,
                        count(*) FILTER (WHERE ri.id IS NOT NULL AND (
                          oi.id IS NULL OR oi.order_id<>r.order_id OR ri.quantity<=0 OR ri.quantity>oi.quantity
                        )) invalid_item_count
                 FROM returns r
                 LEFT JOIN return_items ri ON ri.return_id=r.id
                 LEFT JOIN order_items oi ON oi.id=ri.order_item_id
                 WHERE r.received_at>=? AND r.received_at<?
                 GROUP BY r.id,r.status,r.received_at,r.created_at,r.updated_at
               )
               SELECT count(*) return_count,COALESCE(sum(returned_units),0) returned_units,
                      count(*) FILTER (WHERE status NOT IN ('RETURN_RECEIVED','INSPECTED','CLOSED')
                        OR received_at<created_at OR received_at>updated_at OR item_count=0
                        OR item_count<>distinct_item_count OR invalid_item_count<>0)
                      + (SELECT count(*) FROM returns
                         WHERE status IN ('RETURN_RECEIVED','INSPECTED','CLOSED') AND received_at IS NULL) contradiction_count
               FROM selected""",
            Timestamp.from(period.fromInclusive),
            Timestamp.from(period.toExclusive),
        )
        if ((row["contradiction_count"] as Number).toLong() != 0L) return unavailableValue()
        val count = ReportUnsignedLong.fromValue((row["return_count"] as Number).toLong()) ?: return unavailableValue()
        val units = exactUnsigned(row["returned_units"]) ?: return unavailableValue()
        val metrics = ReturnReceiptMetrics.create(count, units) ?: return unavailableValue()
        val evidence = ReportEvidence.period(
            ReportSource.STORECORE_RETURN,
            ReportTimeBasis.RETURN_RECEIVED,
            ReportFreshness.CURRENT,
            period,
        ) ?: return unavailableValue()
        return ReportValue.available(metrics, evidence)
    }

    private fun confirmedReturnDisposition(period: ReportPeriod): ReportValue<ConfirmedReturnDispositionMetrics> {
        val row = jdbc.queryForMap(
            """WITH selected AS (
                 SELECT c.id,c.confirmed_at,r.status,r.received_at,r.created_at,r.inspection_result,
                        (SELECT count(*) FROM order_items expected WHERE expected.order_id=r.order_id) expected_item_count,
                        count(ri.id) item_count,
                        count(DISTINCT ri.order_item_id) distinct_item_count,
                        COALESCE(sum(ri.restock_quantity::numeric),0) restock_units,
                        COALESCE(sum(ri.damaged_quantity::numeric),0) damaged_units,
                        COALESCE(sum(ri.rejected_quantity::numeric),0) rejected_units,
                        count(*) FILTER (WHERE ri.id IS NULL OR ri.disposition_command_id IS DISTINCT FROM c.id
                          OR oi.id IS NULL OR oi.order_id<>r.order_id OR ri.quantity<>oi.quantity
                          OR ri.restock_quantity IS NULL OR ri.damaged_quantity IS NULL OR ri.rejected_quantity IS NULL
                          OR ri.restock_quantity<0 OR ri.damaged_quantity<0 OR ri.rejected_quantity<0
                          OR ri.restock_quantity::bigint+ri.damaged_quantity::bigint+ri.rejected_quantity::bigint<>ri.quantity::bigint
                          OR (ri.restock_quantity=0 AND ri.adjustment_ledger_id IS NOT NULL)
                          OR (ri.restock_quantity>0 AND (l.id IS NULL OR l.variant_id<>oi.variant_id
                            OR l.event_type<>'RMA_RESTOCK' OR l.channel<>'INTERNAL' OR l.quantity_delta<>ri.restock_quantity))
                        ) invalid_item_count
                 FROM rma_disposition_commands c
                 JOIN returns r ON r.id=c.return_id
                 LEFT JOIN return_items ri ON ri.return_id=r.id
                 LEFT JOIN order_items oi ON oi.id=ri.order_item_id
                 LEFT JOIN inventory_ledger l ON l.id=ri.adjustment_ledger_id
                 WHERE c.confirmed_at>=? AND c.confirmed_at<?
                 GROUP BY c.id,c.confirmed_at,r.status,r.received_at,r.created_at,r.inspection_result,r.order_id
               )
               SELECT count(*) confirmed_count,
                      COALESCE(sum(restock_units),0) restock_units,
                      COALESCE(sum(damaged_units),0) damaged_units,
                      COALESCE(sum(rejected_units),0) rejected_units,
                      count(*) FILTER (WHERE status<>'CLOSED' OR received_at IS NULL
                        OR received_at<created_at OR confirmed_at<received_at OR confirmed_at<created_at OR inspection_result IS NOT NULL
                        OR item_count=0 OR item_count<>expected_item_count
                        OR item_count<>distinct_item_count OR invalid_item_count<>0) contradiction_count
               FROM selected""",
            Timestamp.from(period.fromInclusive),
            Timestamp.from(period.toExclusive),
        )
        if ((row["contradiction_count"] as Number).toLong() != 0L) return unavailableValue()
        val count = ReportUnsignedLong.fromValue((row["confirmed_count"] as Number).toLong()) ?: return unavailableValue()
        val restock = exactUnsigned(row["restock_units"]) ?: return unavailableValue()
        val damaged = exactUnsigned(row["damaged_units"]) ?: return unavailableValue()
        val rejected = exactUnsigned(row["rejected_units"]) ?: return unavailableValue()
        val metrics = ConfirmedReturnDispositionMetrics.create(count, restock, damaged, rejected) ?: return unavailableValue()
        val evidence = ReportEvidence.period(
            ReportSource.STORECORE_RETURN,
            ReportTimeBasis.DISPOSITION_CONFIRMED,
            ReportFreshness.CURRENT,
            period,
        ) ?: return unavailableValue()
        return ReportValue.available(metrics, evidence)
    }

    private fun exactUnsigned(raw: Any?): ReportUnsignedLong? =
        (raw as? BigDecimal)?.let { runCatching { it.longValueExact() }.getOrNull() }?.let(ReportUnsignedLong::fromValue)

    private fun blackStoreModuleState(period: ReportPeriod): ReportValue<ReportModuleState> {
        val rows = jdbc.query(
            """SELECT state,config_schema_version FROM module_configurations
               WHERE module_code='BLACKSTORE_INTEGRATION' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'""",
            { rs, _ -> ReportModuleState.fromWire(rs.getString("state")) to rs.getInt("config_schema_version") },
        )
        if (rows.isEmpty()) return missingValue()
        val row = rows.singleOrNull() ?: return unavailableValue()
        if (row.first == ReportModuleState.UNKNOWN || row.second != 2) return unavailableValue()
        return ReportValue.available(row.first, blackStoreEvidence(period))
    }

    private fun blackStoreRegistration(period: ReportPeriod): ReportValue<BlackStoreRegistrationReport> {
        val row = jdbc.queryForMap(
            """SELECT count(*) FILTER (WHERE status='REVOKED') revoked_count,
                      count(*) FILTER (WHERE status<>'REVOKED') live_count,
                      min(status) FILTER (WHERE status<>'REVOKED') live_state,
                      count(*) FILTER (WHERE status NOT IN ('DISABLED','ACTIVE','REVOKED')
                        OR (status='REVOKED')<>(revoked_at IS NOT NULL)
                        OR (revoked_at IS NOT NULL AND revoked_at<created_at)) contradiction_count
               FROM blackstore_companions""",
        )
        val liveCount = (row["live_count"] as Number).toLong()
        if ((row["contradiction_count"] as Number).toLong() != 0L || liveCount !in 0L..1L) return unavailableValue()
        val revoked = ReportUnsignedLong.fromValue((row["revoked_count"] as Number).toLong()) ?: return unavailableValue()
        val state = when (row["live_state"] as String?) {
            "DISABLED" -> BlackStoreRegistrationState.DISABLED
            "ACTIVE" -> BlackStoreRegistrationState.ACTIVE
            null -> if (revoked.value == 0L) BlackStoreRegistrationState.ABSENT else BlackStoreRegistrationState.REVOKED_ONLY
            else -> BlackStoreRegistrationState.UNKNOWN
        }
        val report = BlackStoreRegistrationReport.create(state, revoked) ?: return unavailableValue()
        return ReportValue.available(report, blackStoreEvidence(period))
    }

    private fun blackStoreOperations(period: ReportPeriod): ReportValue<BlackStoreOperationDiagnostics> {
        val overlap = jdbc.queryForObject(
            """SELECT count(*) FROM blackstore_integration_operations o
               JOIN blackstore_integration_operation_tombstones t
                 ON t.client_instance_id=o.client_instance_id AND t.device_id=o.device_id
                AND t.sale_id=o.sale_id AND t.operation_id=o.operation_id""",
            Long::class.java,
        ) ?: return unavailableValue()
        if (overlap != 0L) return unavailableValue()

        val retainedRows = jdbc.query(
            """SELECT state,count(*) row_count FROM blackstore_integration_operations
               GROUP BY state ORDER BY state""",
            { rs, _ -> BlackStoreOperationState.fromWire(rs.getString("state")) to rs.getLong("row_count") },
        )
        val retiredRows = jdbc.query(
            """SELECT final_state,count(*) row_count FROM blackstore_integration_operation_tombstones
               GROUP BY final_state ORDER BY final_state""",
            { rs, _ -> BlackStoreRetiredOperationState.fromWire(rs.getString("final_state")) to rs.getLong("row_count") },
        )
        if (retainedRows.any { it.first == BlackStoreOperationState.UNKNOWN || it.second < 0 } ||
            retiredRows.any { it.first == BlackStoreRetiredOperationState.UNKNOWN || it.second < 0 }) return unavailableValue()
        val retainedObserved = retainedRows.associate { it.first to it.second }
        val retiredObserved = retiredRows.associate { it.first to it.second }
        if (retainedObserved.size != retainedRows.size || retiredObserved.size != retiredRows.size) return unavailableValue()
        val retained = BlackStoreOperationState.admitted.associateWith { state ->
            ReportUnsignedLong.fromValue(retainedObserved[state] ?: 0L) ?: return unavailableValue()
        }
        val retired = BlackStoreRetiredOperationState.admitted.associateWith { state ->
            ReportUnsignedLong.fromValue(retiredObserved[state] ?: 0L) ?: return unavailableValue()
        }
        val evidence = blackStoreEvidence(period)
        val latestRetained = latestActivity("SELECT max(updated_at) FROM blackstore_integration_operations", evidence)
        val latestRetired = latestActivity("SELECT max(retired_at) FROM blackstore_integration_operation_tombstones", evidence)
        val report = BlackStoreOperationDiagnostics.create(retained, retired, latestRetained, latestRetired)
            ?: return unavailableValue()
        return ReportValue.available(report, evidence)
    }

    private fun latestActivity(sql: String, evidence: ReportEvidence): ReportValue<java.time.Instant> {
        val value = jdbc.queryForObject(sql, Timestamp::class.java)?.toInstant()
        return if (value == null) {
            requireNotNull(ReportValue.unavailable(ReportUnavailableReason.NO_EVIDENCE))
        } else {
            ReportValue.available(value, evidence)
        }
    }

    private fun blackStoreCatalogToken(period: ReportPeriod): ReportValue<OpaqueCatalogToken> {
        val raw = jdbc.queryForObject("SELECT COALESCE(MAX(updated_at)::text,'empty') FROM products", String::class.java)
        val token = OpaqueCatalogToken.fromWire(raw) ?: return unavailableValue()
        return ReportValue.available(token, blackStoreEvidence(period))
    }

    private fun blackStoreCurrentStock(period: ReportPeriod): ReportValue<BlackStoreCurrentStockReport> {
        val summary = jdbc.queryForMap(
            """SELECT count(*) active_count,
                      count(*) FILTER (WHERE b.variant_id IS NULL) missing_count,
                      count(*) FILTER (WHERE b.variant_id IS NOT NULL AND (
                        b.available_quantity<0 OR b.safety_stock<0 OR b.reserved_quantity<0
                        OR length(v.sku)=0 OR length(p.name)=0 OR length(v.label)=0
                        OR ascii(left(v.sku,1))<=32 OR ascii(right(v.sku,1))<=32
                        OR ascii(left(p.name,1))<=32 OR ascii(right(p.name,1))<=32
                        OR ascii(left(v.label,1))<=32 OR ascii(right(v.label,1))<=32
                      )) contradiction_count,
                      COALESCE(sum(GREATEST(0,b.available_quantity-b.safety_stock)::numeric)
                        FILTER (WHERE b.variant_id IS NOT NULL),0) sellable_units,
                      count(*) FILTER (WHERE b.variant_id IS NOT NULL
                        AND GREATEST(0,b.available_quantity-b.safety_stock)=0) zero_sellable_count
               FROM product_variants v JOIN products p ON p.id=v.product_id
               LEFT JOIN inventory_balances b ON b.variant_id=v.id
               WHERE v.active=TRUE AND p.status='ACTIVE'""",
        )
        if ((summary["missing_count"] as Number).toLong() != 0L) return missingValue()
        if ((summary["contradiction_count"] as Number).toLong() != 0L) return unavailableValue()
        val total = ReportUnsignedLong.fromValue((summary["active_count"] as Number).toLong()) ?: return unavailableValue()
        val sellable = exactUnsigned(summary["sellable_units"]) ?: return unavailableValue()
        val zero = ReportUnsignedLong.fromValue((summary["zero_sellable_count"] as Number).toLong()) ?: return unavailableValue()
        val items = blackStoreStockItems(ReportCollectionMode.DASHBOARD) ?: return unavailableValue()
        val report = BlackStoreCurrentStockReport.create(items, total, sellable, zero)
            ?: return unavailableValue()
        val evidence = ReportEvidence.current(
            ReportSource.STORECORE_CURRENT_INVENTORY,
            period.generatedAt,
            ReportFreshness.CURRENT,
        ) ?: return unavailableValue()
        return ReportValue.available(report, evidence)
    }

    private fun bestSellerItems(period: ReportPeriod, mode: ReportCollectionMode): List<BestSellerItem>? {
        val parameters = arrayOf(Timestamp.from(period.fromInclusive), Timestamp.from(period.toExclusive))
        val limitSql = mode.sqlLimit(BestSellerReport.LIMIT)
        val rows = jdbc.query(
            paymentAuthorityCte() + """, seller_units AS (
                SELECT oi.variant_id,sum(oi.quantity) gross_units
                FROM authority a JOIN order_items oi ON oi.order_id=a.order_id
                WHERE a.valid_authority IS TRUE GROUP BY oi.variant_id
            ), seller_labels AS (
                SELECT DISTINCT ON (oi.variant_id) oi.variant_id,oi.product_snapshot->>'sku' sku,
                    oi.product_snapshot->>'name' item_name
                FROM authority a JOIN order_items oi ON oi.order_id=a.order_id
                WHERE a.valid_authority IS TRUE
                ORDER BY oi.variant_id,a.applied_at DESC,oi.id DESC
            ) SELECT u.variant_id,l.sku,l.item_name,u.gross_units
                FROM seller_units u JOIN seller_labels l ON l.variant_id=u.variant_id
                ORDER BY u.gross_units DESC,u.variant_id ASC$limitSql""",
            { rs, _ ->
                val id = ReportUnsignedLong.fromValue(rs.getLong("variant_id"))
                val units = ReportUnsignedLong.fromValue(rs.getLong("gross_units"))
                if (id == null || units == null) null else BestSellerItem.create(id, rs.getString("sku"), rs.getString("item_name"), units)
            },
            *parameters,
        )
        return rows.takeIf { it.none { row -> row == null } }?.filterNotNull()
    }

    private fun lowStockItems(mode: ReportCollectionMode): List<LowStockItem>? {
        val limitSql = mode.sqlLimit(LowStockReport.LIMIT)
        val rows = jdbc.query(
            """SELECT v.id,v.sku,p.name product_name,v.label,b.available_quantity,b.safety_stock
               FROM product_variants v JOIN products p ON p.id=v.product_id JOIN inventory_balances b ON b.variant_id=v.id
               WHERE v.active=TRUE AND p.status='ACTIVE' AND b.available_quantity<=b.safety_stock
               ORDER BY b.available_quantity ASC,v.id ASC$limitSql""",
            { rs, _ ->
                val id = ReportUnsignedLong.fromValue(rs.getLong("id"))
                val available = ReportUnsignedLong.fromValue(rs.getLong("available_quantity"))
                val safety = ReportUnsignedLong.fromValue(rs.getLong("safety_stock"))
                if (id == null || available == null || safety == null) null else LowStockItem.create(
                    id, rs.getString("sku"), rs.getString("product_name"), rs.getString("label"), available, safety,
                )
            },
        )
        return rows.takeIf { it.none { row -> row == null } }?.filterNotNull()
    }

    private fun blackStoreStockItems(mode: ReportCollectionMode): List<BlackStoreStockItem>? {
        val limitSql = mode.sqlLimit(BlackStoreCurrentStockReport.LIMIT)
        val rows = jdbc.query(
            """SELECT v.id,v.sku,p.name product_name,v.label,
                      GREATEST(0,b.available_quantity-b.safety_stock) sellable_quantity
               FROM product_variants v JOIN products p ON p.id=v.product_id
               JOIN inventory_balances b ON b.variant_id=v.id
               WHERE v.active=TRUE AND p.status='ACTIVE'
               ORDER BY v.id ASC$limitSql""",
            { rs, _ ->
                val id = ReportUnsignedLong.fromValue(rs.getLong("id"))
                val quantity = ReportUnsignedLong.fromValue(rs.getLong("sellable_quantity"))
                if (id == null || quantity == null) null else BlackStoreStockItem.create(
                    id, rs.getString("sku"), rs.getString("product_name"), rs.getString("label"), quantity,
                )
            },
        )
        return rows.takeIf { it.none { row -> row == null } }?.filterNotNull()
    }

    private fun blackStoreEvidence(period: ReportPeriod): ReportEvidence = requireNotNull(
        ReportEvidence.current(ReportSource.BLACKSTORE_STOCK_SAGA, period.generatedAt, ReportFreshness.CURRENT),
    )

    private fun <T : Any> missingValue(): ReportValue<T> =
        requireNotNull(ReportValue.unavailable(ReportUnavailableReason.SOURCE_MISSING))

    private fun <T : Any> unavailableValue(): ReportValue<T> =
        requireNotNull(ReportValue.unavailable(ReportUnavailableReason.SOURCE_CONTRADICTORY))

    private data class PaymentProjection(
        val metrics: ReportValue<AppliedAccreditationMetrics>,
        val bestSellers: ReportValue<BestSellerReport>,
    )

    private sealed interface SnapshotPeriodResolution {
        class Found(val period: ReportPeriod) : SnapshotPeriodResolution
        data object TimezoneUnavailable : SnapshotPeriodResolution
        data object SourceUnavailable : SnapshotPeriodResolution
    }

    private sealed interface SnapshotCsvPreparation {
        class Ready(val bytes: ByteArray) : SnapshotCsvPreparation
        class CommittedCandidate(val artifact: PreparedChannelReportCsv) : SnapshotCsvPreparation
        data object StalePeriod : SnapshotCsvPreparation
        data object TooLarge : SnapshotCsvPreparation
        data object SourceUnavailable : SnapshotCsvPreparation
    }

    private enum class ReportCollectionMode {
        DASHBOARD, EXPORT_ALL;

        fun sqlLimit(dashboardLimit: Int): String = when (this) {
            DASHBOARD -> " LIMIT $dashboardLimit"
            EXPORT_ALL -> ""
        }
    }
}
