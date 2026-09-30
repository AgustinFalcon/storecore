package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.application.port.ChannelListingMappingPort
import com.storecore.commerce.application.port.ListingMappingWrite
import com.storecore.identity.application.ResourceNotFound
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcChannelListingMappingAdapter(private val jdbc: JdbcTemplate) : ChannelListingMappingPort {
    override fun requireVariantId(sku: String): Long =
        jdbc.query("SELECT id FROM product_variants WHERE sku=?", { rs, _ -> rs.getLong("id") }, sku)
            .firstOrNull() ?: throw ResourceNotFound()

    override fun upsert(accountId: Long, externalListingId: String, variationId: String, variantId: Long): ListingMappingWrite {
        val variation = variationId.ifBlank { null }
        val existing = jdbc.query(
            "SELECT id, variant_id FROM channel_listings WHERE account_id=? AND external_listing_id=? AND variation_id IS NOT DISTINCT FROM ?",
            { rs, _ -> rs.getLong("id") to rs.getLong("variant_id") },
            accountId, externalListingId, variation,
        ).firstOrNull()
        if (existing == null) {
            val listingId = jdbc.queryForObject(
                """INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state)
                   VALUES (?,?,?,?,'PAUSED') RETURNING id""",
                Long::class.java, accountId, externalListingId, variation, variantId,
            )!!
            return ListingMappingWrite(listingId, variantId, created = true, remapped = false)
        }
        val remapped = existing.second != variantId
        if (remapped) {
            jdbc.update(
                """UPDATE channel_listings
                   SET variant_id=?, mapping_revision=mapping_revision+1, manual_intervention_required=TRUE, state='PAUSED', updated_at=now()
                 WHERE id=?""",
                variantId, existing.first,
            )
        }
        return ListingMappingWrite(existing.first, variantId, created = false, remapped = remapped)
    }

    override fun requireListingId(accountId: Long, externalListingId: String, variationId: String): Long =
        jdbc.query(
            "SELECT id FROM channel_listings WHERE account_id=? AND external_listing_id=? AND variation_id IS NOT DISTINCT FROM ?",
            { rs, _ -> rs.getLong(1) },
            accountId, externalListingId, variationId.ifBlank { null },
        ).firstOrNull() ?: throw ResourceNotFound()

    override fun lockAndSetState(listingId: Long, state: String, clearIntervention: Boolean, requireNoIntervention: Boolean): Long {
        val row = jdbc.query(
            "SELECT variant_id, manual_intervention_required FROM channel_listings WHERE id=? FOR UPDATE",
            { rs, _ -> rs.getLong(1) to rs.getBoolean(2) },
            listingId,
        ).firstOrNull() ?: throw ResourceNotFound()
        if (requireNoIntervention && row.second) throw CommerceValidation("LISTING_MANUAL_INTERVENTION")
        if (clearIntervention) {
            jdbc.update("UPDATE channel_listings SET state=?, manual_intervention_required=FALSE, updated_at=now() WHERE id=?", state, listingId)
        } else {
            jdbc.update("UPDATE channel_listings SET state=?, updated_at=now() WHERE id=?", state, listingId)
        }
        return row.first
    }
}
