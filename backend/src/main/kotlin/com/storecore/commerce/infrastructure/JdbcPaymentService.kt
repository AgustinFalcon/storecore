package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcPaymentService(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper, private val capabilities: CapabilityDecisionPort) {
    fun notify(topic: String?, id: String?, body: Map<String, Any?>?): Map<String, Any?> {
        capabilities.decide("PAYMENTS_MP", "PROCESS_WEBHOOK", CapabilityActor.System)
        val data = (body?.get("data") as? Map<*, *>)
        val eventId = id ?: data?.get("id")?.toString() ?: throw com.storecore.commerce.application.CommerceValidation("PAYMENT_EVENT_ID_REQUIRED")
        val resource = topic ?: body?.get("type")?.toString() ?: body?.get("action")?.toString() ?: "payment"
        val envelope = mapper.writeValueAsString(body ?: mapOf("topic" to topic, "id" to eventId))
        val inserted = jdbc.query("INSERT INTO payment_event_inbox(provider,provider_event_id,resource_reference,envelope_redacted) VALUES ('MERCADO_PAGO',?,?,?::jsonb) ON CONFLICT (provider,provider_event_id) DO NOTHING RETURNING id", { rs, _ -> rs.getLong("id") }, eventId, resource, envelope).firstOrNull()
        val inboxId = inserted ?: jdbc.queryForObject("SELECT id FROM payment_event_inbox WHERE provider='MERCADO_PAGO' AND provider_event_id=?", Long::class.java, eventId)!!
        jdbc.update("INSERT INTO payment_event_processing(inbox_id,status) VALUES (?,'RECEIVED') ON CONFLICT (inbox_id) DO NOTHING", inboxId)
        return mapOf("accepted" to true, "providerEventId" to eventId, "replay" to (inserted == null), "applied" to false)
    }
}
