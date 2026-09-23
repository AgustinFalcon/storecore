package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcPaymentService(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper, private val capabilities: CapabilityDecisionPort, private val limiter: WebhookInboxLimiter) {
    fun notify(sourceIp: String, topic: String?, id: String?, body: Map<String, Any?>?): Map<String, Any?> {
        throw com.storecore.commerce.application.LegacyMpNotificationRetired()
    }
}
