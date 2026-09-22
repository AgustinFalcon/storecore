package com.storecore.commerce.infrastructure.mporders

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.InvalidWebhookSignature
import com.storecore.commerce.application.WebhookPayloadTooLarge
import com.storecore.commerce.application.port.output.OfficialWebhookSignaturePort
import com.storecore.commerce.application.port.output.WebhookSignatureDecision
import com.storecore.commerce.domain.MpOrderWebhookPolicy
import com.storecore.commerce.domain.WebhookDisposition
import com.storecore.commerce.domain.WebhookIdentityInput
import com.storecore.commerce.infrastructure.WebhookInboxLimiter
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate

@Service
@ConditionalOnMpOrdersAdapter
class MpOrderInboxService(
    private val jdbc: JdbcTemplate,
    private val transactions: TransactionTemplate,
    private val signatures: OfficialWebhookSignaturePort,
    private val properties: MpOrdersProperties,
    private val limiter: WebhookInboxLimiter,
    private val capabilities: CapabilityDecisionPort,
    private val mapper: ObjectMapper,
) {
    fun receive(
        sourceIp: String,
        xSignature: String?,
        xRequestId: String?,
        queryDataId: String?,
        queryType: String?,
        body: Map<String, Any?>,
    ): Map<String, Any?> {
        capabilities.decide("PAYMENTS_MP", "PROCESS_WEBHOOK", CapabilityActor.System)
        if (!signatures.configured() || !properties.identityReady()) throw InvalidWebhookSignature()
        if (xSignature.isNullOrBlank() || xRequestId.isNullOrBlank() || queryDataId.isNullOrBlank()) {
            throw InvalidWebhookSignature()
        }
        if (signatures.validate(xSignature, xRequestId, queryDataId) !is WebhookSignatureDecision.Accepted) {
            throw InvalidWebhookSignature()
        }
        val data = body["data"] as? Map<*, *>
        val bodyDataId = data?.get("id")?.toString()
        val bodyEventId = body["id"]?.toString().orEmpty()
        val userId = body["user_id"]?.toString().orEmpty()
        val applicationId = body["application_id"]?.toString().orEmpty()
        val known = jdbc.query(
            "SELECT 1 FROM mp_checkout_attempts WHERE provider_order_id=?",
            { _, _ -> 1 },
            queryDataId,
        ).isNotEmpty()
        val disposition = MpOrderWebhookPolicy.classify(
            WebhookIdentityInput(
                queryDataId = queryDataId,
                queryType = queryType ?: body["type"]?.toString(),
                bodyEventId = bodyEventId,
                bodyDataId = bodyDataId,
                bodyType = body["type"]?.toString(),
                userId = userId.ifBlank { null },
                applicationId = applicationId.ifBlank { null },
                xRequestId = xRequestId,
                expectedUserId = properties.expectedUserId,
                expectedApplicationId = properties.expectedApplicationId,
                acceptedTopic = properties.acceptedTopic,
                knownProviderOrderId = known,
            ),
        )
        val envelope = mapper.createObjectNode().apply {
            put("type", queryType ?: body["type"]?.toString())
            put("action", body["action"]?.toString())
            put("id", bodyEventId)
            put("user_id", userId)
            put("application_id", applicationId)
            put("query_data_id", queryDataId)
            put("body_data_id", bodyDataId)
        }.toString()
        if (envelope.length > WebhookInboxLimiter.MAX_ENVELOPE_CHARS) throw WebhookPayloadTooLarge()
        limiter.admit("MP_ORDERS", sourceIp, envelope)
        val processingStatus = if (disposition == WebhookDisposition.PROCESSABLE) "RECEIVED" else "QUARANTINED"
        val inboxId = transactions.execute {
            val inserted = jdbc.query(
                """INSERT INTO mp_order_notification_inbox(
                     user_id,body_event_id,raw_topic,query_data_id,body_data_id,provider_order_id_candidate,
                     x_request_id,signature_version,signature_result,application_id,envelope_redacted,disposition
                   ) VALUES (?,?,?,?,?,?,?,'v1','ACCEPTED',?,?::jsonb,?)
                   ON CONFLICT (user_id,body_event_id,query_data_id,x_request_id) DO NOTHING RETURNING id""",
                { rs, _ -> rs.getLong("id") },
                userId, bodyEventId, queryType ?: body["type"]?.toString().orEmpty(), queryDataId,
                bodyDataId.orEmpty(), queryDataId, xRequestId, applicationId, envelope, disposition.name,
            ).firstOrNull()
            val id = inserted ?: jdbc.queryForObject(
                """SELECT id FROM mp_order_notification_inbox
                   WHERE user_id=? AND body_event_id=? AND query_data_id=? AND x_request_id=?""",
                Long::class.java,
                userId, bodyEventId, queryDataId, xRequestId,
            )!!
            jdbc.update(
                "INSERT INTO mp_order_notification_processing(inbox_id,status) VALUES (?,?) ON CONFLICT (inbox_id) DO NOTHING",
                id, processingStatus,
            )
            id
        } ?: error("INBOX_PERSIST_FAILED")
        return mapOf(
            "accepted" to true,
            "inboxId" to inboxId,
            "disposition" to disposition.name,
            "applied" to false,
        )
    }
}
