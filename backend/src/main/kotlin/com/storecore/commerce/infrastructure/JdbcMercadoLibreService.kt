package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.MercadoLibreAccountMissing
import com.storecore.commerce.domain.MercadoLibreAccountView
import com.storecore.commerce.domain.MercadoLibreListingView
import com.storecore.commerce.domain.ChannelState
import com.storecore.commerce.domain.ChannelObservation
import com.storecore.commerce.domain.ChannelFactState
import com.storecore.commerce.domain.ChannelUnavailableReason
import com.storecore.catalog.domain.BoundedPage
import com.storecore.commerce.application.CommerceValidation
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.application.ResourceNotFound
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcMercadoLibreService(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper, private val capabilities: CapabilityDecisionPort, private val limiter: WebhookInboxLimiter, private val transactions: TransactionTemplate) {
    fun account(actor: InternalUserPrincipal): MercadoLibreAccountView {
        capabilities.decide("MARKETPLACE_ML", "READ", CapabilityActor.Internal(actor))
        return jdbc.query("SELECT account_key,state,updated_at FROM channel_accounts WHERE channel='MERCADO_LIBRE' AND account_key<>'manual-price-writer' ORDER BY id LIMIT 1",
            { rs, _ -> MercadoLibreAccountView(rs.getString("account_key"), ChannelState.fromWire(rs.getString("state")), ChannelFactState.KNOWN, null, rs.getTimestamp("updated_at").toInstant()) }).firstOrNull()
            ?: MercadoLibreAccountView(null, ChannelState.UNKNOWN, ChannelFactState.UNAVAILABLE, ChannelUnavailableReason.EXTERNAL_NOT_AVAILABLE, null)
    }

    fun listings(actor: InternalUserPrincipal, page: Int = 0, size: Int = 25): BoundedPage<MercadoLibreListingView> {
        capabilities.decide("MARKETPLACE_ML", "READ", CapabilityActor.Internal(actor))
        if (page < 0 || size !in 1..50) throw CommerceValidation("PAGE_INVALID")
        val total = jdbc.queryForObject("SELECT count(*) FROM channel_listings l JOIN channel_accounts a ON a.id=l.account_id WHERE a.channel='MERCADO_LIBRE' AND a.account_key<>'manual-price-writer'", Long::class.java)!!
        return BoundedPage(readListings("ORDER BY l.id LIMIT ? OFFSET ?", size, page.toLong() * size), total, page, size)
    }

    fun saveListing(actor: InternalUserPrincipal, listingId: String, variationId: String, sku: String): MercadoLibreListingView = transactions.execute {
        capabilities.decide("MARKETPLACE_ML", "SYNC", CapabilityActor.Internal(actor))
        val accountId = jdbc.query("SELECT id FROM channel_accounts WHERE channel='MERCADO_LIBRE' AND state='ACTIVE' AND account_key<>'manual-price-writer' ORDER BY id LIMIT 1", { rs, _ -> rs.getLong("id") }).firstOrNull() ?: throw MercadoLibreAccountMissing()
        val variantId = jdbc.query("SELECT id FROM product_variants WHERE sku=?", { rs, _ -> rs.getLong("id") }, sku).firstOrNull() ?: throw ResourceNotFound()
        jdbc.update("INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state) VALUES (?,?,?,?,'ACTIVE') ON CONFLICT (account_id,external_listing_id,variation_id) DO UPDATE SET variant_id=excluded.variant_id,updated_at=now()", accountId, listingId, variationId.ifBlank { null }, variantId)
        jdbc.audit("USER", actor.userId.toString(), "ML_LOCAL_MAPPING_SAVED", "channel_listings", listingId, mapper)
        readListings("AND l.account_id=? AND l.external_listing_id=? AND l.variation_id IS NOT DISTINCT FROM ?", accountId, listingId, variationId.ifBlank { null }).first()
    } ?: error("ML_MAPPING_TRANSACTION_FAILED")

    private fun readListings(suffix: String, vararg params: Any?): List<MercadoLibreListingView> = jdbc.query(
        """SELECT l.*,COALESCE(l.variation_id,'') variation,v.sku,a.account_key,p.desired_price,p.observed_price
           FROM channel_listings l JOIN product_variants v ON v.id=l.variant_id JOIN channel_accounts a ON a.id=l.account_id
           LEFT JOIN LATERAL (SELECT desired_price,observed_price FROM channel_price_policies WHERE listing_id=l.id ORDER BY id DESC LIMIT 1) p ON true
           WHERE a.channel='MERCADO_LIBRE' AND a.account_key<>'manual-price-writer' $suffix""",
        { rs, _ -> MercadoLibreListingView(rs.getString("external_listing_id"), rs.getString("variation"), rs.getString("sku"), rs.getString("account_key"),
            ChannelState.fromWire(rs.getString("state")), rs.getInt("desired_quantity"), rs.getBigDecimal("desired_price"),
            ChannelObservation.historical(rs.getObject("observed_quantity")?.let { (it as Number).toInt() }), ChannelObservation.historical(rs.getBigDecimal("observed_price")),
            rs.getBoolean("manual_intervention_required"), rs.getTimestamp("updated_at").toInstant()) }, *params)

    fun notify(sourceIp: String, topic: String?, resource: String?, body: Map<String, Any?>?, signature: String?): Map<String, Any?> {
        capabilities.decide("MARKETPLACE_ML", "SYNC", CapabilityActor.System)
        val account = jdbc.query("SELECT id,oauth_secret_reference,state FROM channel_accounts WHERE channel='MERCADO_LIBRE' AND state='ACTIVE' AND account_key<>'manual-price-writer' ORDER BY id LIMIT 1", { rs, _ -> Triple(rs.getLong("id"), rs.getString("oauth_secret_reference"), rs.getString("state")) }).firstOrNull() ?: throw MercadoLibreAccountMissing()
        val resolvedTopic = topic ?: body?.get("topic")?.toString() ?: "unknown"
        val resolvedResource = resource ?: body?.get("resource")?.toString() ?: ""
        if (resolvedTopic.isBlank() || resolvedResource.isBlank()) throw com.storecore.commerce.application.CommerceValidation("ML_NOTIFICATION_CONTRACT_INVALID")
        val notificationId = body?.get("id")?.toString() ?: "$resolvedTopic:$resolvedResource"
        val envelope = mapper.writeValueAsString(body ?: mapOf("topic" to resolvedTopic, "resource" to resolvedResource))
        limiter.admit("MERCADO_LIBRE", sourceIp, envelope)
        val inserted = jdbc.query("INSERT INTO ml_notification_inbox(account_id,notification_id,topic,resource,payload_redacted) VALUES (?,?,?,?,?::jsonb) ON CONFLICT (account_id,notification_id) DO NOTHING RETURNING id", { rs, _ -> rs.getLong("id") }, account.first, notificationId, resolvedTopic, resolvedResource, envelope).firstOrNull()
        val inboxId = inserted ?: jdbc.queryForObject("SELECT id FROM ml_notification_inbox WHERE account_id=? AND notification_id=?", Long::class.java, account.first, notificationId)!!
        jdbc.update("INSERT INTO ml_notification_processing(inbox_id,status) VALUES (?,'RECEIVED') ON CONFLICT (inbox_id) DO NOTHING", inboxId)
        return mapOf("accepted" to true, "notificationId" to notificationId, "replay" to (inserted == null), "applied" to false)
    }
}
