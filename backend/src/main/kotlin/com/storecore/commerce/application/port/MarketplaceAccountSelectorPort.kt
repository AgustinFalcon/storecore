package com.storecore.commerce.application.port

import com.storecore.commerce.domain.SelectedMarketplaceAccount

interface MarketplaceAccountSelectorPort {
    fun requireExternalMlSync(accountId: Long): SelectedMarketplaceAccount
}
