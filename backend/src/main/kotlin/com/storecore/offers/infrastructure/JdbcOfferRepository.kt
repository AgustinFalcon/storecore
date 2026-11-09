package com.storecore.offers.infrastructure

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import com.storecore.catalog.domain.ProductStatus
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.offers.application.OfferNotFound
import com.storecore.offers.application.OfferRepository
import com.storecore.offers.application.OfferTransitionInvalid
import com.storecore.offers.application.OfferValidationFailed
import com.storecore.offers.domain.DiscountKind
import com.storecore.offers.domain.OfferDraft
import com.storecore.offers.domain.OfferStatus
import com.storecore.offers.domain.OfferTransition
import com.storecore.offers.domain.OfferView
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.Instant

@Repository
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class JdbcOfferRepository(private val jdbc: JdbcTemplate) : OfferRepository {
    override fun list(): List<OfferView> = jdbc.query(OFFER_SELECT + " ORDER BY o.priority DESC,o.id ASC", offerMapper)

    @Transactional
    override fun create(actor: InternalUserPrincipal, draft: OfferDraft): OfferView {
        val products = resolveProducts(draft.skus)
        if (products.size != draft.skus.size || products.any { !it.variantActive || !it.productStatus.active }) {
            throw OfferValidationFailed()
        }
        if (draft.discountKind == DiscountKind.FIXED && products.any { draft.discountValue > it.basePrice }) {
            throw OfferValidationFailed()
        }
        val offerId = jdbc.queryForObject(
            """INSERT INTO offers(name,status,priority,starts_at,ends_at,discount_type,discount_value,min_margin_percent,created_by)
               VALUES (?,'DRAFT',?,?,?,?,?,?,?) RETURNING id""",
            Long::class.java,
            draft.name, draft.priority, java.sql.Timestamp.from(draft.startsAt), java.sql.Timestamp.from(draft.endsAt),
            draft.discountKind.wire, draft.discountValue, draft.minMarginPercent, actor.userId,
        ) ?: throw OfferValidationFailed()
        products.map { it.productId }.distinct().sorted().forEach { productId ->
            jdbc.update("INSERT INTO offer_products(offer_id,product_id) VALUES (?,?)", offerId, productId)
        }
        audit(actor, "OFFER_CREATED", offerId, "{\"scopeSize\":${products.map { it.productId }.distinct().size}}")
        return find(offerId) ?: throw OfferNotFound()
    }

    @Transactional
    override fun transition(actor: InternalUserPrincipal, id: Long, transition: OfferTransition): OfferView {
        val locked = jdbc.query(
            """SELECT status,discount_type,discount_value,min_margin_percent,ends_at
               FROM offers WHERE id=? FOR UPDATE""",
            { rs, _ -> LockedOffer(
                OfferStatus.fromWire(rs.getString("status")), DiscountKind.fromWire(rs.getString("discount_type")),
                rs.getBigDecimal("discount_value"), rs.getBigDecimal("min_margin_percent"), rs.getTimestamp("ends_at").toInstant(),
            ) },
            id,
        ).singleOrNull() ?: throw OfferNotFound()
        if (locked.status == OfferStatus.UNKNOWN || locked.kind == DiscountKind.UNKNOWN || !transition.accepts(locked.status)) {
            throw OfferTransitionInvalid()
        }
        if (transition == OfferTransition.Activate) validateActivation(id, locked)
        when (transition) {
            OfferTransition.Activate -> jdbc.update(
                "UPDATE offers SET status='ACTIVE',approved_by=?,approved_at=clock_timestamp() WHERE id=?",
                actor.userId, id,
            )
            OfferTransition.Pause -> jdbc.update("UPDATE offers SET status='PAUSED' WHERE id=?", id)
            OfferTransition.End -> jdbc.update("UPDATE offers SET status='ENDED' WHERE id=?", id)
            OfferTransition.Unknown -> throw OfferTransitionInvalid()
        }
        audit(actor, "OFFER_${transition.wire}", id, "{\"transition\":\"${transition.wire}\"}")
        return find(id) ?: throw OfferNotFound()
    }

    private fun validateActivation(id: Long, offer: LockedOffer) {
        if (offer.minMarginPercent.compareTo(BigDecimal.ZERO) != 0 || !offer.endsAt.isAfter(Instant.now())) {
            throw OfferValidationFailed()
        }
        val prices = jdbc.query(
            """SELECT p.base_price FROM offer_products op JOIN products p ON p.id=op.product_id
               WHERE op.offer_id=? ORDER BY p.id FOR UPDATE OF p""",
            { rs, _ -> rs.getBigDecimal("base_price") }, id,
        )
        if (prices.isEmpty() || (offer.kind == DiscountKind.PERCENT && offer.value > HUNDRED) ||
            (offer.kind == DiscountKind.FIXED && prices.any { offer.value > it })) throw OfferValidationFailed()
    }

    private fun resolveProducts(skus: List<String>): List<ProductScope> {
        val placeholders = skus.joinToString(",") { "?" }
        return jdbc.query(
            """SELECT v.sku,v.active,p.id AS product_id,p.base_price,p.status
               FROM product_variants v JOIN products p ON p.id=v.product_id
               WHERE v.sku IN ($placeholders) ORDER BY p.id,v.sku""",
            { rs, _ -> ProductScope(rs.getString("sku"), rs.getLong("product_id"), rs.getBigDecimal("base_price"), ProductStatus.fromWire(rs.getString("status")), rs.getBoolean("active")) },
            *skus.toTypedArray(),
        )
    }

    private fun find(id: Long): OfferView? = jdbc.query("$OFFER_SELECT WHERE o.id=?", offerMapper, id).singleOrNull()

    private fun audit(actor: InternalUserPrincipal, event: String, offerId: Long, payload: String) {
        jdbc.update(
            """INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted)
               VALUES ('USER',?,'$event','offers',?,?::jsonb)""",
            actor.userId.toString(), offerId, payload,
        )
    }

    private data class ProductScope(val sku: String, val productId: Long, val basePrice: BigDecimal, val productStatus: ProductStatus, val variantActive: Boolean)
    private data class LockedOffer(val status: OfferStatus, val kind: DiscountKind, val value: BigDecimal, val minMarginPercent: BigDecimal, val endsAt: Instant)

    private companion object {
        val HUNDRED = BigDecimal("100")
        val offerMapper = org.springframework.jdbc.core.RowMapper { rs, _ ->
            val skus = (rs.getArray("skus")?.array as? Array<*>)?.mapNotNull { it?.toString() } ?: emptyList()
            OfferView(
                rs.getLong("id"), rs.getString("name"), OfferStatus.fromWire(rs.getString("status")), rs.getInt("priority"),
                rs.getTimestamp("starts_at").toInstant(), rs.getTimestamp("ends_at").toInstant(), DiscountKind.fromWire(rs.getString("discount_type")),
                rs.getBigDecimal("discount_value"), rs.getBigDecimal("min_margin_percent"), skus, rs.getTimestamp("created_at").toInstant(),
                rs.getTimestamp("approved_at")?.toInstant(),
            )
        }
        const val OFFER_SELECT = """SELECT o.id,o.name,o.status,o.priority,o.starts_at,o.ends_at,o.discount_type,o.discount_value,
            o.min_margin_percent,o.created_at,o.approved_at,
            ARRAY(SELECT v.sku FROM offer_products op JOIN product_variants v ON v.product_id=op.product_id
                  WHERE op.offer_id=o.id ORDER BY v.sku) AS skus
            FROM offers o"""
    }
}
