package com.storecore.catalog.infrastructure

import com.storecore.catalog.application.port.output.PriceQuotePort
import com.storecore.catalog.domain.CatalogVersion
import com.storecore.catalog.domain.OfferWindow
import com.storecore.catalog.domain.PriceQuote
import com.storecore.catalog.domain.PriceVersion
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.math.BigDecimal
import java.math.RoundingMode
import java.sql.Timestamp
import java.time.Instant

@Repository
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class JdbcPriceQuoteAdapter(private val jdbc: JdbcTemplate) : PriceQuotePort {
    override fun clock(): Instant =
        jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)!!.toInstant()

    override fun shareRevision(): Long =
        jdbc.queryForObject("SELECT public.blackstore_catalog_revision_share()", Long::class.java)!!

    override fun catalogVersion(asOf: Instant): CatalogVersion {
        val revision = jdbc.queryForObject("SELECT revision FROM public.blackstore_catalog_revision WHERE id=1", Long::class.java)!!
        val currency = currency()
        val offerIds = jdbc.query(
            """
            SELECT o.id FROM offers o
             WHERE ${OfferWindow.SQL}
             ORDER BY o.id
            """.trimIndent(),
            { rs, _ -> rs.getLong("id") },
            Timestamp.from(asOf),
            Timestamp.from(asOf),
        )
        val parts = mutableListOf("c1", revision.toString(), currency)
        parts.addAll(offerIds.map(Long::toString))
        return CatalogVersion.current(VersionDigest.sha256Url(parts))
    }

    override fun quoteByVariantIds(asOf: Instant, variantIds: Collection<Long>): Map<Long, PriceQuote> {
        val ids = variantIds.distinct()
        if (ids.isEmpty()) return emptyMap()
        return load(asOf, "v.id IN (${ids.joinToString(",") { "?" }})", ids.map { it as Any }).associateBy { it.variantId }
    }

    override fun quoteBySkus(asOf: Instant, skus: Collection<String>): Map<String, PriceQuote> {
        val distinct = skus.filter(String::isNotBlank).distinct()
        if (distinct.isEmpty()) return emptyMap()
        return load(asOf, "v.sku IN (${distinct.joinToString(",") { "?" }})", distinct).associateBy { it.sku }
    }

    private fun load(asOf: Instant, predicate: String, args: Collection<Any>): List<PriceQuote> {
        val currency = currency()
        val at = Timestamp.from(asOf)
        val params = listOf<Any>(at, at) + args
        return jdbc.query(
            """
            SELECT v.id AS variant_id, v.sku, v.active, p.base_price, p.status,
                   selected_offer.id AS offer_id, selected_offer.name AS campaign_ref,
                   selected_offer.discount_type, selected_offer.discount_value,
                   selected_offer.priority, selected_offer.starts_at, selected_offer.ends_at
              FROM product_variants v
              JOIN products p ON p.id = v.product_id
              LEFT JOIN LATERAL (
                SELECT o.id, o.name, o.discount_type, o.discount_value, o.priority, o.starts_at, o.ends_at
                  FROM offers o
                  JOIN offer_products op ON op.offer_id = o.id
                 WHERE op.product_id = p.id
                   AND ${OfferWindow.SQL}
                 ORDER BY o.priority DESC, o.id ASC
                 LIMIT 1
              ) selected_offer ON TRUE
             WHERE $predicate
            """.trimIndent(),
            { rs, _ ->
                val base = (rs.getBigDecimal("base_price") ?: BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP)
                val discountType = rs.getString("discount_type")
                val amount = rs.getBigDecimal("discount_value") ?: BigDecimal.ZERO
                val discount = when (discountType) {
                    "PERCENT" -> base.multiply(amount).divide(BigDecimal(100), 2, RoundingMode.HALF_UP).min(base)
                    "FIXED" -> amount.min(base)
                    else -> BigDecimal.ZERO
                }.setScale(2, RoundingMode.HALF_UP)
                val effective = base.subtract(discount).setScale(2, RoundingMode.HALF_UP)
                val offerId = rs.getLong("offer_id").let { if (rs.wasNull()) null else it }
                val priority = rs.getInt("priority").let { if (rs.wasNull()) null else it }
                val starts = rs.getTimestamp("starts_at")?.toInstant()
                val ends = rs.getTimestamp("ends_at")?.toInstant()
                val sku = rs.getString("sku")
                val variantId = rs.getLong("variant_id")
                PriceQuote(
                    variantId = variantId,
                    sku = sku,
                    currency = currency,
                    basePrice = base,
                    discountAmount = discount,
                    effectivePrice = effective,
                    priceVersion = PriceVersion.quoted(
                        VersionDigest.sha256Url(
                            listOf(
                                variantId.toString(),
                                sku,
                                currency,
                                cents(base),
                                cents(discount),
                                cents(effective),
                                offerId?.toString() ?: "null",
                                priority?.toString() ?: "null",
                                discountType ?: "null",
                                amount.toPlainString(),
                                starts?.toString() ?: "null",
                                ends?.toString() ?: "null",
                            ),
                        ),
                    ),
                    offerId = offerId,
                    offerPriority = priority,
                    validFrom = if (offerId == null) null else starts,
                    validUntil = if (offerId == null) null else ends,
                    campaignRef = rs.getString("campaign_ref"),
                    sellableActive = rs.getString("status") == "ACTIVE" && rs.getBoolean("active"),
                )
            },
            *params.toTypedArray(),
        )
    }

    private fun currency(): String =
        jdbc.query(
            "SELECT currency FROM installation_settings WHERE installation_id=1",
            { rs, _ -> rs.getString("currency") },
        ).firstOrNull() ?: "ARS"

    private fun cents(value: BigDecimal): String =
        value.movePointRight(2).setScale(0, RoundingMode.HALF_UP).toPlainString()
}
