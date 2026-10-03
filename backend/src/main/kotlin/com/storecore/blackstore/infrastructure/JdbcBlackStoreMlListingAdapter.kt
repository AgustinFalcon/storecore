package com.storecore.blackstore.infrastructure

import com.storecore.blackstore.BlackStoreSagaPolicy
import com.storecore.blackstore.application.port.BlackStoreMlListingPort
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.application.CapabilityDisabled
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.util.UUID

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcBlackStoreMlListingAdapter(
    private val jdbc: JdbcTemplate,
    private val capabilities: CapabilityDecisionPort,
) : BlackStoreMlListingPort {
    override fun enqueueDesiredQuantityAfterBlackStore(reservationRef: String?): Boolean {
        if (reservationRef.isNullOrBlank()) return false
        val ref = try {
            UUID.fromString(reservationRef)
        } catch (_: IllegalArgumentException) {
            return false
        }
        try {
            capabilities.decide(JdbcCapabilityService.BLACKSTORE_MODULE, "STOCK_READ", CapabilityActor.System)
        } catch (_: CapabilityDisabled) {
            return false
        } catch (_: RuntimeException) {
            return false
        }
        val variants = jdbc.query(
            """
            SELECT DISTINCT l.variant_id
            FROM blackstore_integration_reservation_lines l
            WHERE l.reservation_ref = ?
            """.trimIndent(),
            { rs, _ -> rs.getLong("variant_id") },
            ref,
        )
        if (variants.isEmpty()) return false
        var enqueued = false
        variants.forEach { variantId ->
            val sellable = jdbc.queryForObject(
                """
                SELECT GREATEST(0, COALESCE(available_quantity, 0) - COALESCE(safety_stock, 0))
                FROM inventory_balances
                WHERE variant_id = ?
                """.trimIndent(),
                Int::class.java,
                variantId,
            ) ?: 0
            val listings = jdbc.query(
                """
                SELECT id, account_id
                FROM channel_listings
                WHERE variant_id = ? AND state = 'ACTIVE'
                """.trimIndent(),
                { rs, _ -> rs.getLong("id") to rs.getLong("account_id") },
                variantId,
            )
            listings.forEach { (listingId, accountId) ->
                jdbc.update(
                    "UPDATE channel_listings SET desired_quantity = ?, updated_at = now() WHERE id = ?",
                    sellable,
                    listingId,
                )
                val key = BlackStoreSagaPolicy.uuidV5(
                    BlackStoreSagaPolicy.OPERATION_NAMESPACE,
                    "ml-desired:$ref:$listingId",
                )
                jdbc.update(
                    """
                    INSERT INTO channel_outbox(idempotency_key, account_id, listing_id, kind, payload_redacted)
                    VALUES (?, ?, ?, 'LISTING_STOCK', ?::jsonb)
                    ON CONFLICT (idempotency_key) DO NOTHING
                    """.trimIndent(),
                    key,
                    accountId,
                    listingId,
                    """{"reservationRef":"$ref","variantId":$variantId,"desiredQuantity":$sellable}""",
                )
                enqueued = true
            }
        }
        return enqueued
    }
}
