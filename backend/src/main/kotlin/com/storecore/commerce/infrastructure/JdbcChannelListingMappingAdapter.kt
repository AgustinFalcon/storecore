package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.port.ChannelListingMappingPort
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

    override fun upsert(accountId: Long, externalListingId: String, variationId: String, variantId: Long) {
        jdbc.update(
            """INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state)
               VALUES (?,?,?,?,'ACTIVE')
               ON CONFLICT (account_id,external_listing_id,variation_id)
               DO UPDATE SET variant_id=excluded.variant_id, mapping_revision=channel_listings.mapping_revision + 1, updated_at=now()""",
            accountId,
            externalListingId,
            variationId.ifBlank { null },
            variantId,
        )
    }
}
