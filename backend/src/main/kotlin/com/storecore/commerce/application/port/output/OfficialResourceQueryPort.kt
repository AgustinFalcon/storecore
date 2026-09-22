package com.storecore.commerce.application.port.output

import com.storecore.commerce.domain.OfficialMlResource
import com.storecore.commerce.domain.OfficialPaymentResource

/** Official MP/ML resource refetch. Production stays unconfigured unless the installation supplies credentials. */
interface OfficialResourceQueryPort {
    fun configured(): Boolean
    fun payment(providerEventId: String): OfficialPaymentResource?
    fun mercadoLibre(topic: String, resource: String): OfficialMlResource?
}
