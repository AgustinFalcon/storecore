package com.storecore.commerce.application

import com.storecore.commerce.application.port.ChannelListingMappingPort
import com.storecore.commerce.application.port.MarketplaceAccountSelectorPort
import com.storecore.commerce.domain.MercadoLibreListingView
import com.storecore.commerce.domain.ProjectionSourceCause
import com.storecore.commerce.infrastructure.ChannelProjectionLockOrder
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class CreateListingMappingUseCase(
    private val capabilities: CapabilityDecisionPort,
    private val accounts: MarketplaceAccountSelectorPort,
    private val mappings: ChannelListingMappingPort,
    private val projection: DesiredStockProjectionUseCase,
    private val jdbc: JdbcTemplate,
    private val transactions: TransactionTemplate,
) {
    fun execute(actor: InternalUserPrincipal, command: CreateListingMappingCommand): MercadoLibreListingView {
        val accountId = command.accountId ?: throw CommerceValidation("ML_ACCOUNT_ID_REQUIRED")
        if (accountId <= 0L) throw CommerceValidation("ML_ACCOUNT_ID_REQUIRED")
        return transactions.execute {
            capabilities.decide("MARKETPLACE_ML", "SYNC", CapabilityActor.Internal(actor))
            val account = accounts.requireExternalMlSync(accountId)
            val variantId = mappings.requireVariantId(command.sku)
            val existingVariant = jdbc.query(
                """
                SELECT variant_id FROM channel_listings
                 WHERE account_id=? AND external_listing_id=? AND variation_id IS NOT DISTINCT FROM ?
                """.trimIndent(),
                { rs, _ -> rs.getLong(1) },
                account.id,
                command.externalListingId,
                command.variationId.ifBlank { null },
            ).firstOrNull()
            ChannelProjectionLockOrder(jdbc).lock(account.id, listOfNotNull(variantId, existingVariant))
            val written = mappings.upsert(account.id, command.externalListingId, command.variationId, variantId)
            if (written.remapped) {
                jdbc.update(
                    """INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted)
                       VALUES ('USER',?,'LISTING_REMAP_BLOCKED','CHANNEL_LISTING',?, jsonb_build_object('previousSkipped',true,'variantId',?))""",
                    actor.userId.toString(), written.listingId, variantId,
                )
            }
            projection.project(
                listOf(variantId),
                if (written.remapped) ProjectionSourceCause.ListingRemapped else ProjectionSourceCause.ListingPaused,
                CapabilityActor.Internal(actor),
                forceBaseline = written.remapped || written.created,
            )
            MercadoLibreListingView(command.externalListingId, command.variationId, command.sku, account.id)
        }!!
    }
}
