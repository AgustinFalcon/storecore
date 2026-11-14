package com.storecore.favorites.infrastructure

import com.storecore.catalog.domain.*
import com.storecore.offers.domain.DiscountKind
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import com.storecore.favorites.application.FavoriteLimitReached
import com.storecore.favorites.application.FavoriteProductUnavailable
import com.storecore.favorites.application.FavoriteRepository
import com.storecore.favorites.domain.FavoriteAvailability
import com.storecore.favorites.domain.FavoriteItem
import com.storecore.favorites.domain.FavoriteMutation
import com.storecore.favorites.domain.FavoriteMutationOutcome
import com.storecore.identity.domain.CustomerPrincipal
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Repository
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class JdbcFavoriteRepository(private val jdbc: JdbcTemplate) : FavoriteRepository {
    override fun list(customer: CustomerPrincipal): List<FavoriteItem> = jdbc.query(
        """SELECT v.sku,p.name,p.base_price,v.base_price_override,o.id offer_id,o.name offer_name,o.discount_type,o.discount_value,im.url,f.added_at,
           (v.active AND p.status='ACTIVE') AS available
           FROM customer_favorites f JOIN product_variants v ON v.id=f.variant_id
           JOIN products p ON p.id=v.product_id
           LEFT JOIN LATERAL (SELECT url FROM product_images WHERE product_id=p.id AND is_primary ORDER BY id LIMIT 1) im ON TRUE
           LEFT JOIN LATERAL (SELECT o.* FROM offers o JOIN offer_products op ON op.offer_id=o.id WHERE op.product_id=p.id AND o.status='ACTIVE' AND now() BETWEEN o.starts_at AND o.ends_at ORDER BY o.priority DESC,o.id LIMIT 1) o ON TRUE
           WHERE f.customer_id=? ORDER BY f.added_at DESC,v.sku LIMIT 200""",
        { rs, _ ->
            val policy=VariantBasePricePolicy.fromPersistence(rs.getString("base_price")?.toBigDecimalOrNull(),rs.getString("base_price_override"))
            val offer=rs.getString("offer_id")?.let { SkuOffer(it,rs.getString("offer_name"),DiscountKind.fromWire(rs.getString("discount_type")),rs.getString("discount_value")?.toBigDecimalOrNull()) }
            val resolution=if(rs.getBoolean("available")) SkuPricePolicy.resolve(policy,offer) else SkuPriceResolution.Unknown(PriceUnknownReason.SKU_UNAVAILABLE)
            val available=rs.getBoolean("available") && resolution is SkuPriceResolution.Known
            FavoriteItem(rs.getString("sku"),rs.getString("name"),if(available) resolution.knownPrice()?.effective else null,rs.getString("url"),if(available) FavoriteAvailability.AVAILABLE else FavoriteAvailability.UNAVAILABLE,rs.getTimestamp("added_at").toInstant(),resolution)
        },
        customer.customerId,
    )

    @Transactional
    override fun add(customer: CustomerPrincipal, sku: String): FavoriteMutation {
        lockCustomer(customer)
        val variantId = jdbc.query("""SELECT v.id FROM product_variants v JOIN products p ON p.id=v.product_id
            WHERE v.sku=? AND v.active AND p.status='ACTIVE'""", { rs, _ -> rs.getLong(1) }, sku).singleOrNull()
            ?: throw FavoriteProductUnavailable()
        val present = jdbc.query("SELECT 1 FROM customer_favorites WHERE customer_id=? AND variant_id=?", { rs, _ -> rs.getInt(1) }, customer.customerId, variantId).isNotEmpty()
        if (present) return FavoriteMutation(sku, FavoriteMutationOutcome.ALREADY_PRESENT)
        val count = jdbc.queryForObject("SELECT count(*) FROM customer_favorites WHERE customer_id=?", Long::class.java, customer.customerId) ?: 0
        if (count >= 200) throw FavoriteLimitReached()
        jdbc.update("INSERT INTO customer_favorites(customer_id,variant_id) VALUES (?,?)", customer.customerId, variantId)
        return FavoriteMutation(sku, FavoriteMutationOutcome.ADDED)
    }

    @Transactional
    override fun remove(customer: CustomerPrincipal, sku: String): FavoriteMutation {
        lockCustomer(customer)
        val removed = jdbc.update("""DELETE FROM customer_favorites f USING product_variants v
            WHERE f.customer_id=? AND f.variant_id=v.id AND v.sku=?""", customer.customerId, sku)
        return FavoriteMutation(sku, if (removed == 1) FavoriteMutationOutcome.REMOVED else FavoriteMutationOutcome.ALREADY_ABSENT)
    }

    private fun lockCustomer(customer: CustomerPrincipal) {
        if (jdbc.query("SELECT id FROM customers WHERE id=? FOR UPDATE", { rs, _ -> rs.getLong(1) }, customer.customerId).isEmpty()) throw FavoriteProductUnavailable()
    }
}
