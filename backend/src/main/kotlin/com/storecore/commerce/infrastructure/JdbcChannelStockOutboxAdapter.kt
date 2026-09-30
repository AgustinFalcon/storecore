package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.port.ChannelStockOutboxPort
import com.storecore.commerce.application.port.DesiredStockChangedIntent
import com.storecore.commerce.domain.ChannelOutboxKind
import com.storecore.commerce.domain.OutboxDeliveryStatus
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.util.UUID

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcChannelStockOutboxAdapter(
    private val jdbc: JdbcTemplate,
    private val mapper: ObjectMapper,
) : ChannelStockOutboxPort {
    override fun appendDesiredStockChanged(intent: DesiredStockChangedIntent) {
        val idempotency = UUID.nameUUIDFromBytes(
            "${ChannelOutboxKind.StockDesiredChanged.wire}|${intent.listingId}|${intent.projectionVersion}"
                .toByteArray(StandardCharsets.UTF_8),
        )
        val payload = mapper.createObjectNode()
            .put("listingId", intent.externalListingId)
            .put("variationId", intent.variationId ?: "")
            .put("desiredQuantity", intent.desiredQuantity)
            .put("projectionVersion", intent.projectionVersion)
            .put("sourceCause", intent.sourceCause)
            .put("contractVersion", CONTRACT_VERSION)
            .toString()
        val outboxId = jdbc.queryForObject(
            """
            INSERT INTO channel_outbox(idempotency_key, account_id, listing_id, kind, payload_redacted, projection_version)
            VALUES (?,?,?,?,?::jsonb,?)
            RETURNING id
            """.trimIndent(),
            Long::class.java,
            idempotency,
            intent.accountId,
            intent.listingId,
            ChannelOutboxKind.StockDesiredChanged.wire,
            payload,
            intent.projectionVersion,
        )!!
        jdbc.update(
            """
            INSERT INTO channel_outbox_stock_projection(
              outbox_id, listing_id, account_id, variant_id, projection_version, desired_quantity,
              mapping_fingerprint, eligibility_fingerprint, contract_version)
            VALUES (?,?,?,?,?,?,?,?,?)
            """.trimIndent(),
            outboxId,
            intent.listingId,
            intent.accountId,
            intent.variantId,
            intent.projectionVersion,
            intent.desiredQuantity,
            intent.mappingFingerprint,
            intent.eligibilityFingerprint,
            CONTRACT_VERSION,
        )
        jdbc.update(
            "INSERT INTO channel_outbox_delivery(outbox_id, status) VALUES (?,?)",
            outboxId,
            OutboxDeliveryStatus.Pending.wire,
        )
    }

    companion object {
        const val CONTRACT_VERSION = "dsp-stock-1"
    }
}
