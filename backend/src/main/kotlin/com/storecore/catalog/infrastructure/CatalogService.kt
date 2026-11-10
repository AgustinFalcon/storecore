package com.storecore.catalog.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.catalog.application.port.input.CatalogSearchResult
import com.storecore.catalog.application.port.output.CatalogQueryPort
import com.storecore.commerce.infrastructure.JdbcInventoryService
import com.storecore.commerce.application.CommerceValidation
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.math.BigDecimal
import javax.sql.DataSource

data class CatalogFacet(val id: Long, val name: String)

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcCatalogService(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper, private val inventory: JdbcInventoryService, private val projections: JdbcCatalogProjectionReader) : CatalogQueryPort {
    override fun searchActive(query: String): List<CatalogSearchResult> = jdbc.query("""SELECT v.sku,p.name FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='ACTIVE' AND v.active AND (lower(p.name) LIKE lower(?) OR lower(v.sku) LIKE lower(?) OR lower(coalesce(b.name,'')) LIKE lower(?) OR lower(coalesce(c.name,'')) LIKE lower(?)) ORDER BY p.name,p.id,v.id LIMIT 100""", { rs, _ -> CatalogSearchResult(com.storecore.catalog.domain.ProductSku(rs.getString("sku")), rs.getString("name")) }, "%$query%", "%$query%", "%$query%", "%$query%")
    fun facets(kind: String): List<CatalogFacet> = jdbc.query("SELECT id,name FROM ${if (kind == "brands") "brands" else "categories"} WHERE active ORDER BY name,id LIMIT 100", { rs, _ -> CatalogFacet(rs.getLong("id"), rs.getString("name")) })
    fun search(query: String, brand: Long?, category: Long?, offers: Boolean, page: Int = 0, size: Int = 50) = projections.list(false, query, brand, category, offers, page, size)
    fun product(sku: String, admin: Boolean = false) = projections.product(sku, admin)
    fun adminList(page: Int = 0, size: Int = 50) = projections.list(true, page = page, size = size)
    fun saveProduct(sku: String, name: String, description: String, brand: String, category: String, images: List<String>, variants: List<Map<String, Any?>>, price: Map<String, Any?>, active: Boolean?, actor: Long, status: String? = null): com.storecore.catalog.domain.CatalogProduct {
        val productStatus = if (status == null) {
            if (active ?: true) com.storecore.catalog.domain.ProductStatus.ACTIVE else com.storecore.catalog.domain.ProductStatus.DRAFT
        } else com.storecore.catalog.domain.ProductStatus.fromWire(status)
        if (productStatus == com.storecore.catalog.domain.ProductStatus.UNKNOWN) throw CommerceValidation("CATALOG_PRODUCT_STATUS_INVALID")
        if (status != null && active != null && active != productStatus.active) throw CommerceValidation("CATALOG_PRODUCT_STATUS_CONFLICT")
        val variantStates = variants.map { variant ->
            val legacyActive = variant["active"] as? Boolean
            if (variant["active"] != null && legacyActive == null) throw CommerceValidation("CATALOG_VARIANT_STATUS_INVALID")
            val variantStatus = com.storecore.catalog.domain.VariantStatus.fromWire(if (variant.containsKey("status")) variant["status"] as? String else legacyActive ?: true)
            if (variantStatus == com.storecore.catalog.domain.VariantStatus.UNKNOWN) throw CommerceValidation("CATALOG_VARIANT_STATUS_INVALID")
            if (variant.containsKey("status") && legacyActive != null && legacyActive != variantStatus.active) throw CommerceValidation("CATALOG_VARIANT_STATUS_CONFLICT")
            variantStatus
        }
        val primaryEntry = variants.withIndex().firstOrNull { (index, variant) -> (variant["sku"]?.toString()?.takeIf { it.isNotBlank() } ?: if (index == 0) sku else null) == sku }
        val primaryActive = primaryEntry?.let { variantStates[it.index].active } ?: (active ?: true)
        val brandId = named("brands", brand); val categoryId = named("categories", category)
        val base = number(price["base"]) ?: number(price["effective"]) ?: BigDecimal.ZERO
        val existing = jdbc.query("SELECT p.id,v.id variant_id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.sku=?", { rs, _ -> rs.getLong("id") to rs.getLong("variant_id") }, sku).firstOrNull()
        val productId: Long; val variantId: Long
        if (existing == null) {
            productId = jdbc.queryForObject("INSERT INTO products(brand_id,category_id,name,slug,description,base_price,status) VALUES (?,?,?,?,?,?,?) RETURNING id", Long::class.java, brandId, categoryId, name, slug(sku), description, base, productStatus.name)!!
            variantId = jdbc.queryForObject("INSERT INTO product_variants(product_id,sku,label,active) VALUES (?,?,?,?) RETURNING id", Long::class.java, productId, sku, name, primaryActive)!!
        } else {
            productId = existing.first; variantId = existing.second
            jdbc.update("UPDATE products SET brand_id=?,category_id=?,name=?,description=?,base_price=?,status=?,updated_at=now() WHERE id=?", brandId, categoryId, name, description, base, productStatus.name, productId)
        }
        // The product UPDATE above owns the parent lock. Lock every existing child
        // before changing variants, then acquire inventory balances only afterwards.
        jdbc.query("SELECT id FROM product_variants WHERE product_id=? ORDER BY id", { rs, _ -> rs.getLong(1) }, productId).forEach { id ->
            jdbc.query("SELECT id FROM product_variants WHERE id=? FOR NO KEY UPDATE", { rs, _ -> rs.getLong(1) }, id)
        }
        if (existing != null && primaryEntry == null) jdbc.update("UPDATE product_variants SET label=?,active=?,updated_at=now() WHERE id=?", name, active ?: true, variantId)
        jdbc.update("DELETE FROM product_images WHERE product_id=?", productId)
        images.filter { it.startsWith("https://") }.forEachIndexed { index, url -> jdbc.update("INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES (?,?,?,?)", productId, url, index, index == 0) }
        val stockChanges = mutableListOf<Triple<Long, Int, String?>>()
        variants.forEachIndexed { index, variant ->
            val variantActive = variantStates[index].active
            val variantSku = variant["sku"]?.toString()?.takeIf { it.isNotBlank() } ?: if (index == 0) sku else return@forEachIndexed
            val (targetVariantId, createdVariant) = if (variantSku == sku) {
                jdbc.update("UPDATE product_variants SET label=?,active=?,updated_at=now() WHERE id=?", variant["name"]?.toString() ?: variantSku, variantActive, variantId)
                variantId to (existing == null)
            } else {
                val existingVariant = jdbc.query("SELECT id,product_id FROM product_variants WHERE sku=?", { rs, _ -> rs.getLong("id") to rs.getLong("product_id") }, variantSku).firstOrNull()
                if (existingVariant != null && existingVariant.second != productId) throw CommerceValidation("CATALOG_VARIANT_SKU_ALREADY_BELONGS_TO_ANOTHER_PRODUCT")
                if (existingVariant == null) {
                    jdbc.queryForObject("INSERT INTO product_variants(product_id,sku,label,active) VALUES (?,?,?,?) RETURNING id", Long::class.java, productId, variantSku, variant["name"]?.toString() ?: variantSku, variantActive)!! to true
                } else {
                    jdbc.update("UPDATE product_variants SET label=?,active=?,updated_at=now() WHERE id=?", variant["name"]?.toString() ?: variantSku, variantActive, existingVariant.first)
                    existingVariant.first to false
                }
            }
            if (variant.containsKey("attributes")) {
                val attributes = variant["attributes"] as? Map<*, *> ?: throw CommerceValidation("CATALOG_ATTRIBUTES_INVALID")
                if (attributes.keys.any { it !is String }) throw CommerceValidation("CATALOG_ATTRIBUTES_INVALID")
                jdbc.update("UPDATE product_variants SET attributes=?::jsonb,attribute_order=ARRAY(SELECT jsonb_array_elements_text(?::jsonb)) WHERE id=?", mapper.writeValueAsString(attributes), mapper.writeValueAsString(attributes.keys), targetVariantId)
            }
            val rawQuantity = variant["availableQuantity"]
            if (!createdVariant && (variant.containsKey("availableQuantity") || variant.containsKey("stockAdjustmentReason"))) {
                throw CommerceValidation("CATALOG_STOCK_REQUIRES_ADJUSTMENT_COMMAND")
            }
            if (rawQuantity != null) {
                val quantity = number(rawQuantity)?.intValueExact() ?: throw CommerceValidation("CATALOG_AVAILABLE_QUANTITY_INVALID")
                val reason = variant["stockAdjustmentReason"]?.toString() ?: if (createdVariant) "INITIAL_CATALOG_STOCK" else null
                stockChanges += Triple(targetVariantId, quantity, reason)
            }
        }
        stockChanges.sortedBy { it.first }.forEach { (id, quantity, reason) ->
            inventory.setAvailableQuantity(id, quantity, "USER:$actor", reason)
        }
        audit(actor, "CATALOG_PRODUCT_SAVED", "products", sku)
        return product(sku, admin = true)!!
    }
    fun saveBrand(id: Long, name: String, actor: Long): CatalogFacet = saveFacet("brands", id, name, actor)
    fun saveCategory(id: Long, name: String, actor: Long): CatalogFacet = saveFacet("categories", id, name, actor)
    private fun saveFacet(table: String, id: Long, name: String, actor: Long): CatalogFacet {
        val updated = jdbc.update("UPDATE $table SET name=?,slug=?,updated_at=now() WHERE id=?", name, slug(name), id)
        val stored = if (updated == 1) id else jdbc.queryForObject("INSERT INTO $table(name,slug) VALUES (?,?) RETURNING id", Long::class.java, name, slug("$name-$id"))!!
        audit(actor, "CATALOG_FACET_SAVED", table, stored.toString()); return CatalogFacet(stored, name)
    }
    private fun named(table: String, name: String): Long? {
        if (name.isBlank()) return null
        return jdbc.query("SELECT id FROM $table WHERE lower(name)=lower(?)", { rs, _ -> rs.getLong("id") }, name).firstOrNull()
            ?: jdbc.queryForObject("INSERT INTO $table(name,slug) VALUES (?,?) RETURNING id", Long::class.java, name, slug(name))
    }
    private fun slug(value: String) = value.lowercase().replace(Regex("[^a-z0-9]+"), "-").trim('-').ifBlank { "item" }
    private fun number(value: Any?) = when (value) { is Number -> BigDecimal(value.toString()); is String -> value.toBigDecimalOrNull(); else -> null }
    private fun audit(actor: Long, event: String, aggregate: String, ref: String) = jdbc.update("INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted) VALUES ('USER',?,?,?,NULL,?::jsonb)", actor.toString(), event, aggregate, mapper.createObjectNode().put("reference", ref).toString())
}
