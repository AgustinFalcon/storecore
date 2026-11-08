package com.storecore.overview.infrastructure

import com.storecore.overview.application.OverviewRepository
import com.storecore.overview.application.OverviewTimezoneUnavailable
import com.storecore.overview.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.sql.Timestamp
import java.time.DateTimeException
import java.time.Instant
import java.time.ZoneId

@Repository
open class JdbcOverviewRepository(private val jdbc: JdbcTemplate) : OverviewRepository {
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    override fun read(period: OverviewPeriod): Overview {
        val timezone = jdbc.query("SELECT timezone FROM installation_settings WHERE installation_id=1", { rs, _ -> rs.getString(1) })
            .singleOrNull() ?: throw OverviewTimezoneUnavailable()
        val zone = try { ZoneId.of(timezone) } catch (_: DateTimeException) { throw OverviewTimezoneUnavailable() }
        val now = jdbc.queryForObject("SELECT CURRENT_TIMESTAMP", Timestamp::class.java)?.toInstant()
            ?: throw OverviewTimezoneUnavailable()
        val today = now.atZone(zone).toLocalDate()
        val firstDay = when (period) {
            OverviewPeriod.TODAY -> today
            OverviewPeriod.LAST_7_DAYS -> today.minusDays(6)
            OverviewPeriod.LAST_30_DAYS -> today.minusDays(29)
            OverviewPeriod.UNKNOWN -> throw IllegalArgumentException("UNKNOWN overview period reached repository")
        }
        val from = firstDay.atStartOfDay(zone).toInstant()
        val inventory = inventory()
        return Overview(
            period, timezone, from, now,
            revenue(from, now),
            OverviewFact.known(countOrders(from, now)),
            OverviewFact.known(jdbc.queryForObject("SELECT count(*) FROM customers WHERE active=TRUE", Long::class.java) ?: 0L),
            inventory.count,
            pendingPayments(), fulfillment(), inventory.queue,
        )
    }

    private fun countOrders(from: Instant, to: Instant): Long = jdbc.queryForObject(
        "SELECT count(*) FROM orders WHERE created_at>=? AND created_at<?", Long::class.java,
        Timestamp.from(from), Timestamp.from(to),
    ) ?: 0L

    private fun revenue(from: Instant, to: Instant): OverviewFact<BigDecimal> {
        val row = jdbc.queryForMap(
            authorityCte("o.created_at>=? AND o.created_at<?") +
                """SELECT count(*) FILTER (WHERE unresolved_incident OR unresolved_reversal OR invalid_exclusion_evidence OR
                         (NOT excluded AND ((paid AND NOT valid_authority) OR (NOT paid AND has_approved_payment)))) contradiction_count,
                          COALESCE(sum(total) FILTER (WHERE paid AND valid_authority AND NOT excluded AND NOT unresolved_incident AND NOT unresolved_reversal),0) revenue
                   FROM classified""",
            Timestamp.from(from), Timestamp.from(to),
        )
        return if (number(row, "contradiction_count") > 0) {
            OverviewFact.unavailable(OverviewUnavailableReason.PAYMENT_FACTS_INCOMPLETE)
        } else OverviewFact.known(row["revenue"] as BigDecimal)
    }

    private fun pendingPayments(): OverviewQueue<PendingPaymentItem> {
        val summary = jdbc.queryForMap(
            authorityCte("o.status IN ('CREATED','PENDING_PAYMENT')") +
                """SELECT count(*) total_count,
                          count(*) FILTER (WHERE unresolved_incident OR unresolved_reversal OR invalid_exclusion_evidence OR
                                                   (NOT excluded AND has_approved_payment)) contradiction_count
                   FROM classified""",
        )
        if (number(summary, "contradiction_count") > 0) return OverviewQueue.unavailable(OverviewUnavailableReason.PAYMENT_FACTS_INCOMPLETE)
        val total = number(summary, "total_count")
        val items = jdbc.query(
            """SELECT o.id,o.order_number,o.total,o.created_at,latest.status payment_status
               FROM orders o LEFT JOIN LATERAL (
                 SELECT p.status FROM payments p WHERE p.order_id=o.id ORDER BY p.updated_at DESC,p.id DESC LIMIT 1
               ) latest ON TRUE
               WHERE o.status IN ('CREATED','PENDING_PAYMENT')
               ORDER BY o.created_at ASC,o.id ASC LIMIT $QUEUE_LIMIT""",
            { rs, _ -> PendingPaymentItem(
                rs.getLong("id"), rs.getString("order_number"), rs.getBigDecimal("total"), rs.getTimestamp("created_at").toInstant(),
                when (rs.getString("payment_status")) {
                    null, "CANCELLED", "REFUNDED", "CHARGED_BACK" -> PendingPaymentReason.NO_PAYMENT
                    "PENDING" -> PendingPaymentReason.PENDING
                    "REJECTED" -> PendingPaymentReason.REJECTED
                    else -> PendingPaymentReason.UNKNOWN
                },
            ) },
        )
        if (items.any { it.reason == PendingPaymentReason.UNKNOWN }) return OverviewQueue.unavailable(OverviewUnavailableReason.PAYMENT_FACTS_INCOMPLETE)
        return OverviewQueue.known(items, total)
    }

