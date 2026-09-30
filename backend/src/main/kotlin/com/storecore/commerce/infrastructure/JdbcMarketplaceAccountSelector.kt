package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.MercadoLibreAccountNotEligible
import com.storecore.commerce.application.port.MarketplaceAccountSelectorPort
import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.ChannelAccountState
import com.storecore.commerce.domain.MarketplaceChannel
import com.storecore.commerce.domain.SelectedMarketplaceAccount
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcMarketplaceAccountSelector(private val jdbc: JdbcTemplate) : MarketplaceAccountSelectorPort {
    override fun requireExternalMlSync(accountId: Long): SelectedMarketplaceAccount {
        val row = jdbc.query(
            """SELECT id, channel, state, purpose
               FROM channel_accounts
               WHERE id = ?""",
            { rs, _ ->
                SelectedMarketplaceAccount(
                    id = rs.getLong("id"),
                    purpose = ChannelAccountPurpose.fromWire(rs.getString("purpose")),
                    state = ChannelAccountState.fromWire(rs.getString("state")),
                    channel = MarketplaceChannel.fromWire(rs.getString("channel")),
                )
            },
            accountId,
        ).firstOrNull() ?: throw MercadoLibreAccountNotEligible()
        if (!row.channel.isMercadoLibre() || !row.state.isActive() || !row.purpose.allowsExternalMlSync()) {
            throw MercadoLibreAccountNotEligible()
        }
        return row
    }
}
