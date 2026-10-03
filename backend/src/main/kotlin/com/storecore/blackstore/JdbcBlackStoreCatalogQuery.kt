package com.storecore.blackstore

import com.storecore.blackstore.application.port.BlackStoreCatalogPort
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import java.math.BigDecimal
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID

@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcBlackStoreCatalogQuery(private val jdbc: JdbcTemplate) : BlackStoreCatalogPort {
    override fun readPage(
        clientInstanceId: UUID,
        cursor: String?,
        pageSize: Int,
        includeCost: Boolean,
    ): BlackStoreCatalogPage {
        if (includeCost) throw BlackStoreSagaException.costForbidden()
        val size = pageSize.coerceIn(1, BlackStoreSagaPolicy.CATALOG_PAGE_MAX)
        val catalogVersion = currentCatalogVersion()
        val afterId = decodeCursor(clientInstanceId, catalogVersion, cursor)
        val rows = jdbc.query(
            """
            SELECT p.id AS product_id, p.name, p.base_price, p.status, p.updated_at,
                   v.id AS variant_id, v.sku, v.active, v.attributes,
                   GREATEST(0, COALESCE(i.available_quantity, 0) - COALESCE(i.safety_stock, 0)) AS sellable
            FROM product_variants v
            JOIN products p ON p.id = v.product_id
            LEFT JOIN inventory_balances i ON i.variant_id = v.id
            WHERE v.id > ?
            ORDER BY v.id
            LIMIT ?
            """.trimIndent(),
            { rs, _ ->
                CatalogRow(
                    productId = rs.getLong("product_id"),
                    name = rs.getString("name"),
                    basePrice = rs.getBigDecimal("base_price"),
                    status = rs.getString("status"),
                    variantId = rs.getLong("variant_id"),
                    sku = rs.getString("sku"),
                    active = rs.getBoolean("active") && rs.getString("status") == "ACTIVE",
                    attributes = rs.getString("attributes"),
                    sellable = rs.getInt("sellable"),
                )
            },
            afterId,
            size + 1,
        )
        val pageRows = rows.take(size)
        val next = rows.getOrNull(size)?.let { encodeAndStore(clientInstanceId, catalogVersion, pageRows.last().variantId) }
        val generatedAt = Instant.now()
        val imagesByProduct = if (pageRows.isEmpty()) {
            emptyMap()
        } else {
            val ids = pageRows.map { it.productId }.distinct()
            val placeholders = ids.joinToString(",") { "?" }
            val grouped = mutableMapOf<Long, MutableList<String>>()
            jdbc.query(
                "SELECT product_id, url FROM product_images WHERE product_id IN ($placeholders) ORDER BY sort_order, id",
                { rs, _ -> grouped.getOrPut(rs.getLong("product_id")) { mutableListOf() }.add(rs.getString("url")) },
                *ids.toTypedArray(),
            )
            grouped
        }
        val currency = jdbc.queryForObject("SELECT currency FROM installation_settings WHERE installation_id=1", String::class.java)
            ?: throw BlackStoreSagaException.validation("INSTALLATION_CURRENCY_MISSING")
        return BlackStoreCatalogPage(
            catalogVersion = catalogVersion,
            generatedAt = generatedAt,
            validUntil = generatedAt.plus(Duration.ofDays(BlackStoreSagaPolicy.CATALOG_VALID_DAYS)),
            etag = catalogVersion.take(64),
            nextCursor = next,
            items = pageRows.map { row ->
                BlackStoreCatalogItem(
                    productId = row.productId,
                    variantId = row.variantId,
                    sku = row.sku,
                    barcode = barcodeOf(row.attributes),
                    name = row.name,
                    images = imagesByProduct[row.productId].orEmpty(),
                    unitPrice = row.basePrice,
                    priceVersion = "catalog-${row.productId}",
                    currency = currency,
                    availableQuantity = row.sellable,
                    active = row.active,
                )
            },
        )
    }

    override fun readStock(variantId: Long): BlackStoreVariantStock {
        val row = jdbc.query(
            """
            SELECT v.id, v.sku, GREATEST(0, COALESCE(i.available_quantity, 0) - COALESCE(i.safety_stock, 0)) AS sellable
            FROM product_variants v
            LEFT JOIN inventory_balances i ON i.variant_id = v.id
            WHERE v.id=?
            """.trimIndent(),
            { rs, _ -> Triple(rs.getLong("id"), rs.getString("sku"), rs.getInt("sellable")) },
            variantId,
        ).singleOrNull() ?: throw BlackStoreSagaException.notFound()
        return BlackStoreVariantStock(
            variantId = row.first,
            sku = row.second,
            availableQuantity = row.third,
            catalogVersion = currentCatalogVersion(),
        )
    }

    fun currentCatalogVersion(): String =
        jdbc.queryForObject("SELECT COALESCE(MAX(updated_at)::text, 'empty') FROM products", String::class.java)!!

    private fun decodeCursor(clientInstanceId: UUID, catalogVersion: String, cursor: String?): Long {
        if (cursor.isNullOrBlank()) return 0L
        val stored = jdbc.query(
            """
            SELECT catalog_version, expires_at
            FROM blackstore_catalog_cursors
            WHERE cursor_token=? AND client_instance_id=?
            """.trimIndent(),
            { rs, _ -> rs.getString("catalog_version") to rs.getTimestamp("expires_at").toInstant() },
            cursor,
            clientInstanceId,
        ).singleOrNull() ?: throw BlackStoreSagaException.cursorExpired()
        if (!stored.second.isAfter(Instant.now()) || stored.first != catalogVersion) throw BlackStoreSagaException.cursorExpired()
        val variantPart = cursor.substringBefore('.')
        return variantPart.toLongOrNull() ?: throw BlackStoreSagaException.cursorExpired()
    }

    private fun encodeAndStore(clientInstanceId: UUID, catalogVersion: String, lastVariantId: Long): String {
        val token = "$lastVariantId.${BlackStoreSagaPolicy.uuidV5(BlackStoreSagaPolicy.OPERATION_NAMESPACE, "cursor:$clientInstanceId:$catalogVersion:$lastVariantId")}"
        val expiresAt = Instant.now().plus(Duration.ofDays(BlackStoreSagaPolicy.CATALOG_VALID_DAYS))
        jdbc.update(
            """
            INSERT INTO blackstore_catalog_cursors(client_instance_id, catalog_version, cursor_token, expires_at)
            VALUES (?,?,?,?)
            ON CONFLICT (cursor_token) DO UPDATE
              SET catalog_version = EXCLUDED.catalog_version, expires_at = EXCLUDED.expires_at
            """.trimIndent(),
            clientInstanceId,
            catalogVersion,
            token,
            Timestamp.from(expiresAt),
        )
        return token
    }

    private fun barcodeOf(attributesJson: String?): String? {
        if (attributesJson.isNullOrBlank() || !attributesJson.contains("barcode")) return null
        val match = Regex(""""barcode"\s*:\s*"([^"]+)"""").find(attributesJson)
        return match?.groupValues?.get(1)
    }

    private data class CatalogRow(
        val productId: Long,
        val name: String,
        val basePrice: BigDecimal,
        val status: String,
        val variantId: Long,
        val sku: String,
        val active: Boolean,
        val attributes: String?,
        val sellable: Int,
    )
}
