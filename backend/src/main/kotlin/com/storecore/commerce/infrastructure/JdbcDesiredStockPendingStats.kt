package com.storecore.commerce.infrastructure

import com.storecore.commerce.domain.ChannelOutboxKind
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component

data class DesiredStockPendingStats(
    val withheldSnapshots: Long,
    val pendingDeliveries: Long,
    val oldestPendingAgeSeconds: Long?,
)

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcDesiredStockPendingStats(private val jdbc: JdbcTemplate) {
    fun snapshot(): DesiredStockPendingStats {
        val withheld = jdbc.queryForObject(
            "SELECT COUNT(*) FROM channel_listing_stock_projection WHERE projection_state='WITHHELD'",
            Long::class.java,
        ) ?: 0L
        val pending = jdbc.queryForObject(
            """
            SELECT COUNT(*) FROM channel_outbox_delivery d
            JOIN channel_outbox o ON o.id = d.outbox_id
            WHERE o.kind=? AND d.status='PENDING'
            """.trimIndent(),
            Long::class.java,
            ChannelOutboxKind.StockDesiredChanged.wire,
        ) ?: 0L
        val age = jdbc.query(
            """
            SELECT EXTRACT(EPOCH FROM (clock_timestamp() - MIN(d.available_at)))::bigint
            FROM channel_outbox_delivery d
            JOIN channel_outbox o ON o.id = d.outbox_id
            WHERE o.kind=? AND d.status='PENDING'
            """.trimIndent(),
            { rs, _ -> if (rs.getObject(1) == null) null else rs.getLong(1) },
            ChannelOutboxKind.StockDesiredChanged.wire,
        ).firstOrNull()
        return DesiredStockPendingStats(withheld, pending, age)
    }
}