    private fun fulfillment(): OverviewQueue<FulfillmentItem> {
        val cte = authorityCte("o.status IN ('PAID','PAID_STOCK_REVIEW')")
        val summary = jdbc.queryForMap(
            cte + """SELECT count(*) FILTER (WHERE unresolved_incident OR unresolved_reversal OR invalid_exclusion_evidence OR
                                                      (NOT excluded AND NOT valid_authority)) payment_contradiction_count,
                              count(*) FILTER (WHERE shipment_status NOT IN ('PENDING','PREPARING','SHIPPED','DELIVERED','CANCELLED')) shipment_contradiction_count,
                              count(*) FILTER (WHERE valid_authority AND NOT excluded AND NOT unresolved_incident AND NOT unresolved_reversal AND
                                      (shipment_status IS NULL OR shipment_status IN ('PENDING','PREPARING','SHIPPED'))) total_count
                       FROM classified""",
        )
        if (number(summary, "payment_contradiction_count") > 0) return OverviewQueue.unavailable(OverviewUnavailableReason.PAYMENT_FACTS_INCOMPLETE)
        if (number(summary, "shipment_contradiction_count") > 0) return OverviewQueue.unavailable(OverviewUnavailableReason.SHIPMENT_FACTS_INCOMPLETE)
        val total = number(summary, "total_count")
        val items = jdbc.query(
            cte + """SELECT id,order_number,total,created_at,paid_at,shipment_status FROM classified
                       WHERE valid_authority AND NOT excluded AND NOT unresolved_incident AND NOT unresolved_reversal AND
                             (shipment_status IS NULL OR shipment_status IN ('PENDING','PREPARING','SHIPPED'))
                       ORDER BY created_at ASC,id ASC LIMIT $QUEUE_LIMIT""",
            { rs, _ -> FulfillmentItem(
                rs.getLong("id"), rs.getString("order_number"), rs.getBigDecimal("total"), rs.getTimestamp("paid_at").toInstant(),
                when (rs.getString("shipment_status")) {
                    null -> OverviewShipmentState.MISSING
                    "PENDING" -> OverviewShipmentState.PENDING
                    "PREPARING" -> OverviewShipmentState.PREPARING
                    "SHIPPED" -> OverviewShipmentState.SHIPPED
                    else -> OverviewShipmentState.UNKNOWN
                },
            ) },
        )
        if (items.any { it.shipmentState == OverviewShipmentState.UNKNOWN }) {
            return OverviewQueue.unavailable(OverviewUnavailableReason.SHIPMENT_FACTS_INCOMPLETE)
        }
        return OverviewQueue.known(items, total)
    }

    private fun inventory(): InventoryProjection {
        val summary = jdbc.queryForMap(
            """SELECT count(*) FILTER (WHERE b.variant_id IS NULL) missing_count,
                      count(*) FILTER (WHERE b.variant_id IS NOT NULL AND b.available_quantity<=b.safety_stock) low_count
               FROM product_variants v JOIN products p ON p.id=v.product_id
               LEFT JOIN inventory_balances b ON b.variant_id=v.id
               WHERE v.active=TRUE AND p.status='ACTIVE'""",
        )
        if (number(summary, "missing_count") > 0) return InventoryProjection(
            OverviewFact.unavailable(OverviewUnavailableReason.INVENTORY_FACTS_INCOMPLETE),
            OverviewQueue.unavailable(OverviewUnavailableReason.INVENTORY_FACTS_INCOMPLETE),
        )
        val total = number(summary, "low_count")
        val items = jdbc.query(
            """SELECT v.id,v.sku,p.name product_name,v.label,b.available_quantity,b.safety_stock
               FROM product_variants v JOIN products p ON p.id=v.product_id JOIN inventory_balances b ON b.variant_id=v.id
               WHERE v.active=TRUE AND p.status='ACTIVE' AND b.available_quantity<=b.safety_stock
               ORDER BY b.available_quantity ASC,v.sku ASC LIMIT $QUEUE_LIMIT""",
            { rs, _ -> LowStockItem(rs.getLong("id"), rs.getString("sku"), rs.getString("product_name"),
                rs.getString("label"), rs.getInt("available_quantity"), rs.getInt("safety_stock")) },
        )
        return InventoryProjection(OverviewFact.known(total), OverviewQueue.known(items, total))
    }

