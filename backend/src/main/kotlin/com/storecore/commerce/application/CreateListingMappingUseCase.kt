package com.storecore.commerce.application

import com.storecore.commerce.application.port.ChannelListingMappingPort
import com.storecore.commerce.application.port.MarketplaceAccountSelectorPort
import com.storecore.commerce.domain.MercadoLibreListingView
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Service

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class CreateListingMappingUseCase(
    private val capabilities: CapabilityDecisionPort,
    private val accounts: MarketplaceAccountSelectorPort,
    private val mappings: ChannelListingMappingPort,
) {
    fun execute(actor: InternalUserPrincipal, command: CreateListingMappingCommand): MercadoLibreListingView {
        val accountId = command.accountId ?: throw CommerceValidation("ML_ACCOUNT_ID_REQUIRED")
        if (accountId <= 0L) throw CommerceValidation("ML_ACCOUNT_ID_REQUIRED")
        capabilities.decide("MARKETPLACE_ML", "SYNC", CapabilityActor.Internal(actor))
        val account = accounts.requireExternalMlSync(accountId)
        val variantId = mappings.requireVariantId(command.sku)
        mappings.upsert(account.id, command.externalListingId, command.variationId, variantId)
        return MercadoLibreListingView(command.externalListingId, command.variationId, command.sku, account.id)
    }
}
