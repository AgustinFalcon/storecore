package com.storecore.commerce.domain

import java.math.BigDecimal

data class CartView(val lines: List<CartLineView>, val currency: String)
data class CartLineView(val sku: String, val name: String, val quantity: Int, val originalUnitPrice: BigDecimal, val discountAmount: BigDecimal, val offerRef: String?, val campaignRef: String?, val effectiveUnitPrice: BigDecimal)
data class CheckoutReceipt(val orderId: String, val paymentStatus: PaymentStatus, val orderStatus: OrderStatus, val checkoutUrl: String? = null)
data class OrderView(val id: String, val orderStatus: OrderStatus, val paymentStatus: PaymentStatus, val shipmentStatus: ShipmentStatus, val tracking: String?, val total: BigDecimal, val lines: List<CartLineView>, val rmaStatus: RmaStatus = RmaStatus.NONE, val fulfillmentEligibility: FulfillmentEligibility = FulfillmentEligibility.PAYMENT_NOT_VERIFIED, val shipmentAction: ShipmentCommand? = null, val rmaAction: RmaCommand? = null,
    val orderNumber: String? = null, val createdAt: java.time.Instant? = null, val updatedAt: java.time.Instant? = null,
    val currency: String? = null, val subtotal: BigDecimal? = null, val shippingCost: BigDecimal? = null,
    val buyerName: OrderFact<String> = OrderFact.unavailable(OrderUnavailableReason.SOURCE_MISSING),
    val buyerEmail: OrderFact<String> = OrderFact.unavailable(OrderUnavailableReason.SOURCE_MISSING),
    val delivery: OrderFact<DeliverySnapshot> = OrderFact.unavailable(OrderUnavailableReason.SOURCE_MISSING),
    val payment: OrderFact<PaymentStatus> = OrderFact.unavailable(OrderUnavailableReason.SOURCE_MISSING),
    val timeline: OrderFact<List<OrderTimelineEvent>> = OrderFact.unavailable(OrderUnavailableReason.SOURCE_MISSING),
    val returnEligibility: ReturnEligibility = ReturnEligibility.PAYMENT_UNVERIFIED)
data class InventoryRow(val sku: String, val availableQuantity: Int, val reservedQuantity: Int, val safetyStock: Int)
data class ProfilePreview(val compatible: Boolean, val version: String, val diff: String)
