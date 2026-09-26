package com.storecore.commerce.domain

import java.math.BigDecimal

data class CartView(val lines: List<CartLineView>, val currency: String)
data class CartLineView(val sku: String, val name: String, val quantity: Int, val originalUnitPrice: BigDecimal, val discountAmount: BigDecimal, val offerRef: String?, val campaignRef: String?, val effectiveUnitPrice: BigDecimal)
data class CheckoutReceipt(val orderId: String, val paymentStatus: String, val orderStatus: String, val checkoutUrl: String? = null)
data class OrderView(val id: String, val orderStatus: String, val paymentStatus: String, val shipmentStatus: String, val tracking: String?, val total: BigDecimal, val lines: List<CartLineView>, val rmaStatus: String? = null)
data class InventoryRow(val sku: String, val availableQuantity: Int, val reservedQuantity: Int, val safetyStock: Int)
data class PromoView(val id: String, val listingSku: String, val currency: String, val validFrom: String, val validTo: String, val priority: Int, val margin: BigDecimal, val approvedBy: String, val approvedAt: String, val writer: String = "MANUAL")
data class OfferView(val id: String, val name: String, val status: String, val priority: Int, val startsAt: String, val endsAt: String, val discountType: String, val discountValue: BigDecimal, val minMarginPercent: BigDecimal, val skus: List<String>, val approvedBy: String?, val approvedAt: String?)
data class MercadoLibreAccountView(val authorized: Boolean, val accountRef: String, val status: String)
data class MercadoLibreListingView(val listingId: String, val variationId: String, val sku: String)
data class ProfilePreview(val compatible: Boolean, val version: String, val diff: String)
