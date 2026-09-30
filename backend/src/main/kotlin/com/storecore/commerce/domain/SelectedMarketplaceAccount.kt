package com.storecore.commerce.domain

data class SelectedMarketplaceAccount(
    val id: Long,
    val purpose: ChannelAccountPurpose,
    val state: ChannelAccountState,
    val channel: MarketplaceChannel,
)
