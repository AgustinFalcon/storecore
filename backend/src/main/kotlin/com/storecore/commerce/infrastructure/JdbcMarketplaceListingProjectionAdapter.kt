package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.port.LockedListingProjection
import com.storecore.commerce.application.port.MarketplaceListingProjectionPort
import com.storecore.commerce.application.port.ProjectionWrite
import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.ChannelAccountState
import com.storecore.commerce.domain.ProductCatalogStatus
import com.storecore.commerce.domain.ProjectionState
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcMarketplaceListingProjectionAdapter(private val jdbc: JdbcTemplate) : MarketplaceListingProjectionPort {
    override fun lockByVariantIds(variantIds: Collection<Long>): List<LockedListingProjection> {
        if (variantIds.isEmpty()) return emptyList()
        val placeholders = variantIds.joinToString(",") { "?" }
        return jdbc.query(
            """
            SELECT l.id listing_id, l.account_id, l.variant_id, l.external_listing_id, l.variation_id,
                   l.state listing_state, l.manual_intervention_required, l.mapping_revision,
                   a.purpose, a.state account_state, a.eligibility_revision account_revision,
                   p.status product_status, p.eligibility_revision product_revision,
                   v.active variant_active, v.eligibility_revision variant_revision,
                   COALESCE(b.available_quantity, 0) available_quantity,
                   COALESCE(b.reserved_quantity, 0) reserved_quantity,
                   COALESCE(b.safety_stock, 0) safety_stock,
                   pr.projection_version, pr.projection_state, pr.desired_quantity,
                   pr.withholding_reason, pr.mapping_fingerprint, pr.eligibility_fingerprint, pr.variant_id current_variant_id
              FROM channel_listings l
              JOIN channel_accounts a ON a.id = l.account_id
              JOIN product_variants v ON v.id = l.variant_id
              JOIN products p ON p.id = v.product_id
              LEFT JOIN inventory_balances b ON b.variant_id = l.variant_id
              LEFT JOIN channel_listing_stock_projection pr ON pr.listing_id = l.id
             WHERE l.variant_id IN ($placeholders)
             ORDER BY l.id ASC
             FOR UPDATE OF l
            """.trimIndent(),
            { rs, _ ->
                LockedListingProjection(
                    listingId = rs.getLong("listing_id"),
                    accountId = rs.getLong("account_id"),
                    variantId = rs.getLong("variant_id"),
                    externalListingId = rs.getString("external_listing_id"),
                    variationId = rs.getString("variation_id"),
                    listingState = ChannelAccountState.fromWire(rs.getString("listing_state")),
                    manualIntervention = rs.getBoolean("manual_intervention_required"),
                    mappingRevision = rs.getLong("mapping_revision"),
                    purpose = ChannelAccountPurpose.fromWire(rs.getString("purpose")),
                    accountState = ChannelAccountState.fromWire(rs.getString("account_state")),
                    accountRevision = rs.getLong("account_revision"),
                    productStatus = ProductCatalogStatus.fromWire(rs.getString("product_status")),
                    productRevision = rs.getLong("product_revision"),
                    variantActive = rs.getBoolean("variant_active"),
                    variantRevision = rs.getLong("variant_revision"),
                    availableQuantity = rs.getInt("available_quantity"),
                    reservedQuantity = rs.getInt("reserved_quantity"),
                    safetyStock = rs.getInt("safety_stock"),
                    currentVersion = rs.getObject("projection_version")?.let { rs.getLong("projection_version") },
                    currentState = rs.getString("projection_state")?.let { ProjectionState.fromWire(it) },
                    currentQuantity = rs.getObject("desired_quantity")?.let { rs.getInt("desired_quantity") },
                    currentReason = rs.getString("withholding_reason"),
                    currentMappingFingerprint = rs.getString("mapping_fingerprint"),
                    currentEligibilityFingerprint = rs.getString("eligibility_fingerprint"),
                    currentVariantId = rs.getObject("current_variant_id")?.let { rs.getLong("current_variant_id") },
                )
            },
            *variantIds.toTypedArray(),
        )
    }

    override fun write(photo: ProjectionWrite): Int {
        val updated = if (photo.expectedVersion == null) {
            jdbc.update(
                """
                INSERT INTO channel_listing_stock_projection(
                  listing_id, account_id, variant_id, external_listing_id, variation_id, desired_quantity,
                  projection_version, projection_state, withholding_reason, mapping_fingerprint,
                  eligibility_fingerprint, source_cause)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                """.trimIndent(),
                photo.listingId,
                photo.accountId,
                photo.variantId,
                photo.externalListingId,
                photo.variationId,
                photo.desiredQuantity,
                photo.nextVersion,
                photo.state.wire,
                photo.withholdingReason,
                photo.mappingFingerprint,
                photo.eligibilityFingerprint,
                photo.sourceCause,
            )
        } else {
            jdbc.update(
                """
                UPDATE channel_listing_stock_projection
                   SET account_id=?, variant_id=?, external_listing_id=?, variation_id=?,
                       desired_quantity=?, projection_version=?, projection_state=?, withholding_reason=?,
                       mapping_fingerprint=?, eligibility_fingerprint=?, source_cause=?, updated_at=now()
                 WHERE listing_id=? AND projection_version=?
                """.trimIndent(),
                photo.accountId,
                photo.variantId,
                photo.externalListingId,
                photo.variationId,
                photo.desiredQuantity,
                photo.nextVersion,
                photo.state.wire,
                photo.withholdingReason,
                photo.mappingFingerprint,
                photo.eligibilityFingerprint,
                photo.sourceCause,
                photo.listingId,
                photo.expectedVersion,
            )
        }
        if (updated == 1) {
            jdbc.update("UPDATE channel_listings SET desired_quantity=?, updated_at=now() WHERE id=?", photo.desiredQuantity, photo.listingId)
        }
        return updated
    }
}
