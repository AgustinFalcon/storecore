package com.storecore.commerce.infrastructure

import com.storecore.catalog.domain.BoundedPage
import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.application.PromoWindowOverlap
import com.storecore.commerce.domain.*
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.application.ResourceNotFound
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Instant

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcPromoService(private val jdbc: JdbcTemplate, private val capabilities: CapabilityDecisionPort, private val transactions: TransactionTemplate) {
    private val projection = """SELECT p.*,v.sku FROM channel_price_policies p JOIN channel_listings l ON l.id=p.listing_id JOIN product_variants v ON v.id=l.variant_id"""
    fun list(actor: InternalUserPrincipal, page: Int = 0, size: Int = 25): BoundedPage<PromoView> {
        capabilities.decide("MANUAL_PROMOTIONS", "READ", CapabilityActor.Internal(actor))
        validatePage(page, size)
        val total = jdbc.queryForObject("SELECT count(*) FROM channel_price_policies", Long::class.java)!!
        val items = jdbc.query("$projection ORDER BY p.id DESC LIMIT ? OFFSET ?", { rs, _ -> view(rs) }, size, page.toLong() * size)
        return BoundedPage(items, total, page, size)
    }

    fun save(actor: InternalUserPrincipal, listingSku: String, currency: PriceCurrency, scope: PriceScope, desiredPrice: BigDecimal,
        effectivePromoPrice: BigDecimal?, validFrom: Instant, validTo: Instant, writer: PriceWriter): PromoView = transactions.execute {
        capabilities.decide("MANUAL_PROMOTIONS", "WRITE_PRICE", CapabilityActor.Internal(actor))
        // Keep every catalog/commerce writer on the same global order: product, then
        // variant, then inventory balance. A joined FOR UPDATE can acquire v before p.
        val productId = jdbc.query("SELECT product_id FROM product_variants WHERE sku=?",
            { rs, _ -> rs.getLong("product_id") }, listingSku).firstOrNull() ?: throw ResourceNotFound()
        val basePrice = jdbc.query("SELECT base_price FROM products WHERE id=? FOR NO KEY UPDATE",
            { rs, _ -> rs.getBigDecimal("base_price") }, productId).firstOrNull() ?: throw ResourceNotFound()
        val variantId = jdbc.query("SELECT id FROM product_variants WHERE sku=? AND product_id=? FOR NO KEY UPDATE",
            { rs, _ -> rs.getLong("id") }, listingSku, productId).firstOrNull() ?: throw ResourceNotFound()
        val variant = variantId to basePrice
        val policy = ManualPricePolicy(currency, scope, writer, variant.second, desiredPrice, null, effectivePromoPrice, validFrom, validTo)
        if (!policy.valid()) throw CommerceValidation("PRICE_POLICY_INVALID")
        val accountId = jdbc.queryForObject("""INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state)
            VALUES ('manual-price-writer','MERCADO_LIBRE','ref:manual-price-writer','ACTIVE')
            ON CONFLICT (account_key) DO UPDATE SET account_key=excluded.account_key RETURNING id""", Long::class.java)!!
        val listingId = jdbc.queryForObject("""INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state)
            VALUES (?,?,?,?,'ACTIVE') ON CONFLICT (account_id,external_listing_id,variation_id) DO UPDATE SET variant_id=excluded.variant_id RETURNING id""",
            Long::class.java, accountId, listingSku, listingSku, variant.first)!!
        val id = jdbc.queryForObject("""INSERT INTO channel_price_policies(listing_id,currency,price_scope,base_price,desired_price,effective_promo_price,
            writer_kind,status,effective_from,effective_to) VALUES (?,?,?,?,?,?,?,'DRAFT',?,?) RETURNING id""", Long::class.java,
            listingId, currency.name, scope.name, variant.second, desiredPrice, effectivePromoPrice, writer.name, Timestamp.from(validFrom), Timestamp.from(validTo))!!
        audit(actor, id, "PRICE_POLICY_CREATED")
        get(id)
    } ?: error("PRICE_POLICY_TRANSACTION_FAILED")

    fun transition(actor: InternalUserPrincipal, id: Long, transition: PricePolicyTransition): PromoView = transactions.execute {
        capabilities.decide("MANUAL_PROMOTIONS", "WRITE_PRICE", CapabilityActor.Internal(actor))
        // Serialize policies for this listing; the exclusion constraint also protects other writers.
        val listing = jdbc.query("SELECT listing_id FROM channel_price_policies WHERE id=?", { rs, _ -> rs.getLong(1) }, id).firstOrNull() ?: throw ResourceNotFound()
        jdbc.query("SELECT id FROM channel_listings WHERE id=? FOR UPDATE", { rs, _ -> rs.getLong(1) }, listing)
        val current = jdbc.query("$projection WHERE p.id=? FOR UPDATE OF p", { rs, _ -> view(rs) }, id).firstOrNull() ?: throw ResourceNotFound()
        if (!transition.accepts(current.status)) throw CommerceValidation("PRICE_POLICY_TRANSITION_REJECTED")
        if (transition == PricePolicyTransition.Activate) {
            val now = jdbc.queryForObject("SELECT clock_timestamp()", Timestamp::class.java)!!.toInstant()
            val policy = ManualPricePolicy(current.currency, current.priceScope, current.writer, current.basePrice, current.desiredPrice,
                current.observedPrice.value, current.effectivePromoPrice, current.validFrom, current.validTo)
            if (!policy.canActivate(now)) throw CommerceValidation("PRICE_POLICY_ACTIVATION_INVALID")
            val overlap = jdbc.queryForObject("""SELECT count(*) FROM channel_price_policies WHERE listing_id=? AND id<>? AND status='ACTIVE'
                AND currency=? AND price_scope=? AND effective_window && tstzrange(?,?,'[)')""", Long::class.java,
                listing, id, current.currency.name, current.priceScope.name, Timestamp.from(current.validFrom), Timestamp.from(current.validTo))!!
            if (overlap > 0) throw PromoWindowOverlap()
            try { jdbc.update("UPDATE channel_price_policies SET status='ACTIVE',approved_by=?,approved_at=? WHERE id=?", actor.userId, Timestamp.from(now), id) }
            catch (error: DataIntegrityViolationException) { if (generateSequence(error as Throwable) { it.cause }.any { it.message?.contains("ex_active_price_policy_window") == true }) throw PromoWindowOverlap() else throw error }
        } else jdbc.update("UPDATE channel_price_policies SET status=? WHERE id=?", transition.target.name, id)
        audit(actor, id, "PRICE_POLICY_${transition.target.name}")
        get(id)
    } ?: error("PRICE_POLICY_TRANSACTION_FAILED")

    private fun audit(actor: InternalUserPrincipal, id: Long, event: String) {
        jdbc.update("INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted) VALUES ('USER',?,?,'channel_price_policies',?,'{}'::jsonb)", actor.userId.toString(), event, id)
    }
    private fun get(id: Long) = jdbc.query("$projection WHERE p.id=?", { rs, _ -> view(rs) }, id).first()
    private fun view(rs: ResultSet) = PromoView(rs.getLong("id").toString(), rs.getString("sku"), PriceCurrency.fromWire(rs.getString("currency")),
        PriceScope.fromWire(rs.getString("price_scope")), rs.getBigDecimal("base_price"), rs.getBigDecimal("desired_price"),
        ChannelObservation.historical(rs.getBigDecimal("observed_price")), rs.getBigDecimal("effective_promo_price"), PricePolicyStatus.fromWire(rs.getString("status")),
        rs.getTimestamp("effective_from").toInstant(), rs.getTimestamp("effective_to").toInstant(), PriceWriter.fromWire(rs.getString("writer_kind")),
        rs.getObject("approved_by")?.toString(), rs.getTimestamp("approved_at")?.toInstant())
    private fun validatePage(page: Int, size: Int) { if (page < 0 || size !in 1..50) throw CommerceValidation("PAGE_INVALID") }
}
