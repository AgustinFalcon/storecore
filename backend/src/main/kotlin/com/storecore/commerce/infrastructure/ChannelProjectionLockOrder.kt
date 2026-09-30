package com.storecore.commerce.infrastructure

import org.springframework.jdbc.core.JdbcTemplate

/**
 * Shared lock order for listing lifecycle and mapping so they serialize with inventory callers:
 * snapshot (FOR SHARE via marketplace_ml_sync_snapshot), accounts, products, variants, balances,
 * listings (all ASC). Callers that omit orders/attempts/reservations skip those steps and never
 * take listings before products/variants/balances.
 */
class ChannelProjectionLockOrder(private val jdbc: JdbcTemplate) {
    /**
     * @param accountId listing account, locked before products
     * @param variantIds candidates (remap passes previous and next); distinct+sorted
     */
    fun lock(accountId: Long, variantIds: Collection<Long>) {
        jdbc.queryForObject("SELECT public.marketplace_ml_sync_snapshot()::text", String::class.java)
        jdbc.query("SELECT id FROM channel_accounts WHERE id=? FOR UPDATE", { rs, _ -> rs.getLong(1) }, accountId)
        val variants = variantIds.distinct().sorted()
        if (variants.isEmpty()) return
        val placeholders = variants.joinToString(",") { "?" }
        val products = jdbc.query(
            "SELECT DISTINCT product_id FROM product_variants WHERE id IN ($placeholders) ORDER BY 1",
            { rs, _ -> rs.getLong(1) },
            *variants.toTypedArray(),
        )
        lockIds("products", products)
        lockIds("product_variants", variants)
        variants.forEach { variantId ->
            jdbc.update("INSERT INTO inventory_balances(variant_id) VALUES (?) ON CONFLICT (variant_id) DO NOTHING", variantId)
            jdbc.query(
                "SELECT variant_id FROM inventory_balances WHERE variant_id=? FOR UPDATE",
                { rs, _ -> rs.getLong(1) },
                variantId,
            )
        }
        jdbc.query(
            "SELECT id FROM channel_listings WHERE variant_id IN ($placeholders) ORDER BY id FOR UPDATE",
            { rs, _ -> rs.getLong(1) },
            *variants.toTypedArray(),
        )
    }

    /** Table names are compile-time literals (`products`, `product_variants`), never caller input. */
    private fun lockIds(table: String, ids: Collection<Long>) {
        val sorted = ids.distinct().sorted()
        if (sorted.isEmpty()) return
        val placeholders = sorted.joinToString(",") { "?" }
        jdbc.query(
            "SELECT id FROM $table WHERE id IN ($placeholders) ORDER BY id FOR UPDATE",
            { rs, _ -> rs.getLong(1) },
            *sorted.toTypedArray(),
        )
    }
}
