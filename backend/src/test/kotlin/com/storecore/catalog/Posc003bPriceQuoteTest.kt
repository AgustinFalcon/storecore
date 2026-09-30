package com.storecore.catalog

import com.storecore.catalog.domain.CatalogVersion
import com.storecore.catalog.domain.PriceVersion
import com.storecore.catalog.infrastructure.JdbcPriceQuoteAdapter
import com.storecore.commerce.infrastructure.JdbcEffectivePriceQueryAdapter
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.math.BigDecimal
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Posc003bPriceQuoteTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var quotes: JdbcPriceQuoteAdapter
    private lateinit var storefront: JdbcEffectivePriceQueryAdapter

    @BeforeAll
    fun start() {
        postgres.start()
        Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        jdbc = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
        quotes = JdbcPriceQuoteAdapter(jdbc)
        storefront = JdbcEffectivePriceQueryAdapter(quotes)
        jdbc.update("INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Test', 'localhost', 'ARS') ON CONFLICT DO NOTHING")
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('B', 'b-003b')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('C', 'c-003b')")
        jdbc.update(
            "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('003b@example.com', '\$argon2id\$fixture', 'Q', 'A')",
        )
    }

    @Test
    fun storefrontAndPosShareHalfOpenOfferAndVersions() {
        val sku = "SKU-003B-${UUID.randomUUID()}"
        val productId = jdbc.queryForObject(
            "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, ?, ?, 100, 'ACTIVE') RETURNING id",
            Long::class.java,
            sku,
            sku.lowercase(),
        )!!
        val variantId = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id, sku, label) VALUES (?, ?, 'Default') RETURNING id",
            Long::class.java,
            productId,
            sku,
        )!!
        val userId = jdbc.queryForObject("SELECT id FROM users WHERE email='003b@example.com'", Long::class.java)!!
        val now = quotes.clock()
        val start = now.minusSeconds(3600)
        val end = now.plusSeconds(3600)
        val offerId = jdbc.queryForObject(
            """INSERT INTO offers(name,status,priority,starts_at,ends_at,discount_type,discount_value,min_margin_percent,created_by,approved_by,approved_at)
               VALUES ('HH','ACTIVE',5,?,?, 'PERCENT',20,0,?,?,?) RETURNING id""",
            Long::class.java,
            Timestamp.from(start),
            Timestamp.from(end),
            userId,
            userId,
            Timestamp.from(start),
        )!!
        jdbc.update("INSERT INTO offer_products(offer_id,product_id) VALUES (?,?)", offerId, productId)

        val inside = now
        val pos = quotes.quoteByVariantIds(inside, listOf(variantId)).getValue(variantId)
        val web = quotes.quoteBySkus(inside, listOf(sku)).getValue(sku)
        assertEquals(0, BigDecimal("80.00").compareTo(pos.effectivePrice))
        assertEquals(pos.effectivePrice, web.effectivePrice)
        assertEquals(pos.priceVersion.wire, web.priceVersion.wire)
        assertTrue(pos.priceVersion is PriceVersion.Quoted)
        assertEquals(46, pos.priceVersion.wire.length)
        val storefrontMap = storefront.findBySkus(listOf(sku))
        assertEquals(0, BigDecimal("80.00").compareTo(storefrontMap.getValue(sku).effectivePrice))

        val atEnd = quotes.quoteByVariantIds(end, listOf(variantId)).getValue(variantId)
        assertEquals(0, BigDecimal("100.00").compareTo(atEnd.effectivePrice))
        assertNull(atEnd.offerId)
        assertTrue(atEnd.priceVersion.wire != pos.priceVersion.wire)

        quotes.shareRevision()
        val version = quotes.catalogVersion(inside)
        assertTrue(version is CatalogVersion.Current)
        assertEquals(46, version.wire.length)
        val later = quotes.catalogVersion(end)
        assertTrue(later.wire != version.wire)
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @AfterAll
        fun stop() = postgres.stop()
    }
}
