package com.storecore.commerce

import com.storecore.commerce.domain.MpOrderWebhookPolicy
import com.storecore.commerce.domain.WebhookDisposition
import com.storecore.commerce.domain.WebhookIdentityInput
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class MpOrderWebhookPolicyTest {
    @Test
    fun `processable only when topic and signed query id match a known order`() {
        assertEquals(WebhookDisposition.PROCESSABLE, MpOrderWebhookPolicy.classify(valid()))
    }

    @Test
    fun `orders_v2 is not an alias of order`() {
        assertEquals(WebhookDisposition.QUARANTINED, MpOrderWebhookPolicy.classify(valid().copy(queryType = "orders_v2")))
    }

    @Test
    fun `discordant body data id is quarantined`() {
        assertEquals(WebhookDisposition.QUARANTINED, MpOrderWebhookPolicy.classify(valid().copy(bodyDataId = "OTHER")))
    }

    @Test
    fun `unknown provider order stays quarantined`() {
        assertEquals(WebhookDisposition.QUARANTINED, MpOrderWebhookPolicy.classify(valid().copy(knownProviderOrderId = false)))
    }

    @Test
    fun `blank accepted topic is fail closed`() {
        assertEquals(WebhookDisposition.QUARANTINED, MpOrderWebhookPolicy.classify(valid().copy(acceptedTopic = "")))
    }

    private fun valid() = WebhookIdentityInput(
        queryDataId = "ORD1",
        queryType = "order",
        bodyEventId = "123",
        bodyDataId = "ORD1",
        bodyType = "order",
        userId = "user-1",
        applicationId = "app-1",
        xRequestId = "req-1",
        expectedUserId = "user-1",
        expectedApplicationId = "app-1",
        acceptedTopic = "order",
        knownProviderOrderId = true,
    )
}
