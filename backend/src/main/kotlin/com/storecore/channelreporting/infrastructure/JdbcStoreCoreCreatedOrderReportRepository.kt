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

class JdbcStoreCoreCreatedOrderReportRepository(
    source: DataSource,
    private val hasher: ReportPeriodHasher,
) : StoreCoreCreatedOrderReportRepository {
    private val jdbc = JdbcTemplate(source)
    private val transaction = TransactionTemplate(DataSourceTransactionManager(source)).apply {
        isolationLevel = TransactionDefinition.ISOLATION_REPEATABLE_READ
        isReadOnly = true
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
    }

    override fun read(fromDate: String?, toDateExclusive: String?): StoreCoreCreatedOrderReadResult {
        if (!ReportPeriod.validRequest(fromDate, toDateExclusive)) return StoreCoreCreatedOrderReadResult.InvalidPeriod
        return try {
            transaction.execute {
                val transactionContract = jdbc.queryForMap(
                    "SELECT current_setting('transaction_isolation') isolation, current_setting('transaction_read_only') read_only",
                )
                if (transactionContract["isolation"] != "repeatable read" || transactionContract["read_only"] != "on") {
                    return@execute unavailable(ReportUnavailableReason.READ_FAILED)
                }
                val zone = jdbc.query("SELECT timezone FROM installation_settings WHERE installation_id=1", { row, _ -> row.getString(1) }).singleOrNull()
                    ?: return@execute StoreCoreCreatedOrderReadResult.TimezoneUnavailable
                val generatedAt = jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)?.toInstant()
                    ?: return@execute unavailable(ReportUnavailableReason.READ_FAILED)
                val period = ReportPeriod.create(fromDate, toDateExclusive, zone, generatedAt, hasher)
                    ?: return@execute StoreCoreCreatedOrderReadResult.TimezoneUnavailable
                val row = jdbc.queryForMap(
                    """SELECT count(*) row_count, COALESCE(sum(total),0.00) nominal_total,
                              count(*) FILTER (WHERE currency<>'ARS' OR total<0 OR subtotal<0 OR shipping_cost<0 OR total<>subtotal+shipping_cost) contradiction_count
                       FROM orders WHERE created_at>=? AND created_at<?""",
                    Timestamp.from(period.fromInclusive), Timestamp.from(period.toExclusive),
                )
                if ((row["contradiction_count"] as Number).toLong() != 0L) {
                    return@execute unavailable(ReportUnavailableReason.SOURCE_CONTRADICTORY)
                }
                val count = ReportUnsignedLong.fromValue((row["row_count"] as Number).toLong())
                val amount = ReportArsAmount.fromValue(row["nominal_total"] as BigDecimal)
                val evidence = ReportEvidence.period(ReportSource.STORECORE_ORDER, ReportTimeBasis.ORDER_CREATED, ReportFreshness.CURRENT, period)
                if (count == null || amount == null || evidence == null) {
                    unavailable(ReportUnavailableReason.SOURCE_CONTRADICTORY)
                } else {
                    val paymentProjection = appliedAccreditations(period)
                    val paymentDisposition = paymentDisposition(period)
                    val inventoryMovements = inventoryMovements(period)
                    val lowStock = lowStock(period)
                    StoreCoreCreatedOrderReadResult.Found(StoreCoreCreatedOrderReport(
                        period,
                        ReportValue.available(CreatedOrderMetrics(count, amount), evidence),
                        paymentProjection.metrics,
                        paymentProjection.bestSellers,
                        paymentDisposition,
                        inventoryMovements,
                        lowStock,
                    ))
                }
            } ?: unavailable(ReportUnavailableReason.READ_FAILED)
        } catch (_: DataAccessException) {
            unavailable(ReportUnavailableReason.READ_FAILED)
        } catch (_: TransactionException) {
            unavailable(ReportUnavailableReason.READ_FAILED)
        }
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
        val items = jdbc.query(
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
                ORDER BY u.gross_units DESC,u.variant_id ASC LIMIT ${BestSellerReport.LIMIT}""",
            { rs, _ ->
                val id = ReportUnsignedLong.fromValue(rs.getLong("variant_id"))
                val units = ReportUnsignedLong.fromValue(rs.getLong("gross_units"))
                if (id == null || units == null) null else BestSellerItem.create(id, rs.getString("sku"), rs.getString("item_name"), units)
            },
            *parameters,
        )
        if (items.any { it == null }) return PaymentProjection(ReportValue.available(metrics, paymentEvidence), unavailableValue())
        val sellerReport = BestSellerReport.create(items.filterNotNull(), ReportUnsignedLong.fromValue(total) ?: return contradictoryPaymentProjection())
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
        val items = jdbc.query(
            """SELECT v.id,v.sku,p.name product_name,v.label,b.available_quantity,b.safety_stock
               FROM product_variants v JOIN products p ON p.id=v.product_id JOIN inventory_balances b ON b.variant_id=v.id
               WHERE v.active=TRUE AND p.status='ACTIVE' AND b.available_quantity<=b.safety_stock
               ORDER BY b.available_quantity ASC,v.id ASC LIMIT ${LowStockReport.LIMIT}""",
            { rs, _ ->
                val id = ReportUnsignedLong.fromValue(rs.getLong("id"))
                val available = ReportUnsignedLong.fromValue(rs.getLong("available_quantity"))
                val safety = ReportUnsignedLong.fromValue(rs.getLong("safety_stock"))
                if (id == null || available == null || safety == null) null else LowStockItem.create(
                    id, rs.getString("sku"), rs.getString("product_name"), rs.getString("label"), available, safety,
                )
            },
        )
        if (items.any { it == null }) return unavailableValue()
        val report = LowStockReport.create(items.filterNotNull(), total) ?: return unavailableValue()
        val evidence = ReportEvidence.current(
            ReportSource.STORECORE_CURRENT_INVENTORY,
            period.generatedAt,
            ReportFreshness.CURRENT,
        ) ?: return unavailableValue()
        return ReportValue.available(report, evidence)
    }

    private fun <T : Any> unavailableValue(): ReportValue<T> =
        requireNotNull(ReportValue.unavailable(ReportUnavailableReason.SOURCE_CONTRADICTORY))

    private data class PaymentProjection(
        val metrics: ReportValue<AppliedAccreditationMetrics>,
        val bestSellers: ReportValue<BestSellerReport>,
    )
}
