package com.storecore.commerce.domain

import java.math.BigDecimal

/** Maps official order status/status_detail pairs. It never mutates stock or fiscal state. */
object MpOrderCommercialPolicy {
    fun classify(input: OfficialOrderStatusInput): CommercialEffect {
        val status = input.status.lowercase()
        val detail = input.statusDetail.lowercase()
        val paidMatches = input.paidAmount.compareTo(input.expectedAmount) == 0 && input.expectedAmount > BigDecimal.ZERO
        return when {
            status == "processed" && detail == "accredited" && paidMatches -> CommercialEffect.ACCREDIT
            status == "processed" && detail == "accredited" -> CommercialEffect.UNKNOWN
            status in setOf("created", "processing") || detail == "action_required" -> CommercialEffect.PENDING
            status == "failed" -> CommercialEffect.REJECT
            status == "canceled" || status == "cancelled" -> CommercialEffect.CANCEL
            (status == "processed" && detail == "refunded") || (status == "refunded" && detail == "refunded") ->
                CommercialEffect.REFUND_TOTAL
            status == "processed" && detail == "partially_refunded" -> CommercialEffect.REFUND_PARTIAL
            detail.contains("chargeback") || detail.contains("charged_back") || status.contains("chargeback") ->
                CommercialEffect.CHARGEBACK
            detail.contains("fraud") -> CommercialEffect.FRAUD
            else -> CommercialEffect.UNKNOWN
        }
    }
}

data class OfficialOrderStatusInput(
    val status: String,
    val statusDetail: String,
    val paidAmount: BigDecimal,
    val expectedAmount: BigDecimal,
)

enum class CommercialEffect {
    ACCREDIT,
    PENDING,
    REJECT,
    CANCEL,
    REFUND_TOTAL,
    REFUND_PARTIAL,
    CHARGEBACK,
    FRAUD,
    UNKNOWN,
}

data class OfficialOrderResource(
    val providerOrderId: String,
    val externalReference: String,
    val merchantId: String,
    val applicationId: String,
    val totalAmount: BigDecimal,
    val paidAmount: BigDecimal,
    val currency: String,
    val status: String,
    val statusDetail: String,
    val transactions: List<OfficialOrderTransaction> = emptyList(),
)

data class OfficialOrderTransaction(
    val providerPaymentId: String,
    val status: String,
    val statusDetail: String?,
    val amount: BigDecimal,
    val paymentType: String?,
)
