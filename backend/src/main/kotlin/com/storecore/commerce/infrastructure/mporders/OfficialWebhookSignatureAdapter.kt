package com.storecore.commerce.infrastructure.mporders

import com.mercadopago.exceptions.MPInvalidWebhookSignatureException
import com.mercadopago.webhook.WebhookSignatureValidator
import com.storecore.commerce.application.port.output.OfficialWebhookSignaturePort
import com.storecore.commerce.application.port.output.WebhookSignatureDecision
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["storecore.integrations.mp-orders.adapter"], havingValue = "official")
class OfficialWebhookSignatureAdapter(
    private val properties: MpOrdersProperties,
) : OfficialWebhookSignaturePort {
    override fun configured(): Boolean = properties.signatureReady()

    override fun validate(xSignature: String?, xRequestId: String?, queryDataId: String?): WebhookSignatureDecision {
        if (!configured()) return WebhookSignatureDecision.Rejected("UNCONFIGURED")
        val secret = properties.resolveWebhookSecret() ?: return WebhookSignatureDecision.Rejected("SECRET_UNRESOLVED")
        return try {
            WebhookSignatureValidator.validate(xSignature, xRequestId, queryDataId, secret)
            WebhookSignatureDecision.Accepted
        } catch (_: MPInvalidWebhookSignatureException) {
            WebhookSignatureDecision.Rejected("INVALID")
        }
    }
}
