package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.domain.*
import com.storecore.identity.application.ResourceNotFound
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import org.springframework.web.server.ResponseStatusException
import org.springframework.http.HttpStatus

/** Purpose-limited projection: no provider payload, actor or live customer data crosses this boundary. */
@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcOrderProjection(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    data class PageIds(val ids: List<Long>, val page: Int, val size: Int, val total: Long)

    fun page(customerId: Long?, page: Int, size: Int, order: String?, payment: String?, shipment: String?): PageIds {
        if (page < 0 || size !in 1..50) invalid()
        val orderFilter = order?.let { OrderStatus.fromWire(it).also { v -> if (v == OrderStatus.UNKNOWN) invalid() } }
        val paymentFilter = payment?.let { PaymentStatus.fromWire(it).also { v -> if (v == PaymentStatus.UNKNOWN) invalid() } }
        val shipmentFilter = shipment?.let { if (it == ShipmentStatus.NOT_CREATED.name) ShipmentStatus.NOT_CREATED else ShipmentStatus.fromWire(it).also { v -> if (v == ShipmentStatus.UNKNOWN) invalid() } }
        val predicates = mutableListOf("TRUE")
        val args = mutableListOf<Any>()
        if (customerId != null) { predicates += "customer_id=?"; args += customerId }
        if (orderFilter != null) { predicates += "projected_order=?"; args += orderFilter.name }
        if (paymentFilter != null) { predicates += "projected_payment=?"; args += paymentFilter.name }
        if (shipmentFilter != null) { predicates += "COALESCE(shipment_status,'NOT_CREATED')=?"; args += shipmentFilter.name }
        val where = predicates.joinToString(" AND ")
        val total = jdbc.queryForObject("$AUTHORITY SELECT count(*) FROM classified WHERE $where", Long::class.java, *args.toTypedArray())!!
        val ids = jdbc.query("$AUTHORITY SELECT id FROM classified WHERE $where ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?", { rs, _ -> rs.getLong("id") }, *(args + listOf(size, page.toLong() * size)).toTypedArray())
        return PageIds(ids, page, size, total)
    }

    fun enrich(view: OrderView): OrderView {
        val id = view.id.toLong()
        val header = jdbc.query("$AUTHORITY SELECT * FROM classified WHERE id=?", { rs, _ ->
            val paymentStatus = PaymentStatus.fromWire(rs.getString("projected_payment"))
            val payment = if (paymentStatus == PaymentStatus.UNKNOWN) OrderFact.unavailable<PaymentStatus>(
                if (rs.getBoolean("contradictory")) OrderUnavailableReason.SOURCE_CONTRADICTORY else OrderUnavailableReason.SOURCE_MISSING)
                else OrderFact.known(paymentStatus)
            val buyer = mapper.readTree(rs.getString("buyer_snapshot"))
            val persistedReturn = when {
                rs.getLong("return_count") == 0L -> RmaStatus.NONE
                rs.getBoolean("unknown_return") -> RmaStatus.UNKNOWN
                else -> RmaStatus.REQUESTED
            }
            fun text(key: String): String? = buyer.path(key).takeIf { it.isTextual }?.asText()?.takeIf { it.isNotBlank() }
            fun fact(key: String): OrderFact<String> = text(key)?.let { OrderFact.known(it) } ?: OrderFact.unavailable(OrderUnavailableReason.SOURCE_MISSING)
            val delivery: OrderFact<DeliverySnapshot> = if (listOf("street", "city", "province", "postalCode").all { text(it) != null })
                OrderFact.known(DeliverySnapshot(text("recipient"), listOfNotNull(text("street"), text("number")).joinToString(" "), text("city"), text("province"), text("postalCode"), text("country")))
                else OrderFact.unavailable(OrderUnavailableReason.SOURCE_MISSING)
            view.copy(orderNumber = rs.getString("order_number"), createdAt = rs.getTimestamp("created_at").toInstant(), updatedAt = rs.getTimestamp("updated_at").toInstant(),
                currency = rs.getString("currency"), subtotal = rs.getBigDecimal("subtotal"), shippingCost = rs.getBigDecimal("shipping_cost"), buyerName = fact("name"), buyerEmail = fact("email"), delivery = delivery,
                payment = payment, paymentStatus = paymentStatus,
                orderStatus = OrderStatus.fromWire(rs.getString("projected_order")),
                fulfillmentEligibility = view.fulfillmentEligibility.withPayment(payment),
                returnEligibility = ReturnEligibility.evaluate(payment, view.shipmentStatus, persistedReturn),
                shipmentAction = view.shipmentAction.takeIf { payment.value == PaymentStatus.APPROVED }, rmaAction = view.rmaAction.takeIf { payment.value == PaymentStatus.APPROVED })
        }, id).singleOrNull() ?: throw ResourceNotFound()
        return header.copy(timeline = timeline(id, header))
    }

    private fun timeline(id: Long, view: OrderView): OrderFact<List<OrderTimelineEvent>> {
        val createdAt = requireNotNull(view.createdAt)
        val events = mutableListOf(OrderTimelineEvent("order:$id", OrderTimelineEventKind.ORDER_CREATED, createdAt))
        if (view.payment.state != OrderFactState.KNOWN) return OrderFact.unavailable(view.payment.reason ?: OrderUnavailableReason.SOURCE_CONTRADICTORY)
        if (view.payment.value == PaymentStatus.PENDING) events += OrderTimelineEvent("pending:$id", OrderTimelineEventKind.PAYMENT_PENDING, createdAt)
        if (view.payment.value in listOf(PaymentStatus.APPROVED, PaymentStatus.REFUNDED, PaymentStatus.CHARGED_BACK, PaymentStatus.CANCELLED)) {
            events += jdbc.query("SELECT id,applied_at FROM mp_order_commercial_applications WHERE order_id=? AND transition='PAYMENT_ACCREDITED'", { rs, _ ->
                OrderTimelineEvent("payment:${rs.getLong("id")}", OrderTimelineEventKind.PAYMENT_ACCREDITED, rs.getTimestamp("applied_at").toInstant()) }, id)
            events += jdbc.query("SELECT r.id,r.updated_at FROM mp_order_reversal_cases r JOIN mp_checkout_attempts a ON a.id=r.attempt_id WHERE a.order_id=? AND r.review_status='RESOLVED' AND r.provider_order_id=a.provider_order_id", { rs, _ ->
                OrderTimelineEvent("reversal:${rs.getLong("id")}", OrderTimelineEventKind.PAYMENT_REVERSED, rs.getTimestamp("updated_at").toInstant()) }, id)
            events += jdbc.query("SELECT p.id,p.updated_at FROM mp_order_commercial_applications c JOIN mp_checkout_attempts a ON a.id=c.attempt_id JOIN payments p ON p.id=a.payment_id WHERE c.order_id=? AND c.transition='PAYMENT_ACCREDITED' AND p.status IN ('REFUNDED','CHARGED_BACK','CANCELLED')", { rs, _ ->
                OrderTimelineEvent("terminal:${rs.getLong("id")}", OrderTimelineEventKind.PAYMENT_REVERSED, rs.getTimestamp("updated_at").toInstant()) }, id)
        }
        events += jdbc.query("SELECT e.id,e.event_type,e.occurred_at FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id=?", { rs, _ ->
            val kind = when (ShipmentStatus.fromWire(rs.getString("event_type"))) {
                ShipmentStatus.PREPARING -> OrderTimelineEventKind.SHIPMENT_PREPARING
                ShipmentStatus.SHIPPED -> OrderTimelineEventKind.SHIPMENT_SHIPPED
                ShipmentStatus.DELIVERED -> OrderTimelineEventKind.SHIPMENT_DELIVERED
                ShipmentStatus.CANCELLED -> OrderTimelineEventKind.SHIPMENT_CANCELLED
                else -> OrderTimelineEventKind.UNKNOWN
            }
            OrderTimelineEvent("shipment:${rs.getLong("id")}", kind, rs.getTimestamp("occurred_at").toInstant()) }, id)
        events += jdbc.query("SELECT id,status,created_at,updated_at FROM returns WHERE order_id=?", { rs, _ ->
            val status = RmaStatus.fromWire(rs.getString("status"))
            val opened = OrderTimelineEvent("return:${rs.getLong("id")}:open", OrderTimelineEventKind.RETURN_OPENED, rs.getTimestamp("created_at").toInstant())
            if (status == RmaStatus.CLOSED || status == RmaStatus.REJECTED) listOf(opened, OrderTimelineEvent("return:${rs.getLong("id")}:resolved", OrderTimelineEventKind.RETURN_RESOLVED, rs.getTimestamp("updated_at").toInstant()))
            else listOf(opened.copy(kind = if (status == RmaStatus.UNKNOWN) OrderTimelineEventKind.UNKNOWN else opened.kind)) }, id).flatten()
        return OrderFact.known(events.sortedWith(compareBy<OrderTimelineEvent> { it.occurredAt }.thenBy { it.id }))
    }

    private fun invalid(): Nothing = throw ResponseStatusException(HttpStatus.BAD_REQUEST, "INVALID_ORDER_QUERY")

    companion object {
        /** Same amount/currency/order/provider rule as the overview, including terminal and review evidence. */
        private val AUTHORITY = """WITH authority AS (
          SELECT o.*,s.status shipment_status,
            (SELECT count(*) FROM returns r WHERE r.order_id=o.id) return_count,
            EXISTS(SELECT 1 FROM returns r WHERE r.order_id=o.id AND r.status NOT IN ('REQUESTED','APPROVED','RETURN_RECEIVED','INSPECTED','REJECTED','CLOSED')) unknown_return,
            (SELECT count(*) FROM mp_order_commercial_applications c WHERE c.order_id=o.id AND c.transition='PAYMENT_ACCREDITED') credits,
            (SELECT count(*) FROM mp_order_commercial_applications c JOIN mp_checkout_attempts a ON a.id=c.attempt_id JOIN payments p ON p.id=a.payment_id
              WHERE c.order_id=o.id AND c.transition='PAYMENT_ACCREDITED' AND a.order_id=c.order_id AND p.order_id=c.order_id
                AND a.provider_order_id=c.provider_order_id AND a.state='ACCREDITED'
                AND p.amount=a.amount AND a.amount=c.confirmed_amount AND c.confirmed_amount=o.total
                AND p.currency=a.currency AND a.currency=c.confirmed_currency AND c.confirmed_currency=o.currency
                AND p.status IN ('APPROVED','REFUNDED','CHARGED_BACK','CANCELLED')) valid_credits,
            (SELECT min(p.status) FROM mp_order_commercial_applications c JOIN mp_checkout_attempts a ON a.id=c.attempt_id JOIN payments p ON p.id=a.payment_id WHERE c.order_id=o.id AND c.transition='PAYMENT_ACCREDITED') credited_status,
            (SELECT count(*) FROM payments p WHERE p.order_id=o.id AND p.status IN ('APPROVED','REFUNDED','CHARGED_BACK') AND NOT EXISTS
              (SELECT 1 FROM mp_order_commercial_applications c JOIN mp_checkout_attempts a ON a.id=c.attempt_id WHERE c.order_id=o.id AND c.transition='PAYMENT_ACCREDITED' AND a.payment_id=p.id)) orphan_approved,
            EXISTS(SELECT 1 FROM mp_order_incidents i WHERE i.order_id=o.id AND i.review_status NOT IN ('RESOLVED','REJECTED')) incident,
            EXISTS(SELECT 1 FROM mp_order_reversal_cases r JOIN mp_checkout_attempts a ON a.id=r.attempt_id WHERE a.order_id=o.id
              AND (r.review_status NOT IN ('RESOLVED','REJECTED') OR (r.review_status='RESOLVED' AND (r.provider_order_id IS DISTINCT FROM a.provider_order_id
                OR NOT EXISTS (SELECT 1 FROM mp_order_commercial_applications rc WHERE rc.order_id=o.id AND rc.attempt_id=a.id AND rc.provider_order_id=r.provider_order_id AND rc.transition='PAYMENT_ACCREDITED'))))) ambiguous_reversal,
            (SELECT min(r.kind) FROM mp_order_reversal_cases r JOIN mp_checkout_attempts a ON a.id=r.attempt_id WHERE a.order_id=o.id AND r.review_status='RESOLVED' AND r.provider_order_id=a.provider_order_id) reversal,
            (SELECT count(*) FROM payments p WHERE p.order_id=o.id) payment_count,
            (SELECT min(p.status) FROM payments p WHERE p.order_id=o.id) raw_status
          FROM orders o LEFT JOIN shipments s ON s.order_id=o.id
        ), checked AS (
          SELECT *, (incident OR ambiguous_reversal OR orphan_approved>0 OR (credits>0 AND (credits<>1 OR valid_credits<>1))
            OR (credits=0 AND (status IN ('PAID','PAID_STOCK_REVIEW','REFUNDED') OR reversal IS NOT NULL OR raw_status IN ('APPROVED','REFUNDED','CHARGED_BACK')))) contradictory
          FROM authority
        ), payments_classified AS (
          SELECT *, CASE WHEN contradictory THEN 'UNKNOWN'
            WHEN credits=1 AND valid_credits=1 THEN CASE WHEN reversal='CHARGEBACK' THEN 'CHARGED_BACK' WHEN reversal IS NOT NULL THEN 'REFUNDED' ELSE credited_status END
            WHEN payment_count=1 AND raw_status IN ('PENDING','REJECTED','CANCELLED') THEN raw_status
            ELSE 'UNKNOWN' END projected_payment FROM checked
        ), classified AS (
          SELECT *,CASE WHEN status IN ('PAID','PAID_STOCK_REVIEW') AND projected_payment<>'APPROVED' THEN 'UNKNOWN' ELSE status END projected_order
          FROM payments_classified
        ) """
    }
}
