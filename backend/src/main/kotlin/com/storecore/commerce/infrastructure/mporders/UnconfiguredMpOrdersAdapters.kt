package com.storecore.commerce.infrastructure.mporders

import com.storecore.commerce.application.port.output.OfficialOrderCommandPort
import com.storecore.commerce.application.port.output.OfficialOrderCreateRequest
import com.storecore.commerce.application.port.output.OfficialOrderQueryPort
import com.storecore.commerce.application.port.output.OfficialOrderSearchQuery
import com.storecore.commerce.application.port.output.OfficialOrderSearchResult
import com.storecore.commerce.application.port.output.OfficialWebhookSignaturePort
import com.storecore.commerce.application.port.output.WebhookSignatureDecision
import com.storecore.commerce.domain.CreationObservation
import com.storecore.commerce.domain.OfficialOrderResource
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(
    name = ["storecore.integrations.mp-orders.adapter"],
    havingValue = "unconfigured",
    matchIfMissing = true,
)
class UnconfiguredOfficialWebhookSignatureAdapter : OfficialWebhookSignaturePort {
    override fun configured() = false
    override fun validate(xSignature: String?, xRequestId: String?, queryDataId: String?) =
        WebhookSignatureDecision.Rejected("UNCONFIGURED")
}

@Component
@ConditionalOnProperty(
    name = ["storecore.integrations.mp-orders.adapter"],
    havingValue = "unconfigured",
    matchIfMissing = true,
)
class UnconfiguredOfficialOrderAdapter : OfficialOrderQueryPort, OfficialOrderCommandPort {
    override fun configured() = false
    override fun getByProviderOrderId(providerOrderId: String): OfficialOrderResource? = null
    override fun create(request: OfficialOrderCreateRequest) = CreationObservation.Timeout
    override fun search(query: OfficialOrderSearchQuery) =
        OfficialOrderSearchResult(emptyList(), pagesFetched = 0, pagesExhausted = false)
}
