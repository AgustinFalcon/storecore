package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.MercadoLibreAccountMissing
import com.storecore.commerce.domain.MercadoLibreAccountView
import com.storecore.commerce.domain.MercadoLibreListingView
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcMercadoLibreService(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper, private val capabilities: CapabilityDecisionPort, private val limiter: WebhookInboxLimiter) {
    fun account(actor: InternalUserPrincipal): MercadoLibreAccountView {
        capabilities.decide("MARKETPLACE_ML", "READ", CapabilityActor.Internal(actor))
        val row = jdbc.query("SELECT account_key,state FROM channel_accounts WHERE channel='MERCADO_LIBRE' AND state='ACTIVE' AND account_key<>'manual-price-writer' ORDER BY id LIMIT 1", { rs, _ -> rs.getString("account_key") to rs.getString("state") }).firstOrNull()
        return if (row == null) MercadoLibreAccountView(false, "", "DISABLED") else MercadoLibreAccountView(true, row.first, row.second)
    }

    fun listings(actor: InternalUserPrincipal): List<MercadoLibreListingView> {
        capabilities.decide("MARKETPLACE_ML", "READ", CapabilityActor.Internal(actor))
        return jdbc.query("SELECT l.account_id,l.external_listing_id,COALESCE(l.variation_id,'') variation,v.sku FROM channel_listings l JOIN product_variants v ON v.id=l.variant_id JOIN channel_accounts a ON a.id=l.account_id WHERE a.channel='MERCADO_LIBRE' ORDER BY l.id") { rs, _ -> MercadoLibreListingView(rs.getString("external_listing_id"), rs.getString("variation"), rs.getString("sku"), rs.getLong("account_id")) }
    }

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
