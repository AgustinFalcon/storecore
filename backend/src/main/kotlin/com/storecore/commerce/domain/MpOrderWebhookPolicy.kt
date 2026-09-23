package com.storecore.commerce.domain

/** Pure webhook identity rules. Signature verification is out of scope and happens before this policy. */
object MpOrderWebhookPolicy {
    fun classify(input: WebhookIdentityInput): WebhookDisposition {
        if (input.queryDataId.isBlank() || input.xRequestId.isBlank()) return WebhookDisposition.QUARANTINED
        if (input.acceptedTopic.isBlank()) return WebhookDisposition.QUARANTINED
        if (input.queryType != input.acceptedTopic) return WebhookDisposition.QUARANTINED
        if (!input.bodyType.isNullOrBlank() && input.bodyType != input.queryType) return WebhookDisposition.QUARANTINED
        if (!input.bodyDataId.isNullOrBlank() && input.bodyDataId != input.queryDataId) return WebhookDisposition.QUARANTINED
        if (input.expectedUserId.isBlank() || input.expectedApplicationId.isBlank()) return WebhookDisposition.QUARANTINED
        if (input.userId != input.expectedUserId || input.applicationId != input.expectedApplicationId) {
            return WebhookDisposition.QUARANTINED
        }
        if (!input.knownProviderOrderId) return WebhookDisposition.QUARANTINED
        return WebhookDisposition.PROCESSABLE
    }
}

data class WebhookIdentityInput(
    val queryDataId: String,
    val queryType: String?,
    val bodyEventId: String?,
    val bodyDataId: String?,
    val bodyType: String?,
    val userId: String?,
    val applicationId: String?,
    val xRequestId: String,
    val expectedUserId: String,
    val expectedApplicationId: String,
    val acceptedTopic: String,
    val knownProviderOrderId: Boolean,
)

enum class WebhookDisposition { PROCESSABLE, QUARANTINED }
