package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.FulfillmentEvidencePort
import com.storecore.commerce.domain.*
import com.storecore.identity.application.ResourceNotFound
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty

/** Writes call this only after locking orders; every payment writer uses the same aggregate lock. */
@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcFulfillmentEvidence(private val jdbc: JdbcTemplate) : FulfillmentEvidencePort {
    override fun load(orderId: Long): FulfillmentSnapshot {
        val header = jdbc.query("SELECT status,total,currency FROM orders WHERE id=?", { rs, _ -> Triple(OrderStatus.fromWire(rs.getString("status")), rs.getBigDecimal("total"), rs.getString("currency")) }, orderId).singleOrNull() ?: throw ResourceNotFound()
        val payments = jdbc.query(
            """SELECT p.status,p.amount payment_amount,p.currency payment_currency,
                      a.amount attempt_amount,a.currency attempt_currency,a.state,
                      c.confirmed_amount,c.confirmed_currency,
                      (a.order_id=c.order_id AND p.order_id=c.order_id) same_order,
                      (a.provider_order_id=c.provider_order_id) same_provider
               FROM mp_order_commercial_applications c
               LEFT JOIN mp_checkout_attempts a ON a.id=c.attempt_id
               LEFT JOIN payments p ON p.id=a.payment_id
               WHERE c.order_id=? AND c.transition='PAYMENT_ACCREDITED' ORDER BY c.id""",
            { rs, _ -> PaymentAccreditation(PaymentStatus.fromWire(rs.getString("status")), rs.getBoolean("same_order"), rs.getBoolean("same_provider"), CheckoutAttemptState.fromWire(rs.getString("state")) == CheckoutAttemptState.ACCREDITED, rs.getBigDecimal("payment_amount") ?: java.math.BigDecimal.valueOf(-1), rs.getBigDecimal("attempt_amount") ?: java.math.BigDecimal.valueOf(-1), rs.getBigDecimal("confirmed_amount"), rs.getString("payment_currency") ?: "", rs.getString("attempt_currency") ?: "", rs.getString("confirmed_currency")) }, orderId,
        )
        val blocked = jdbc.queryForObject(
            """SELECT EXISTS(SELECT 1 FROM mp_order_reversal_cases r JOIN mp_checkout_attempts a ON a.id=r.attempt_id WHERE a.order_id=?)
                 OR EXISTS(SELECT 1 FROM mp_order_incidents WHERE order_id=? AND review_status <> 'RESOLVED')""", Boolean::class.java, orderId, orderId,
        ) ?: true
        val items = jdbc.query("SELECT variant_id,quantity FROM order_items WHERE order_id=? ORDER BY id", { rs, _ -> SoldItem(rs.getLong("variant_id"), rs.getInt("quantity")) }, orderId)
        val sales = jdbc.query(
            """SELECT l.reservation_id,l.variant_id,-l.quantity_delta quantity,r.variant_id consumed_variant,r.quantity consumed_quantity,r.status,
                      (SELECT count(*) FROM inventory_ledger other WHERE other.reservation_id=l.reservation_id AND other.event_type='SALE') sale_count
               FROM inventory_ledger l LEFT JOIN inventory_reservations r ON r.id=l.reservation_id
               WHERE l.actor=? AND l.event_type='SALE' AND l.channel='WEB' ORDER BY l.id""",
            { rs, _ -> StockConsumption(rs.getObject("reservation_id")?.let { rs.getLong("reservation_id") }, rs.getLong("variant_id"), rs.getInt("quantity"), rs.getObject("consumed_variant")?.let { rs.getLong("consumed_variant") }, rs.getObject("consumed_quantity")?.let { rs.getInt("consumed_quantity") }, ReservationStatus.fromWire(rs.getString("status")) == ReservationStatus.CONSUMED, rs.getInt("sale_count")) }, "MP_ORDERS:$orderId",
        )
        return FulfillmentSnapshot(header.first, header.second, header.third, payments, blocked, items, sales)
    }

    fun paymentStatus(orderId: Long, snapshot: FulfillmentSnapshot): PaymentStatus {
        if (snapshot.accreditations.isNotEmpty()) return snapshot.accreditations.singleOrNull()?.paymentStatus ?: PaymentStatus.UNKNOWN
        return jdbc.query("SELECT status FROM payments WHERE order_id=? ORDER BY id", { rs, _ -> PaymentStatus.fromWire(rs.getString("status")) }, orderId).singleOrNull() ?: PaymentStatus.UNKNOWN
    }
}
