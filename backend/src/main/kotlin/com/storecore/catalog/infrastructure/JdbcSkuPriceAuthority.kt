package com.storecore.catalog.infrastructure

import com.storecore.catalog.application.SkuPriceAuthority
import com.storecore.catalog.application.SkuPriceIdentity
import com.storecore.catalog.domain.*
import com.storecore.offers.domain.DiscountKind
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcSkuPriceAuthority(private val jdbc: JdbcTemplate): SkuPriceAuthority {
    override fun resolve(sku: String): SkuPriceIdentity? = jdbc.query("""SELECT v.id,v.active,v.base_price_override,p.base_price,p.status,o.id offer_id,o.name offer_name,o.discount_type,o.discount_value
        FROM product_variants v JOIN products p ON p.id=v.product_id
        LEFT JOIN LATERAL (SELECT o.* FROM offers o JOIN offer_products op ON op.offer_id=o.id
          WHERE op.product_id=p.id AND o.status='ACTIVE' AND now() BETWEEN o.starts_at AND o.ends_at
          ORDER BY o.priority DESC,o.id LIMIT 1) o ON TRUE WHERE v.sku=?""", { rs, _ ->
        val policy=VariantBasePricePolicy.fromPersistence(rs.getString("base_price")?.toBigDecimalOrNull(),rs.getString("base_price_override"))
        val offer=rs.getString("offer_id")?.let { SkuOffer(it,rs.getString("offer_name"),DiscountKind.fromWire(rs.getString("discount_type")),rs.getString("discount_value")?.toBigDecimalOrNull()) }
        SkuPriceIdentity(rs.getLong("id"),ProductStatus.fromWire(rs.getString("status")),VariantStatus.fromWire(rs.getBoolean("active")),SkuPricePolicy.resolve(policy,offer))
    },sku).singleOrNull()
}
