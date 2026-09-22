package com.storecore.commerce.infrastructure.mporders

import org.springframework.boot.context.properties.ConfigurationProperties
import java.net.URI

@ConfigurationProperties(prefix = "storecore.integrations.mp-orders")
data class MpOrdersProperties(
    val adapter: String = "unconfigured",
    val acceptedTopic: String = "",
    val expectedUserId: String = "",
    val expectedApplicationId: String = "",
    val checkoutUrlHosts: List<String> = emptyList(),
    val apiBaseUrl: String = "",
    val accessTokenRef: String = "",
    val webhookSecretRef: String = "",
) {
    fun adapterEnabled(): Boolean = adapter == "official" || adapter == "fake"

    fun identityReady(): Boolean =
        acceptedTopic.isNotBlank() && expectedUserId.isNotBlank() && expectedApplicationId.isNotBlank()

    fun signatureReady(): Boolean = adapterEnabled() && identityReady() &&
        (adapter == "fake" || resolveRef(webhookSecretRef) != null)

    fun remoteReady(): Boolean = adapter == "official" &&
        identityReady() &&
        apiBaseUrl.isNotBlank() &&
        checkoutUrlHosts.isNotEmpty() &&
        resolveRef(accessTokenRef) != null

    fun allowlistedCheckoutUrl(url: String): Boolean {
        val uri = runCatching { URI(url) }.getOrNull() ?: return false
        val host = uri.host?.lowercase() ?: return false
        return uri.scheme.equals("https", ignoreCase = true) &&
            checkoutUrlHosts.map { it.lowercase() }.contains(host)
    }

    fun resolveWebhookSecret(): String? = resolveRef(webhookSecretRef)

    fun resolveAccessToken(): String? = resolveRef(accessTokenRef)

    private fun resolveRef(ref: String): String? {
        if (!ref.matches(REF_NAME)) return null
        return System.getenv(ref)?.takeIf { it.isNotBlank() }
    }

    private companion object {
        val REF_NAME = Regex("^[A-Z][A-Z0-9_]{0,127}$")
    }
}
