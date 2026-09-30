package com.storecore.commerce.application

import com.storecore.commerce.application.port.ChannelListingMappingPort
import com.storecore.commerce.application.port.MarketplaceAccountSelectorPort
import com.storecore.commerce.domain.ListingLifecycleAction
import com.storecore.commerce.domain.ProjectionSourceCause
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate

data class ListingLifecycleCommand(
    val accountId: Long?,
    val externalListingId: String,
    val variationId: String,
    val action: ListingLifecycleAction,
)

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class ListingLifecycleUseCase(
    private val capabilities: CapabilityDecisionPort,
    private val accounts: MarketplaceAccountSelectorPort,
    private val mappings: ChannelListingMappingPort,
    private val projection: DesiredStockProjectionUseCase,
    private val jdbc: JdbcTemplate,
    private val transactions: TransactionTemplate,
) {
    fun execute(actor: InternalUserPrincipal, command: ListingLifecycleCommand) {
        val accountId = command.accountId ?: throw CommerceValidation("ML_ACCOUNT_ID_REQUIRED")
        if (accountId <= 0L) throw CommerceValidation("ML_ACCOUNT_ID_REQUIRED")
        if (command.action === ListingLifecycleAction.Unknown) throw CommerceValidation("LISTING_LIFECYCLE_ACTION_UNKNOWN")
        transactions.executeWithoutResult {
            capabilities.decide("MARKETPLACE_ML", "SYNC", CapabilityActor.Internal(actor))
            accounts.requireExternalMlSync(accountId)
            val listingId = mappings.requireListingId(accountId, command.externalListingId, command.variationId)
            val variantId = when (command.action) {
                ListingLifecycleAction.Activate -> mappings.lockAndSetState(listingId, "ACTIVE", requireNoIntervention = true)
                ListingLifecycleAction.Pause -> mappings.lockAndSetState(listingId, "PAUSED")
                ListingLifecycleAction.ConfirmMapping -> {
                    val id = mappings.lockAndSetState(listingId, "ACTIVE", clearIntervention = true)
                    jdbc.update(
                        """INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted)
                           VALUES ('USER',?,'LISTING_MAPPING_CONFIRMED','CHANNEL_LISTING',?, jsonb_build_object('listingId',?))""",
                        actor.userId.toString(), listingId, listingId,
                    )
                    id
                }
                else -> throw CommerceValidation("LISTING_LIFECYCLE_ACTION_UNKNOWN")
            }
            val cause = when (command.action) {
                ListingLifecycleAction.Activate -> ProjectionSourceCause.ListingActivated
                ListingLifecycleAction.Pause -> ProjectionSourceCause.ListingPaused
                ListingLifecycleAction.ConfirmMapping -> ProjectionSourceCause.ListingMappingConfirmed
                else -> ProjectionSourceCause.Unknown
            }
            val force = command.action === ListingLifecycleAction.Activate || command.action === ListingLifecycleAction.ConfirmMapping
            projection.project(listOf(variantId), cause, CapabilityActor.Internal(actor), forceBaseline = force)
        }
    }
}
