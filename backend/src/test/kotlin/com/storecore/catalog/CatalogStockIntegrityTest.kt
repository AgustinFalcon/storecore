package com.storecore.catalog

import com.storecore.catalog.infrastructure.JdbcCatalogService
import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.infrastructure.JdbcInventoryService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.util.UUID

@SpringBootTest(properties = ["storecore.installation-guard.enabled=false"])
@Transactional
class CatalogStockIntegrityTest @Autowired constructor(
    private val jdbc: JdbcTemplate,
    private val catalog: JdbcCatalogService,
    private val inventory: JdbcInventoryService,
) {
    companion object {
        private val postgres = org.testcontainers.containers.PostgreSQLContainer<Nothing>("postgres:16-alpine").apply { start() }
        @JvmStatic @org.springframework.test.context.DynamicPropertySource
        fun database(registry: org.springframework.test.context.DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
    @Test
    fun `catalog rejects stale absolute stock even with reason and preserves reservations`() {
        val sku = createProduct(8)
        val variantId = variantId(sku)
        val saga = UUID.randomUUID()
        val line = UUID.randomUUID()
        inventory.reserve(saga, line, variantId, 2, "WEB")

        val failure = assertThrows(CommerceValidation::class.java) { saveProduct(sku, 8, "Damaged during count") }
        assertEquals("CATALOG_STOCK_REQUIRES_ADJUSTMENT_COMMAND", failure.message)

        assertEquals(6, scalar("SELECT available_quantity FROM inventory_balances WHERE variant_id=?", variantId))
        assertEquals(2, scalar("SELECT reserved_quantity FROM inventory_balances WHERE variant_id=?", variantId))
        assertEquals(1, scalar("SELECT COUNT(*) FROM inventory_ledger WHERE variant_id=? AND event_type='ADJUSTMENT'", variantId))
        assertThrows(CommerceValidation::class.java) { catalog.saveProduct(sku,sku,"","","",emptyList(),listOf(mapOf("sku" to sku,"stockAdjustmentReason" to "reason only")),mapOf("base" to 10),true,1) }
    }

    @Test
    fun `catalog edit requires a reason for changed stock and does not allow negative available`() {
        val sku = createProduct(4)
        val variantId = variantId(sku)
        assertThrows(CommerceValidation::class.java) { saveProduct(sku, 3, null) }
        assertThrows(CommerceValidation::class.java) { inventory.setAvailableQuantity(variantId, -1, "USER:1", "correction") }
        assertEquals(4, scalar("SELECT available_quantity FROM inventory_balances WHERE variant_id=?", variantId))
        assertEquals(1, scalar("SELECT COUNT(*) FROM inventory_ledger WHERE variant_id=? AND event_type='ADJUSTMENT'", variantId))
    }

    @Test
    fun `public catalog quantity nets safety stock and admin quantity remains the balance`() {
        val sku = createProduct(8)
        val variantId = variantId(sku)
        jdbc.update("UPDATE inventory_balances SET safety_stock=3 WHERE variant_id=?", variantId)

        assertEquals(5L, catalog.product(sku)!!.variants.single().availableQuantity)
        assertEquals(8L, catalog.product(sku, admin = true)!!.variants.single().availableQuantity)
    }

    @Test
    fun `scheduled expiry releases reservations and records ledger`() {
        val sku = createProduct(5)
        val variantId = variantId(sku)
        val saga = UUID.randomUUID()
        val line = UUID.randomUUID()
        val reservationId = inventory.reserve(saga, line, variantId, 2, "WEB")
        jdbc.update("UPDATE inventory_reservations SET created_at=now()-interval '31 minutes',expires_at=now()-interval '1 second' WHERE id=?", reservationId)

        inventory.expireOverdue()

        assertEquals(5, scalar("SELECT available_quantity FROM inventory_balances WHERE variant_id=?", variantId))
        assertEquals(0, scalar("SELECT reserved_quantity FROM inventory_balances WHERE variant_id=?", variantId))
        assertEquals("EXPIRED", jdbc.queryForObject("SELECT status FROM inventory_reservations WHERE id=?", String::class.java, reservationId))
        assertEquals(1, scalar("SELECT COUNT(*) FROM inventory_ledger WHERE reservation_id=? AND event_type='RELEASE' AND actor='EXPIRY'", reservationId))
        assertNotNull(JdbcInventoryService::class.java.getMethod("expireOverdue").getAnnotation(Scheduled::class.java))
    }

    private fun createProduct(quantity: Int): String {
        val sku = "CAT-${UUID.randomUUID()}"
        saveProduct(sku, quantity, null)
        return sku
    }

    private fun saveProduct(sku: String, quantity: Int, reason: String?) {
        val variant = mutableMapOf<String, Any?>("sku" to sku, "name" to sku, "availableQuantity" to quantity)
        if (reason != null) variant["stockAdjustmentReason"] = reason
        catalog.saveProduct(
            sku = sku,
            name = sku,
            description = "Stock integrity fixture",
            brand = "Catalog test brand",
            category = "Catalog test category",
            images = emptyList(),
            variants = listOf(variant),
            price = mapOf("base" to BigDecimal("10.00")),
            active = true,
            actor = 1,
        )
    }

    private fun variantId(sku: String): Long = jdbc.queryForObject("SELECT id FROM product_variants WHERE sku=?", Long::class.java, sku)!!
    private fun scalar(sql: String, arg: Any): Int = jdbc.queryForObject(sql, Int::class.java, arg)!!
}