    private fun authorityCte(scope: String): String = """WITH scoped_orders AS (
          SELECT o.id,o.order_number,o.status,o.total,o.currency,o.created_at FROM orders o WHERE $scope
        ), authority AS (
          SELECT so.*,
                 count(c.id) authority_count,
                 COALESCE(bool_and(a.order_id=c.order_id AND p.order_id=c.order_id AND a.provider_order_id=c.provider_order_id
                   AND a.state='ACCREDITED' AND p.status='APPROVED' AND p.amount=a.amount AND a.amount=c.confirmed_amount
                   AND c.confirmed_amount=so.total AND p.currency=a.currency AND a.currency=c.confirmed_currency
                   AND c.confirmed_currency=so.currency) FILTER (WHERE c.id IS NOT NULL),FALSE) authority_consistent,
                 max(c.applied_at) FILTER (WHERE c.id IS NOT NULL) paid_at,
                 EXISTS(SELECT 1 FROM payments orphan WHERE orphan.order_id=so.id AND orphan.status='APPROVED') has_approved_payment,
                 EXISTS(SELECT 1 FROM mp_order_commercial_applications tc
                        JOIN mp_checkout_attempts ta ON ta.id=tc.attempt_id
                        JOIN payments terminal ON terminal.id=ta.payment_id
                        WHERE tc.order_id=so.id AND tc.transition='PAYMENT_ACCREDITED'
                          AND terminal.status IN ('REFUNDED','CHARGED_BACK','CANCELLED')
                          AND ta.order_id=tc.order_id AND terminal.order_id=tc.order_id
                          AND ta.provider_order_id=tc.provider_order_id AND ta.state='ACCREDITED'
                          AND terminal.amount=ta.amount AND ta.amount=tc.confirmed_amount AND tc.confirmed_amount=so.total
                          AND terminal.currency=ta.currency AND ta.currency=tc.confirmed_currency AND tc.confirmed_currency=so.currency)
                   OR EXISTS(SELECT 1 FROM mp_order_reversal_cases r JOIN mp_checkout_attempts ra ON ra.id=r.attempt_id
                             WHERE ra.order_id=so.id AND r.review_status='RESOLVED' AND r.provider_order_id=ra.provider_order_id) excluded,
                 EXISTS(SELECT 1 FROM mp_order_commercial_applications tc
                        JOIN mp_checkout_attempts ta ON ta.id=tc.attempt_id
                        JOIN payments terminal ON terminal.id=ta.payment_id
                        WHERE tc.order_id=so.id AND tc.transition='PAYMENT_ACCREDITED'
                          AND terminal.status IN ('REFUNDED','CHARGED_BACK','CANCELLED')
                          AND NOT COALESCE((ta.order_id=tc.order_id AND terminal.order_id=tc.order_id
                            AND ta.provider_order_id=tc.provider_order_id AND ta.state='ACCREDITED'
                            AND terminal.amount=ta.amount AND ta.amount=tc.confirmed_amount AND tc.confirmed_amount=so.total
                            AND terminal.currency=ta.currency AND ta.currency=tc.confirmed_currency AND tc.confirmed_currency=so.currency),FALSE))
                   OR EXISTS(SELECT 1 FROM mp_order_reversal_cases r JOIN mp_checkout_attempts ra ON ra.id=r.attempt_id
                             WHERE ra.order_id=so.id AND r.review_status='RESOLVED'
                               AND r.provider_order_id IS DISTINCT FROM ra.provider_order_id) invalid_exclusion_evidence,
                 EXISTS(SELECT 1 FROM mp_order_reversal_cases r JOIN mp_checkout_attempts ra ON ra.id=r.attempt_id
                        WHERE ra.order_id=so.id AND r.review_status IN ('OPEN','UNDER_REVIEW')) unresolved_reversal,
                 EXISTS(SELECT 1 FROM mp_order_incidents i WHERE i.order_id=so.id AND i.review_status NOT IN ('RESOLVED','REJECTED')) unresolved_incident,
                 s.status shipment_status
          FROM scoped_orders so
          LEFT JOIN mp_order_commercial_applications c ON c.order_id=so.id AND c.transition='PAYMENT_ACCREDITED'
          LEFT JOIN mp_checkout_attempts a ON a.id=c.attempt_id
          LEFT JOIN payments p ON p.id=a.payment_id
          LEFT JOIN shipments s ON s.order_id=so.id
          GROUP BY so.id,so.order_number,so.status,so.total,so.currency,so.created_at,s.status
        ), classified AS (
          SELECT *,status IN ('PAID','PAID_STOCK_REVIEW') paid,
                 authority_count=1 AND authority_consistent valid_authority
          FROM authority
        ) """

    private fun number(row: Map<String, Any>, key: String): Long = (row[key] as Number).toLong()
    private data class InventoryProjection(val count: OverviewFact<Long>, val queue: OverviewQueue<LowStockItem>)
    private companion object { const val QUEUE_LIMIT = 50 }
}
