package com.storecore.catalog

import com.storecore.catalog.infrastructure.JdbcCatalogService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.annotation.Transactional
import org.testcontainers.containers.PostgreSQLContainer
import java.math.BigDecimal
import java.util.UUID

@SpringBootTest(properties = ["storecore.installation-guard.enabled=false"])
@Transactional
class CatalogEffectiveOfferTest @Autowired constructor(
    private val jdbc: JdbcTemplate,
    private val catalog: JdbcCatalogService,
) {
    @Test
    fun `public catalog and product use the active offer window and hide an ended one`() {
        val userId = jdbc.queryForObject(
            "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('offer-admin@example.com', '\$argon2id\$fixture', 'Offer', 'Admin') RETURNING id",
            Long::class.java,
        )!!
        val sku = "OFF-${UUID.randomUUID()}"
        catalog.saveProduct(
            sku = sku,
            name = sku,
            description = "Offer fixture",
            brand = "Offer brand",
            category = "Offer category",
            images = listOf("https://cdn.example.test/$sku.jpg"),
            variants = listOf(mapOf("sku" to sku, "name" to sku, "availableQuantity" to 4)),
            price = mapOf("base" to BigDecimal("100.00")),
            active = true,
            actor = 1,
        )
        val productId = jdbc.queryForObject("SELECT product_id FROM product_variants WHERE sku=?", Long::class.java, sku)!!
        val liveId =
            jdbc.queryForObject(
                """INSERT INTO offers(name,status,priority,starts_at,ends_at,discount_type,discount_value,min_margin_percent,created_by,approved_by,approved_at)
                   VALUES ('Happy hour','ACTIVE',5,now()-interval '1 hour',now()+interval '2 hours','PERCENT',20,0,?,?,now())
                   RETURNING id""",
                Long::class.java,
                userId,
                userId,
            )!!
        jdbc.update("INSERT INTO offer_products(offer_id,product_id) VALUES (?,?)", liveId, productId)

        val window = jdbc.queryForMap("SELECT starts_at, ends_at FROM offers WHERE id=?", liveId)
        val validFrom = (window["starts_at"] as java.sql.Timestamp).toInstant()
        val validUntil = (window["ends_at"] as java.sql.Timestamp).toInstant()

        val card = catalog.search(sku, null, null, true).single()
        val price = card["price"] as Map<*, *>
        assertMoney("100.00", price["base"])
        assertMoney("80.00", price["effective"])
        assertMoney("100.00", card["originalPrice"])
        assertEquals(liveId.toString(), card["offerRef"])
        assertEquals(validFrom, card["validFrom"])
        assertEquals(validUntil, card["validUntil"])
        assertEquals("https://cdn.example.test/$sku.jpg", card["imageUrl"])

        val detail = catalog.product(sku)!!
        assertMoney("80.00", detail.price["effective"])
        assertMoney("100.00", detail.price["base"])
        assertEquals(liveId.toString(), detail.offerRef)
        assertEquals(validFrom, detail.validFrom)
        assertEquals(validUntil, detail.validUntil)

        jdbc.update("UPDATE offers SET status='ENDED',ends_at=now()-interval '1 minute' WHERE id=?", liveId)
        assertEquals(true, catalog.search(sku, null, null, true).isEmpty())
        val closedCard = catalog.search(sku, null, null, false).single()
        assertNull(closedCard["offerRef"])
        assertNull(closedCard["validFrom"])
        assertNull(closedCard["validUntil"])
        val after = catalog.product(sku)!!
        assertMoney("100.00", after.price["effective"])
        assertNull(after.offerRef)
        assertNull(after.validFrom)
        assertNull(after.validUntil)
    }

    private fun assertMoney(expected: String, actual: Any?) {
        assertEquals(0, BigDecimal(expected).compareTo(actual as BigDecimal), "expected $expected but was $actual")
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @DynamicPropertySource
        fun database(registry: DynamicPropertyRegistry) {
            postgres.start()
            registry.add("spring.datasource.url") { postgres.jdbcUrl }
            registry.add("spring.datasource.username") { postgres.username }
            registry.add("spring.datasource.password") { postgres.password }
        }
    }
}
