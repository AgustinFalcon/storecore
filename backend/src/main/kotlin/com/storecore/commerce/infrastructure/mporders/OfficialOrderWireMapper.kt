package com.storecore.commerce.infrastructure.mporders

import com.fasterxml.jackson.databind.JsonNode
import com.storecore.commerce.domain.OfficialOrderResource
import com.storecore.commerce.domain.OfficialOrderTransaction
import com.storecore.commerce.domain.PaymentCurrency
import com.storecore.commerce.domain.RemoteOrderCandidate
import java.math.BigDecimal

internal object OfficialOrderWireMapper {
    fun toResource(node: JsonNode): OfficialOrderResource {
        val transactions = node.path("transactions").path("payments").mapNotNull { payment ->
            val id = payment.path("id").asText()
            if (id.isBlank()) null
            else OfficialOrderTransaction(
                providerPaymentId = id,
                status = payment.path("status").asText(),
                statusDetail = payment.path("status_detail").asText(null),
                amount = payment.path("amount").decimalValue() ?: BigDecimal.ZERO,
                paymentType = payment.path("payment_method").path("type").asText(null),
            )
        }
        return OfficialOrderResource(
            providerOrderId = node.path("id").asText(),
            externalReference = node.path("external_reference").asText(),
            merchantId = node.path("user_id").asText(),
            applicationId = node.path("integration_data").path("application_id").asText(),
            totalAmount = node.path("total_amount").decimalValue() ?: BigDecimal.ZERO,
            paidAmount = node.path("paid_amount").decimalValue()
                ?: node.path("total_paid_amount").decimalValue()
                ?: BigDecimal.ZERO,
            currency = currency(node),
            status = node.path("status").asText(),
            statusDetail = node.path("status_detail").asText(""),
            transactions = transactions,
        )
    }

    fun toCandidate(node: JsonNode): RemoteOrderCandidate? {
        val id = node.path("id").asText()
        if (id.isBlank()) return null
        return RemoteOrderCandidate(
            providerOrderId = id,
            externalReference = node.path("external_reference").asText(),
            merchantId = node.path("user_id").asText(),
            applicationId = node.path("integration_data").path("application_id").asText(),
            amount = node.path("total_amount").decimalValue() ?: BigDecimal.ZERO,
            currency = currency(node),
        )
    }

    private fun currency(node: JsonNode): PaymentCurrency = PaymentCurrency.fromWire(
        node.get("currency")?.takeIf(JsonNode::isTextual)?.textValue(),
    )
}
