package com.storecore.commerce.application.port.output

/** Narrow wrap of the official Mercado Pago WebhookSignatureValidator contract. */
interface OfficialWebhookSignaturePort {
    fun configured(): Boolean
    fun validate(xSignature: String?, xRequestId: String?, queryDataId: String?): WebhookSignatureDecision
}

sealed interface WebhookSignatureDecision {
    data object Accepted : WebhookSignatureDecision
    data class Rejected(val reason: String) : WebhookSignatureDecision
}
