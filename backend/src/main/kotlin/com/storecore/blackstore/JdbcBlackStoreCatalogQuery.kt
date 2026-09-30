package com.storecore.blackstore

import com.storecore.blackstore.application.port.BlackStoreCatalogPort
import com.storecore.catalog.application.port.output.PriceQuotePort
import com.storecore.catalog.domain.CatalogCursorFormat
import com.storecore.catalog.infrastructure.VersionDigest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.stereotype.Component
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.security.SecureRandom
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.Base64
import java.util.UUID

@Component
class JdbcBlackStoreCatalogQuery(
    private val jdbc: JdbcTemplate,
    private val quotes: PriceQuotePort,
) : BlackStoreCatalogPort {
    override fun readPage(
        clientInstanceId: UUID,
        cursor: String?,
        pageSize: Int,
        includeCost: Boolean,
    ): BlackStoreCatalogPage {
        if (includeCost) throw BlackStoreSagaException.costForbidden()
        if (pageSize < 1 || pageSize > BlackStoreSagaPolicy.CATALOG_PAGE_MAX) throw BlackStoreSagaException.validation()
        quotes.shareRevision()
        val asOf = quotes.clock()
        val catalogVersion = quotes.catalogVersion(asOf).wire
        val visibility = visibilityDigest(clientInstanceId)
        return try {
        val decoded = decodeCursor(clientInstanceId, catalogVersion, cursor, pageSize, visibility)
        val afterId = decoded.afterId
        val rows = jdbc.query(
            """
            SELECT p.id AS product_id, p.name, p.base_price, p.status, p.updated_at,
                   v.id AS variant_id, v.sku, v.active, v.attributes,
                   GREATEST(0, COALESCE(i.available_quantity, 0) - COALESCE(i.safety_stock, 0)) AS sellable
            FROM product_variants v
            JOIN products p ON p.id = v.product_id
            LEFT JOIN inventory_balances i ON i.variant_id = v.id
            WHERE v.id > ? AND char_length(v.sku) BETWEEN 1 AND 64
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
            pageSize + 1,
        )
        val pageRows = rows.take(pageSize)
        val priced = quotes.quoteByVariantIds(asOf, pageRows.map { it.variantId })
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
        val currency = jdbc.query(
            "SELECT currency FROM installation_settings WHERE installation_id=1",
            { rs, _ -> rs.getString("currency") },
        ).firstOrNull() ?: "ARS"
        val items = pageRows.map { row ->
            BlackStoreCatalogItem(
                productId = row.productId,
                variantId = row.variantId,
                sku = row.sku,
                barcode = barcodeOf(row.attributes),
                name = row.name,
                images = imagesByProduct[row.productId].orEmpty(),
                unitPrice = priced[row.variantId]?.effectivePrice ?: row.basePrice,
                priceVersion = priced[row.variantId]?.priceVersion?.wire
                    ?: throw BlackStoreSagaException.validation("PRICE_QUOTE_MISSING"),
                currency = currency,
                availableQuantity = row.sellable,
                active = row.active,
            )
        }
        val contentDigest = digest64(
            listOf(catalogVersion) + items.flatMap { item ->
                listOf(item.variantId.toString(), item.sku, item.availableQuantity.toString(), item.priceVersion, item.unitPrice.toPlainString(), item.currency)
            },
        )
        val generatedAt = asOf
        val requestCursor = cursor.orEmpty()
        val bounds = mutableListOf(generatedAt.plus(Duration.ofDays(BlackStoreSagaPolicy.CATALOG_VALID_DAYS)))
        nextTemporalBorder(asOf)?.let(bounds::add)
        decoded.expiresAt?.let(bounds::add)
        val validUntil = bounds.minOrNull()!!
            inCatalogTx {
                advisoryLock("$clientInstanceId|$requestCursor|$pageSize|$visibility|$contentDigest")
                val reused = loadLiveSnapshot(clientInstanceId, requestCursor, pageSize, visibility, contentDigest)
                val next = reused?.nextCursor ?: if (rows.size > pageSize) {
                    encodeAndStore(clientInstanceId, catalogVersion, pageRows.last().variantId, pageSize, visibility, validUntil)
                } else {
                    null
                }
                val etag = reused?.etag ?: strongEtag(
                    catalogVersion,
                    requestCursor,
                    pageSize,
                    visibility,
                    contentDigest,
                    next,
                    reused?.generatedAt ?: generatedAt,
                    reused?.validUntil ?: validUntil,
                )
                persistQuotes(clientInstanceId, catalogVersion, priced.values, asOf)
                if (reused == null) {
                    persistSnapshot(
                        clientInstanceId,
                        requestCursor,
                        pageSize,
                        visibility,
                        contentDigest,
                        catalogVersion,
                        etag,
                        next,
                        items.size,
                        generatedAt,
                        validUntil,
                    )
                }
                BlackStoreCatalogPage(
                    catalogVersion = catalogVersion,
                    generatedAt = reused?.generatedAt ?: generatedAt,
                    validUntil = reused?.validUntil ?: validUntil,
                    etag = etag,
                    nextCursor = next,
                    items = items,
                )
            }
        } finally {
            lazyDeleteExpired(clientInstanceId)
        }
    }

    override fun readStock(clientInstanceId: UUID, variantId: Long): BlackStoreVariantStock {
        return try {
            val row = jdbc.query(
                """
                SELECT v.id, v.sku, GREATEST(0, COALESCE(i.available_quantity, 0) - COALESCE(i.safety_stock, 0)) AS sellable
                FROM product_variants v
                LEFT JOIN inventory_balances i ON i.variant_id = v.id
                WHERE v.id=? AND char_length(v.sku) BETWEEN 1 AND 64
                """.trimIndent(),
                { rs, _ -> Triple(rs.getLong("id"), rs.getString("sku"), rs.getInt("sellable")) },
                variantId,
            ).singleOrNull() ?: throw BlackStoreSagaException.notFound()
            BlackStoreVariantStock(
                variantId = row.first,
                sku = row.second,
                availableQuantity = row.third,
                catalogVersion = currentCatalogVersion(),
            )
        } finally {
            lazyDeleteExpired(clientInstanceId)
        }
    }

    fun currentCatalogVersion(): String {
        quotes.shareRevision()
        return quotes.catalogVersion(quotes.clock()).wire
    }

    private fun decodeCursor(
        clientInstanceId: UUID,
        catalogVersion: String,
        cursor: String?,
        pageSize: Int,
        visibility: String,
    ): DecodedCursor {
        if (cursor.isNullOrBlank()) return DecodedCursor(0L, null)
        val stored = jdbc.query(
            """
            SELECT catalog_version, expires_at, last_variant_id, page_size, visibility_digest, format_version
            FROM blackstore_catalog_cursors
            WHERE cursor_token=? AND client_instance_id=?
            """.trimIndent(),
            { rs, _ ->
                CursorRow(
                    catalogVersion = rs.getString("catalog_version"),
                    expiresAt = rs.getTimestamp("expires_at").toInstant(),
                    lastVariantId = rs.getLong("last_variant_id").let { if (rs.wasNull()) null else it },
                    pageSize = rs.getInt("page_size").let { if (rs.wasNull()) null else it },
                    visibility = rs.getString("visibility_digest"),
                    format = CatalogCursorFormat.fromWire(rs.getString("format_version")),
                )
            },
            cursor,
            clientInstanceId,
        ).singleOrNull() ?: throw BlackStoreSagaException.cursorExpired()
        if (stored.format !is CatalogCursorFormat.C1 || stored.lastVariantId == null) throw BlackStoreSagaException.cursorExpired()
        if (!stored.expiresAt.isAfter(Instant.now())) throw BlackStoreSagaException.cursorExpired()
        if (stored.catalogVersion != catalogVersion || stored.pageSize != pageSize || stored.visibility?.trim() != visibility) {
            throw BlackStoreSagaException.cursorExpired()
        }
        return DecodedCursor(stored.lastVariantId, stored.expiresAt)
    }

    private fun encodeAndStore(
        clientInstanceId: UUID,
        catalogVersion: String,
        lastVariantId: Long,
        pageSize: Int,
        visibility: String,
        expiresAt: Instant,
    ): String {
        val token = opaqueToken()
        jdbc.update(
            """
            INSERT INTO blackstore_catalog_cursors(
              client_instance_id, catalog_version, cursor_token, expires_at,
              last_variant_id, page_size, visibility_digest, format_version, issued_at
            ) VALUES (?,?,?,?,?,?,?,?,clock_timestamp())
            """.trimIndent(),
            clientInstanceId,
            catalogVersion,
            token,
            Timestamp.from(expiresAt),
            lastVariantId,
            pageSize,
            visibility,
            CatalogCursorFormat.C1.wire,
        )
        return token
    }

    private fun persistQuotes(
        clientInstanceId: UUID,
        catalogVersion: String,
        quotes: Collection<com.storecore.catalog.domain.PriceQuote>,
        asOf: Instant,
    ) {
        val expires = Timestamp.from(asOf.plus(Duration.ofDays(BlackStoreSagaPolicy.CATALOG_VALID_DAYS)))
        quotes.forEach { quote ->
            jdbc.update(
                """
                INSERT INTO blackstore_price_quotes(
                  client_instance_id, variant_id, price_version, catalog_version, unit_price, currency, issued_at, expires_at
                ) VALUES (?,?,?,?,?,?,?,?)
                ON CONFLICT (client_instance_id, variant_id, price_version) DO NOTHING
                """.trimIndent(),
                clientInstanceId,
                quote.variantId,
                quote.priceVersion.wire,
                catalogVersion,
                quote.effectivePrice,
                quote.currency,
                Timestamp.from(asOf),
                expires,
            )
        }
    }

    private fun loadLiveSnapshot(
        clientInstanceId: UUID,
        requestCursor: String,
        pageSize: Int,
        visibility: String,
        contentDigest: String,
    ): SnapshotRow? =
        jdbc.query(
            """
            SELECT catalog_version, etag, next_cursor, generated_at, valid_until
              FROM blackstore_catalog_page_snapshots
             WHERE client_instance_id=? AND request_cursor=? AND page_size=? AND visibility_digest=?
               AND content_digest=? AND valid_until > clock_timestamp()
             ORDER BY generation DESC
             LIMIT 1
            """.trimIndent(),
            { rs, _ ->
                SnapshotRow(
                    catalogVersion = rs.getString("catalog_version"),
                    etag = rs.getString("etag"),
                    nextCursor = rs.getString("next_cursor"),
                    generatedAt = rs.getTimestamp("generated_at").toInstant(),
                    validUntil = rs.getTimestamp("valid_until").toInstant(),
                )
            },
            clientInstanceId,
            requestCursor,
            pageSize,
            visibility,
            contentDigest,
        ).singleOrNull()

    private fun persistSnapshot(
        clientInstanceId: UUID,
        requestCursor: String,
        pageSize: Int,
        visibility: String,
        contentDigest: String,
        catalogVersion: String,
        etag: String,
        nextCursor: String?,
        itemCount: Int,
        generatedAt: Instant,
        validUntil: Instant,
    ) {
        val generation = (jdbc.queryForObject(
            """
            SELECT COALESCE(MAX(generation), 0) FROM blackstore_catalog_page_snapshots
             WHERE client_instance_id=? AND request_cursor=? AND page_size=? AND visibility_digest=? AND content_digest=?
            """.trimIndent(),
            Int::class.java,
            clientInstanceId,
            requestCursor,
            pageSize,
            visibility,
            contentDigest,
        ) ?: 0) + 1
        if (generation > 3) return
        jdbc.update(
            """
            INSERT INTO blackstore_catalog_page_snapshots(
              client_instance_id, request_cursor, page_size, visibility_digest, content_digest, generation,
              catalog_version, etag, next_cursor, body, generated_at, valid_until
            ) VALUES (?,?,?,?,?,?,?,?,?, jsonb_build_object('catalogVersion', ?::text, 'itemCount', ?::int), ?, ?)
            """.trimIndent(),
            clientInstanceId,
            requestCursor,
            pageSize,
            visibility,
            contentDigest,
            generation,
            catalogVersion,
            etag,
            nextCursor,
            catalogVersion,
            itemCount,
            Timestamp.from(generatedAt),
            Timestamp.from(validUntil),
        )
    }

    private fun lazyDeleteExpired(clientInstanceId: UUID) {
        jdbc.update("DELETE FROM blackstore_catalog_page_snapshots WHERE client_instance_id=? AND valid_until <= clock_timestamp()", clientInstanceId)
        jdbc.update("DELETE FROM blackstore_price_quotes WHERE client_instance_id=? AND expires_at <= clock_timestamp()", clientInstanceId)
    }

    private fun visibilityDigest(clientInstanceId: UUID): String =
        digest64(listOf(clientInstanceId.toString(), "catalog:read"))

    private fun digest64(parts: List<String>): String =
        VersionDigest.sha256Url(parts).padEnd(64, '0').take(64)

    private fun strongEtag(
        catalogVersion: String,
        requestCursor: String,
        pageSize: Int,
        visibility: String,
        contentDigest: String,
        nextCursor: String?,
        generatedAt: Instant,
        validUntil: Instant,
    ): String =
        "\"e1_" + VersionDigest.sha256Url(
            listOf(
                catalogVersion,
                requestCursor,
                pageSize.toString(),
                visibility,
                contentDigest,
                nextCursor.orEmpty(),
                generatedAt.toString(),
                validUntil.toString(),
            ),
        ) + "\""

    private fun nextTemporalBorder(asOf: Instant): Instant? =
        jdbc.query(
            """
            SELECT MIN(ts) FROM (
              SELECT starts_at AS ts FROM offers WHERE starts_at > ?
              UNION ALL
              SELECT ends_at FROM offers WHERE ends_at > ?
            ) borders
            """.trimIndent(),
            { rs, _ -> rs.getTimestamp(1)?.toInstant() },
            Timestamp.from(asOf),
            Timestamp.from(asOf),
        ).firstOrNull()

    private fun <T> inCatalogTx(block: () -> T): T {
        val template = TransactionTemplate(DataSourceTransactionManager(jdbc.dataSource!!))
        return template.execute { block() }!!
    }

    private fun advisoryLock(key: String) {
        jdbc.execute("SELECT pg_advisory_xact_lock(('x'||substr(md5(?),1,16))::bit(64)::bigint)") { statement ->
            statement.setString(1, key)
            statement.execute()
        }
    }

    private fun opaqueToken(): String {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private data class CursorRow(
        val catalogVersion: String,
        val expiresAt: Instant,
        val lastVariantId: Long?,
        val pageSize: Int?,
        val visibility: String?,
        val format: CatalogCursorFormat,
    )

    private data class DecodedCursor(
        val afterId: Long,
        val expiresAt: Instant?,
    )

    private data class SnapshotRow(
        val catalogVersion: String,
        val etag: String,
        val nextCursor: String?,
        val generatedAt: Instant,
        val validUntil: Instant,
    )

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
