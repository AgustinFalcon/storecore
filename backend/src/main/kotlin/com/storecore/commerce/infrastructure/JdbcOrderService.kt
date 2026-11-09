package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.FulfillmentUseCase
import com.storecore.commerce.domain.*
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.application.ResourceNotFound
import com.storecore.identity.domain.CustomerPrincipal
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcOrderService(private val jdbc: JdbcTemplate, private val capabilities: CapabilityDecisionPort, private val evidence: JdbcFulfillmentEvidence, private val records: JdbcFulfillmentRecords, private val transactions: TransactionTemplate, private val projection: JdbcOrderProjection) {
    private val fulfillment = FulfillmentUseCase(evidence, records)
    fun customerOrder(customer: CustomerPrincipal, id: Long) = one(id, customer.customerId)
    fun adminOrder(id: Long) = one(id, null)

    fun customerPage(customer: CustomerPrincipal, page: Int, size: Int, order: String?, payment: String?, shipment: String?) = paged(customer.customerId, page, size, order, payment, shipment)
    fun adminPage(page: Int, size: Int, order: String?, payment: String?, shipment: String?) = paged(null, page, size, order, payment, shipment)
    private fun paged(customerId: Long?, page: Int, size: Int, order: String?, payment: String?, shipment: String?): OrderPage<OrderView> {
        val ids = projection.page(customerId, page, size, order, payment, shipment)
        return OrderPage(ids.ids.map { one(it, customerId) }, ids.page, ids.size, ids.total)
    }

    fun ship(actor: InternalUserPrincipal, orderId: Long, status: ShipmentCommand, tracking: String?): OrderView = transactions.execute {
        capabilities.decide("MANUAL_FULFILLMENT", "MANAGE", CapabilityActor.Internal(actor))
        lockOrder(orderId)
        fulfillment.shipment(orderId, status, tracking, actor.userId)
        adminOrder(orderId)
    }!!

    fun rma(actor: InternalUserPrincipal, orderId: Long, status: RmaCommand): OrderView = transactions.execute {
        capabilities.decide("MANUAL_FULFILLMENT", "MANAGE", CapabilityActor.Internal(actor))
        lockOrder(orderId)
        fulfillment.receive(orderId, status)
        adminOrder(orderId)
    }!!

    private fun lockOrder(orderId: Long) {
        if (jdbc.query("SELECT id FROM orders WHERE id=? FOR UPDATE", { rs, _ -> rs.getLong("id") }, orderId).isEmpty()) throw ResourceNotFound()
    }
    private fun one(id: Long, customerId: Long?): OrderView {
        if (customerId != null && jdbc.query("SELECT id FROM orders WHERE id=? AND customer_id=?", { rs, _ -> rs.getLong("id") }, id, customerId).isEmpty()) throw ResourceNotFound()
        val snapshot = evidence.load(id)
        val eligibility = FulfillmentPolicy.evaluate(snapshot)
        val shipment = records.shipment(id)
        val shipmentStatus = shipment?.status ?: ShipmentStatus.NOT_CREATED
        val rma = records.rmaStatus(id)
        val eligible = eligibility == FulfillmentEligibility.ELIGIBLE && rma != RmaStatus.UNKNOWN
        val lines = jdbc.query("SELECT v.sku,COALESCE(oi.product_snapshot->>'name',v.label) name,oi.quantity,oi.original_unit_price,oi.discount_amount,oi.offer_id,oi.campaign_reference,oi.effective_unit_price FROM order_items oi JOIN product_variants v ON v.id=oi.variant_id WHERE oi.order_id=? ORDER BY oi.id", { rs, _ -> CartLineView(rs.getString("sku"), rs.getString("name"), rs.getInt("quantity"), rs.getBigDecimal("original_unit_price"), rs.getBigDecimal("discount_amount"), rs.getObject("offer_id")?.toString(), rs.getString("campaign_reference"), rs.getBigDecimal("effective_unit_price")) }, id)
        return projection.enrich(OrderView(id.toString(), snapshot.orderStatus, PaymentStatus.UNKNOWN, shipmentStatus, shipment?.tracking, snapshot.total, lines, rma, eligibility, if (eligible) ShipmentJourney.next(shipmentStatus)?.command else null, if (eligible && ReceiveReturn.accepts(shipmentStatus, rma, RmaCommand.RECEIVED)) RmaCommand.RECEIVED else null))
    }
}
