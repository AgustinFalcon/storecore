package com.storecore.commerce

import com.mercadopago.webhook.WebhookSignatureValidator
import com.storecore.commerce.application.port.output.WebhookSignatureDecision
import com.storecore.commerce.infrastructure.mporders.InstallationSecretLookup
import com.storecore.commerce.infrastructure.mporders.MpOrdersProperties
import com.storecore.commerce.infrastructure.mporders.OfficialWebhookSignatureAdapter
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

class OfficialWebhookSignatureAdapterTest {
    @Test
    fun `official wrapper accepts a fixture the SDK validator accepts`() {
        val secret = "test-installation-secret"
        val requestId = "req-official-1"
        val dataId = "ORD01TESTDATAID"
        val signature = officialSignatureFixture(secret, requestId, dataId)
        WebhookSignatureValidator.validate(signature, requestId, dataId, secret)
        val decision = adapter("official", secret).validate(signature, requestId, dataId)
        assertEquals(WebhookSignatureDecision.Accepted, decision)
        assertTrue(adapter("official", secret).configured())
    }

    @Test
    fun `official wrapper rejects a tampered signature`() {
        val secret = "test-installation-secret"
        val requestId = "req-official-2"
        val dataId = "ORD01TESTDATAID"
        val signature = officialSignatureFixture(secret, requestId, dataId)
        val decision = adapter("official", secret).validate(signature, requestId, "OTHER-ID")
        assertEquals(WebhookSignatureDecision.Rejected("INVALID"), decision)
    }

    @Test
    fun `official wrapper stays fail closed without secret or official adapter`() {
        val missingSecret = OfficialWebhookSignatureAdapter(
            properties("official"),
            InstallationSecretLookup { null },
        )
        assertFalse(missingSecret.configured())
        assertEquals(WebhookSignatureDecision.Rejected("UNCONFIGURED"), missingSecret.validate("ts=1,v1=00", "req", "id"))

        val unconfigured = adapter("unconfigured", "present")
        assertFalse(unconfigured.configured())
        assertEquals(WebhookSignatureDecision.Rejected("UNCONFIGURED"), unconfigured.validate("ts=1,v1=00", "req", "id"))
    }

    private fun adapter(adapter: String, secret: String) = OfficialWebhookSignatureAdapter(
        properties(adapter),
        InstallationSecretLookup { if (it == "MP_WEBHOOK_SECRET") secret else null },
    )

    private fun properties(adapter: String) = MpOrdersProperties(
        adapter = adapter,
        acceptedTopic = "order",
        expectedUserId = "user-1",
        expectedApplicationId = "app-1",
        webhookSecretRef = "MP_WEBHOOK_SECRET",
    )

    /** Test-only fixture for the official SDK manifest. Not a StoreCore production HMAC. */
    private fun officialSignatureFixture(secret: String, requestId: String, dataId: String): String {
        val timestamp = Instant.now().epochSecond.toString()
        val manifest = "id:$dataId;request-id:$requestId;ts:$timestamp;"
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret.toByteArray(Charsets.UTF_8), "HmacSHA256"))
        val hex = mac.doFinal(manifest.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        return "ts=$timestamp,v1=$hex"
    }
}
