package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.port.output.EffectivePriceQueryPort
import com.storecore.commerce.domain.EffectivePrice
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.math.BigDecimal
import java.math.RoundingMode

@Repository
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class JdbcEffectivePriceQueryAdapter(private val jdbc: JdbcTemplate) : EffectivePriceQueryPort {
    override fun findBySkus(skus: Collection<String>): Map<String, EffectivePrice> {
        val distinctSkus = skus.filter(String::isNotBlank).distinct()
        if (distinctSkus.isEmpty()) return emptyMap()
        val placeholders = distinctSkus.joinToString(",") { "?" }
        val prices = jdbc.query(
            """SELECT v.id AS variant_id,v.sku,p.base_price,v.active,p.status,
                      selected_offer.id AS offer_id,selected_offer.name AS campaign_ref,
                      selected_offer.discount_type,selected_offer.discount_value
               FROM product_variants v
               JOIN products p ON p.id=v.product_id
               LEFT JOIN LATERAL (
                   SELECT o.id,o.name,o.discount_type,o.discount_value
                   FROM offers o
                   JOIN offer_products op ON op.offer_id=o.id
                   WHERE op.product_id=p.id AND o.status='ACTIVE'
                     AND CURRENT_TIMESTAMP BETWEEN o.starts_at AND o.ends_at
                     AND p.status='ACTIVE' AND v.active
                   ORDER BY o.priority DESC,o.id ASC
                   LIMIT 1
               ) selected_offer ON TRUE
               WHERE v.sku IN ($placeholders)""",
            { rs, _ ->
                val base = rs.getBigDecimal("base_price") ?: BigDecimal.ZERO
                val discountType = rs.getString("discount_type")
                val amount = rs.getBigDecimal("discount_value") ?: BigDecimal.ZERO
                val discount = when (discountType) {
                    "PERCENT" -> base.multiply(amount).divide(BigDecimal(100), 2, RoundingMode.HALF_UP).min(base)
                    "FIXED" -> amount.min(base)
                    else -> BigDecimal.ZERO
                }
                val offerId = rs.getLong("offer_id").let { if (rs.wasNull()) null else it }
                EffectivePrice(
                    variantId = rs.getLong("variant_id"),
                    sku = rs.getString("sku"),
                    basePrice = base,
                    discountAmount = discount,
                    effectivePrice = base.subtract(discount),
                    offerRef = offerId?.toString(),
                    campaignRef = rs.getString("campaign_ref"),
                    active = rs.getString("status") == "ACTIVE" && rs.getBoolean("active"),
                )
            },
            *distinctSkus.toTypedArray(),
        )
        return prices.associateBy(EffectivePrice::sku)
    }
}
