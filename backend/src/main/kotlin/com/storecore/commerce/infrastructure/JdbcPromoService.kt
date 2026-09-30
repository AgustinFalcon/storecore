package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.application.PromoWindowOverlap
import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.PromoView
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.time.Instant
import javax.sql.DataSource

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcPromoService(private val jdbc: JdbcTemplate, private val capabilities: CapabilityDecisionPort) {
    fun list(actor: InternalUserPrincipal): List<PromoView> {
        capabilities.decide("MANUAL_PROMOTIONS", "READ", CapabilityActor.Internal(actor))
        return jdbc.query(
            """SELECT p.id,v.sku,p.currency,p.effective_from,p.effective_to,p.approved_by,p.approved_at
               FROM channel_price_policies p JOIN channel_listings l ON l.id=p.listing_id JOIN product_variants v ON v.id=l.variant_id
               ORDER BY p.id DESC""",
        ) { rs, _ -> PromoView(rs.getLong("id").toString(), rs.getString("sku"), rs.getString("currency"), rs.getTimestamp("effective_from").toInstant().toString(), rs.getTimestamp("effective_to").toInstant().toString(), 0, BigDecimal.ZERO, rs.getObject("approved_by")?.toString() ?: "", rs.getTimestamp("approved_at")?.toInstant()?.toString() ?: "") }
    }

    fun save(actor: InternalUserPrincipal, listingSku: String, currency: String, validFrom: Instant, validTo: Instant, priority: Int, margin: BigDecimal, approvedBy: String?, approvedAt: Instant?, writer: String): PromoView {
        capabilities.decide("MANUAL_PROMOTIONS", "WRITE_PRICE", CapabilityActor.Internal(actor))
        if (writer != "MANUAL") throw CommerceValidation("WRITER_MUST_BE_MANUAL")
        if (currency != "ARS") throw CommerceValidation("UNSUPPORTED_CURRENCY")
        val approver = approvedBy?.toLongOrNull() ?: actor.userId
        val approved = approvedAt ?: Instant.now()
        val variant = jdbc.query("SELECT v.id,p.id product_id,p.base_price FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.sku=?", { rs, _ -> Triple(rs.getLong("id"), rs.getLong("product_id"), rs.getBigDecimal("base_price")) }, listingSku).firstOrNull() ?: throw com.storecore.identity.application.ResourceNotFound()
        val accountId = jdbc.query("SELECT id FROM channel_accounts WHERE account_key='manual-price-writer'", { rs, _ -> rs.getLong("id") }).firstOrNull()
            ?: jdbc.queryForObject(
                "INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state,purpose) VALUES ('manual-price-writer','MERCADO_LIBRE','ref:manual-price-writer','ACTIVE',?) RETURNING id",
                Long::class.java,
                ChannelAccountPurpose.InternalPricePolicy.wire,
            )!!
        val listingId = jdbc.query("SELECT id FROM channel_listings WHERE account_id=? AND variant_id=?", { rs, _ -> rs.getLong("id") }, accountId, variant.first).firstOrNull()
            ?: jdbc.queryForObject("INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state) VALUES (?,?,?,?, 'ACTIVE') RETURNING id", Long::class.java, accountId, listingSku, listingSku, variant.first)!!
        val policyId = try {
            jdbc.queryForObject("INSERT INTO channel_price_policies(listing_id,currency,price_scope,base_price,desired_price,effective_promo_price,writer_kind,status,effective_from,effective_to,approved_by,approved_at) VALUES (?,?,'DEFAULT',?,?,?, 'MANUAL','ACTIVE',?,?,?,?) RETURNING id", Long::class.java, listingId, currency, variant.third, variant.third, variant.third, java.sql.Timestamp.from(validFrom), java.sql.Timestamp.from(validTo), approver, java.sql.Timestamp.from(approved))!!
        } catch (exception: Exception) {
            val text = generateSequence(exception as Throwable) { it.cause }.mapNotNull { it.message }.joinToString(" ")
            if (exception is DataIntegrityViolationException || text.contains("ex_active_price_policy_window") || text.contains("exclusion")) throw PromoWindowOverlap()
            throw exception
        }
        return PromoView(policyId.toString(), listingSku, currency, validFrom.toString(), validTo.toString(), priority, margin, approver.toString(), approved.toString())
    }
}
