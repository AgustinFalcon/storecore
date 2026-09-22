package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.port.output.OfficialResourceQueryPort
import com.storecore.commerce.domain.OfficialMlResource
import com.storecore.commerce.domain.OfficialPaymentResource
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component

/** Default: no live vendor call. CI and unconfigured installations leave inbox in RECEIVED. */
@Component
@ConditionalOnProperty(name = ["storecore.integrations.official-resource-adapter"], havingValue = "unconfigured", matchIfMissing = true)
class UnconfiguredOfficialResourceAdapter : OfficialResourceQueryPort {
    override fun configured(): Boolean = false
    override fun payment(providerEventId: String): OfficialPaymentResource? = null
    override fun mercadoLibre(topic: String, resource: String): OfficialMlResource? = null
}
