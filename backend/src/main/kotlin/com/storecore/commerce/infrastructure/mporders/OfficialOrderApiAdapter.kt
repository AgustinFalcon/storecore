package com.storecore.commerce.infrastructure.mporders

import com.fasterxml.jackson.databind.JsonNode
import com.storecore.commerce.application.port.output.OfficialOrderCommandPort
import com.storecore.commerce.application.port.output.OfficialOrderCreateRequest
import com.storecore.commerce.application.port.output.OfficialOrderQueryPort
import com.storecore.commerce.application.port.output.OfficialOrderSearchQuery
import com.storecore.commerce.application.port.output.OfficialOrderSearchResult
import com.storecore.commerce.domain.CreationObservation
import com.storecore.commerce.domain.OfficialOrderResource
import com.storecore.commerce.domain.OfficialOrderTransaction
import com.storecore.commerce.domain.RemoteOrderCandidate
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import org.springframework.web.client.RestClientResponseException
import java.math.BigDecimal
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@Component
@ConditionalOnProperty(name = ["storecore.integrations.mp-orders.adapter"], havingValue = "official")
class OfficialOrderApiAdapter(
    private val properties: MpOrdersProperties,
) : OfficialOrderQueryPort, OfficialOrderCommandPort {
    override fun configured(): Boolean = properties.remoteReady()

    override fun getByProviderOrderId(providerOrderId: String): OfficialOrderResource? {
        if (!configured() || providerOrderId.isBlank()) return null
        return runCatching {
            val node = client().get()
                .uri("/v1/orders/{id}", providerOrderId)
                .retrieve().body(JsonNode::class.java) ?: return null
            toResource(node)
        }.getOrNull()
    }

    override fun create(request: OfficialOrderCreateRequest): CreationObservation {
        if (!configured()) return CreationObservation.Timeout
        return try {
            val node = client().post()
                .uri("/v1/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .header("X-Idempotency-Key", request.idempotencyKey.toString())
                .body(
                    mapOf(
                        "type" to "online",
                        "processing_mode" to "manual",
                        "external_reference" to request.externalReference,
                        "total_amount" to request.amount.toPlainString(),
                    ),
                )
                .retrieve().body(JsonNode::class.java)
            val id = node?.path("id")?.asText().orEmpty()
            val url = node?.path("type_config")?.path("online")?.path("checkout_url")?.asText()
                ?: node?.path("checkout_url")?.asText().orEmpty()
            if (id.isBlank() || url.isBlank() || !properties.allowlistedCheckoutUrl(url)) {
                CreationObservation.Timeout
            } else {
                CreationObservation.VerifiedSuccess(id, url)
            }
        } catch (error: RestClientResponseException) {
            CreationObservation.HttpFailure(error.statusCode.value(), errorCode(error))
        } catch (_: Exception) {
            CreationObservation.Timeout
        }
    }

    override fun search(query: OfficialOrderSearchQuery): OfficialOrderSearchResult {
        if (!configured()) return OfficialOrderSearchResult(emptyList(), 0, false)
        val formatter = DateTimeFormatter.ISO_INSTANT
        val candidates = mutableListOf<RemoteOrderCandidate>()
        var page = 1
        var exhausted = false
        try {
            while (page <= 10) {
                val node = client().get()
                    .uri(
                        "/v1/orders/search?external_reference={ref}&begin_date={begin}&end_date={end}&limit=20&page={page}",
                        query.externalReference,
                        formatter.format(query.beginDate.atOffset(ZoneOffset.UTC)),
                        formatter.format(query.endDate.atOffset(ZoneOffset.UTC)),
                        page,
                    )
                    .retrieve().body(JsonNode::class.java) ?: break
                node.path("results").forEach { item -> toCandidate(item)?.let(candidates::add) }
                val totalPages = node.path("paging").path("total_pages").asInt(1)
                exhausted = page >= totalPages
                if (exhausted) break
                page += 1
            }
        } catch (_: Exception) {
            return OfficialOrderSearchResult(candidates, page, false)
        }
        return OfficialOrderSearchResult(candidates, page, exhausted)
    }

    private fun client(): RestClient {
        val token = properties.resolveAccessToken() ?: error("UNCONFIGURED")
        return RestClient.builder()
            .baseUrl(properties.apiBaseUrl.trimEnd('/'))
            .defaultHeader("Authorization", "Bearer $token")
            .build()
    }

    private fun toResource(node: JsonNode): OfficialOrderResource {
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
            currency = node.path("currency").asText("ARS"),
            status = node.path("status").asText(),
            statusDetail = node.path("status_detail").asText(""),
            transactions = transactions,
        )
    }

    private fun toCandidate(node: JsonNode): RemoteOrderCandidate? {
        val id = node.path("id").asText()
        if (id.isBlank()) return null
        return RemoteOrderCandidate(
            providerOrderId = id,
            externalReference = node.path("external_reference").asText(),
            merchantId = node.path("user_id").asText(),
            applicationId = node.path("integration_data").path("application_id").asText(),
            amount = node.path("total_amount").decimalValue() ?: BigDecimal.ZERO,
            currency = node.path("currency").asText("ARS"),
        )
    }

    private fun errorCode(error: RestClientResponseException): String? =
        runCatching { error.getResponseBodyAs(JsonNode::class.java)?.path("error")?.asText() }
            .getOrNull()
            ?.takeIf { it.isNotBlank() }
}
