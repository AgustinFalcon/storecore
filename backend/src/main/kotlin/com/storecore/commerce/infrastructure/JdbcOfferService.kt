package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.domain.OfferView
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.application.ResourceNotFound
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Instant
import java.time.format.DateTimeParseException

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcOfferService(
    private val jdbc: JdbcTemplate,
    private val mapper: ObjectMapper,
    private val capabilities: CapabilityDecisionPort,
) {
    fun list(actor: InternalUserPrincipal): List<OfferView> {
        capabilities.decide("CATALOG", "READ", CapabilityActor.Internal(actor))
        val offers = jdbc.query(
            """SELECT id,name,status,priority,starts_at,ends_at,discount_type,discount_value,min_margin_percent,approved_by,approved_at
               FROM offers ORDER BY id DESC""",
            { rs, _ -> row(rs, emptyList()) },
        )
        if (offers.isEmpty()) return offers
        val skus = jdbc.query(
            """SELECT op.offer_id,v.sku FROM offer_products op
               JOIN product_variants v ON v.product_id=op.product_id
               ORDER BY v.sku""",
            { rs, _ -> rs.getLong("offer_id") to rs.getString("sku") },
        ).groupBy({ it.first }, { it.second })
        return offers.map { offer -> offer.copy(skus = skus[offer.id.toLong()].orEmpty()) }
    }

    fun save(actor: InternalUserPrincipal, request: OfferWrite): OfferView {
        capabilities.decide("CATALOG", "MANAGE", CapabilityActor.Internal(actor))
        val name = request.name.trim()
        if (name.isEmpty() || name.length > 160) throw CommerceValidation("OFFER_NAME_INVALID")
        if (request.status != "DRAFT" && request.status != "ACTIVE") throw CommerceValidation("OFFER_STATUS_INVALID")
        val starts = instant(request.startsAt)
        val ends = instant(request.endsAt)
        if (!ends.isAfter(starts)) throw CommerceValidation("OFFER_WINDOW_INVALID")
        if (request.discountType != "PERCENT" && request.discountType != "FIXED") throw CommerceValidation("OFFER_DISCOUNT_INVALID")
        val discount = request.discountValue ?: throw CommerceValidation("OFFER_DISCOUNT_INVALID")
        if (discount.signum() <= 0) throw CommerceValidation("OFFER_DISCOUNT_INVALID")
        val margin = request.minMarginPercent ?: throw CommerceValidation("OFFER_MARGIN_INVALID")
        if (margin.signum() < 0 || margin > BigDecimal("999.99")) throw CommerceValidation("OFFER_MARGIN_INVALID")
        val skus = request.skus.map { it.trim() }.filter { it.isNotEmpty() }.distinct()
        if (skus.isEmpty()) throw CommerceValidation("OFFER_SKUS_REQUIRED")
        val productIds = LinkedHashSet<Long>()
        skus.forEach { sku ->
            val productId = jdbc.query(
                "SELECT product_id FROM product_variants WHERE sku=?",
                { rs, _ -> rs.getLong("product_id") },
                sku,
            ).firstOrNull() ?: throw ResourceNotFound()
            productIds += productId
        }
        val id = if (request.status == "ACTIVE") {
            val approvedAt = Instant.now()
            jdbc.queryForObject(
                """INSERT INTO offers(name,status,priority,starts_at,ends_at,discount_type,discount_value,min_margin_percent,created_by,approved_by,approved_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING id""",
                Long::class.java,
                name,
                request.status,
                request.priority,
                Timestamp.from(starts),
                Timestamp.from(ends),
                request.discountType,
                discount,
                margin,
                actor.userId,
                actor.userId,
                Timestamp.from(approvedAt),
            )!!
        } else {
            jdbc.queryForObject(
                """INSERT INTO offers(name,status,priority,starts_at,ends_at,discount_type,discount_value,min_margin_percent,created_by,approved_by,approved_at)
                   VALUES (?,?,?,?,?,?,?,?,?,NULL,NULL) RETURNING id""",
                Long::class.java,
                name,
                request.status,
                request.priority,
                Timestamp.from(starts),
                Timestamp.from(ends),
                request.discountType,
                discount,
                margin,
                actor.userId,
            )!!
        }
        productIds.forEach { productId ->
            jdbc.update("INSERT INTO offer_products(offer_id,product_id) VALUES (?,?)", id, productId)
        }
        jdbc.audit("USER", actor.userId.toString(), "OFFER_SAVED", "offers", id.toString(), mapper)
        return load(id)
    }

    private fun load(id: Long): OfferView {
        val offer = jdbc.query(
            """SELECT id,name,status,priority,starts_at,ends_at,discount_type,discount_value,min_margin_percent,approved_by,approved_at
               FROM offers WHERE id=?""",
            { rs, _ -> row(rs, emptyList()) },
            id,
        ).first()
        return offer.copy(skus = skusOf(id))
    }

    private fun skusOf(offerId: Long): List<String> = jdbc.query(
        """SELECT v.sku FROM offer_products op JOIN product_variants v ON v.product_id=op.product_id
           WHERE op.offer_id=? ORDER BY v.sku""",
        { rs, _ -> rs.getString("sku") },
        offerId,
    )

    private fun row(rs: ResultSet, skus: List<String>) = OfferView(
        rs.getLong("id").toString(),
        rs.getString("name"),
        rs.getString("status"),
        rs.getInt("priority"),
        rs.getTimestamp("starts_at").toInstant().toString(),
        rs.getTimestamp("ends_at").toInstant().toString(),
        rs.getString("discount_type"),
        rs.getBigDecimal("discount_value"),
        rs.getBigDecimal("min_margin_percent"),
        skus,
        rs.getObject("approved_by")?.toString(),
        rs.getTimestamp("approved_at")?.toInstant()?.toString(),
    )

    private fun instant(value: String): Instant = try {
        Instant.parse(value)
    } catch (_: DateTimeParseException) {
        throw CommerceValidation("OFFER_WINDOW_INVALID")
    }
}

data class OfferWrite(
    val name: String,
    val status: String,
    val priority: Int,
    val startsAt: String,
    val endsAt: String,
    val discountType: String,
    val discountValue: BigDecimal?,
    val minMarginPercent: BigDecimal?,
    val skus: List<String>,
)
