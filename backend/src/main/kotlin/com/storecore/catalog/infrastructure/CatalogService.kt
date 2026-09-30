package com.storecore.catalog.infrastructure

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.catalog.application.port.input.CatalogSearchResult
import com.storecore.catalog.application.port.output.CatalogQueryPort
import com.storecore.commerce.application.port.output.EffectivePriceQueryPort
import com.storecore.commerce.infrastructure.JdbcInventoryService
import com.storecore.commerce.application.CommerceValidation
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import java.math.BigDecimal
import java.time.Instant
import javax.sql.DataSource

data class CatalogProduct(val sku: String, val name: String, val description: String, val brand: String, val category: String, val images: List<String>, val variants: List<Map<String, Any?>>, val price: Map<String, Any?>, val offerRef: String?, val active: Boolean, val validFrom: Instant? = null, val validUntil: Instant? = null)
data class CatalogFacet(val id: Long, val name: String)
data class HomeContent(val title: String, val blocks: List<Map<String, Any?>>)
data class HomeBlockInput(val id: String, val title: String, val body: String)
data class HomeDraft(val title: String, val body: String, val blocks: List<Map<String, Any?>>)

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcCatalogService(
    private val jdbc: JdbcTemplate,
    private val mapper: ObjectMapper,
    private val inventory: JdbcInventoryService,
    private val effectivePrices: EffectivePriceQueryPort,
) : CatalogQueryPort {
    override fun searchActive(query: String): List<CatalogSearchResult> = jdbc.query("""SELECT v.sku,p.name FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='ACTIVE' AND v.active AND (lower(p.name) LIKE lower(?) OR lower(v.sku) LIKE lower(?) OR lower(coalesce(b.name,'')) LIKE lower(?) OR lower(coalesce(c.name,'')) LIKE lower(?)) ORDER BY p.name LIMIT 100""", { rs, _ -> CatalogSearchResult(com.storecore.catalog.domain.ProductSku(rs.getString("sku")), rs.getString("name")) }, "%$query%", "%$query%", "%$query%", "%$query%")
    fun facets(kind: String): List<CatalogFacet> = jdbc.query("SELECT id,name FROM ${if (kind == "brands") "brands" else "categories"} WHERE active ORDER BY name", { rs, _ -> CatalogFacet(rs.getLong("id"), rs.getString("name")) })
    fun search(query: String, brand: Long?, category: Long?, offers: Boolean): List<Map<String, Any?>> {
        val clauses = mutableListOf("p.status='ACTIVE'", "v.active"); val args = mutableListOf<Any>()
        if (query.isNotBlank()) { clauses += "(lower(p.name) LIKE lower(?) OR lower(v.sku) LIKE lower(?))"; args += "%$query%"; args += "%$query%" }
        if (brand != null) { clauses += "p.brand_id=?"; args += brand }; if (category != null) { clauses += "p.category_id=?"; args += category }
        if (offers) clauses += "EXISTS (SELECT 1 FROM offer_products op JOIN offers o ON o.id=op.offer_id WHERE op.product_id=p.id AND o.status='ACTIVE' AND o.starts_at <= now() AND now() < o.ends_at)"
        val rows =
            jdbc.query(
                """SELECT v.sku,p.name,(SELECT url FROM product_images WHERE product_id=p.id ORDER BY sort_order,id LIMIT 1) image
                   FROM product_variants v JOIN products p ON p.id=v.product_id
                   WHERE ${clauses.joinToString(" AND ")} ORDER BY p.name LIMIT 100""",
                { rs, _ -> mapOf("sku" to rs.getString("sku"), "name" to rs.getString("name"), "image" to rs.getString("image")) },
                *args.toTypedArray(),
            )
        val priced = effectivePrices.findBySkus(rows.map { it["sku"] as String })
        return rows.map { row ->
            val sku = row["sku"] as String
            val snapshot = priced[sku]
            val base = snapshot?.basePrice ?: BigDecimal.ZERO
            val effective = snapshot?.effectivePrice ?: base
            val image = row["image"]
            mapOf(
                "sku" to sku,
                "name" to row["name"],
                "price" to mapOf("base" to base, "desired" to null, "observed" to null, "effective" to effective, "priceVersion" to (snapshot?.priceVersion ?: "catalog")),
                "originalPrice" to if (snapshot != null && snapshot.discountAmount.signum() > 0) base else null,
                "imageUrl" to image,
                "images" to listOfNotNull(image),
                "offerRef" to snapshot?.offerRef,
                "validFrom" to snapshot?.validFrom,
                "validUntil" to snapshot?.validUntil,
            )
        }
    }
    fun product(sku: String, admin: Boolean = false): CatalogProduct? {
        val visibility = if (admin) "v.sku=?" else "v.sku=? AND p.status='ACTIVE' AND v.active"
        val row = jdbc.query("SELECT p.id,p.name,p.description,b.name brand,c.name category,p.base_price,p.status FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN categories c ON c.id=p.category_id WHERE $visibility", { rs, _ -> mapOf("id" to rs.getLong("id"), "name" to rs.getString("name"), "description" to (rs.getString("description") ?: ""), "brand" to (rs.getString("brand") ?: ""), "category" to (rs.getString("category") ?: ""), "base" to rs.getBigDecimal("base_price"), "status" to rs.getString("status")) }, sku).firstOrNull() ?: return null
        val variants = jdbc.query("SELECT v.id,v.sku,v.label,v.active,CASE WHEN ? THEN COALESCE(i.available_quantity,0) ELSE GREATEST(0,COALESCE(i.available_quantity,0)-COALESCE(i.safety_stock,0)) END available FROM product_variants v LEFT JOIN inventory_balances i ON i.variant_id=v.id JOIN products p ON p.id=v.product_id WHERE p.id=? ${if (admin) "" else "AND v.active"} ORDER BY v.id", { rs, _ -> mapOf("id" to rs.getLong("id").toString(), "sku" to rs.getString("sku"), "name" to rs.getString("label"), "availableQuantity" to rs.getInt("available")) }, admin, row["id"] as Long)
        val images = jdbc.query("SELECT url FROM product_images WHERE product_id=? ORDER BY sort_order,id", { rs, _ -> rs.getString("url") }, row["id"] as Long)
        val base = row["base"] as BigDecimal
        val snapshot = effectivePrices.findBySkus(listOf(sku))[sku]
        val effective = snapshot?.effectivePrice ?: base
        return CatalogProduct(
            sku,
            row["name"] as String,
            row["description"] as String,
            row["brand"] as String,
            row["category"] as String,
            images,
            variants,
            mapOf("base" to base, "desired" to null, "observed" to null, "effective" to effective, "priceVersion" to (snapshot?.priceVersion ?: "catalog")),
            snapshot?.offerRef,
            row["status"] == "ACTIVE",
            snapshot?.validFrom,
            snapshot?.validUntil,
        )
    }
    fun adminList(): List<CatalogProduct> = jdbc.query("SELECT v.sku FROM product_variants v JOIN products p ON p.id=v.product_id ORDER BY p.name,v.id", { rs, _ -> rs.getString("sku") }).mapNotNull { product(it, admin = true) }
    fun home(): HomeContent {
        val rows = activeHomeSections()
        val title = rows.firstOrNull { it.first == "hero" }?.second?.path("title")?.asText() ?: "StoreCore"
        return HomeContent(title, homeBlocks(rows))
    }
    fun adminHomeDraft(): HomeDraft {
        val json = jdbc.query("SELECT content FROM home_content_sections WHERE section_key='hero'", { rs, _ -> mapper.readTree(rs.getString("content")) }).firstOrNull()
        return HomeDraft(json?.path("title")?.asText() ?: "StoreCore", json?.path("body")?.asText() ?: "", homeBlocks(activeHomeSections()))
    }
    fun saveHome(title: String, body: String, blocks: List<HomeBlockInput>?, actor: Long): HomeDraft {
        blocks?.forEachIndexed { index, block ->
            val key = block.id.trim()
            if (key.isEmpty() || key.length > 80) throw CommerceValidation("HOME_BLOCK_ID_INVALID")
            val json = mapper.createObjectNode().put("title", block.title).put("body", block.body)
            jdbc.update(
                """INSERT INTO home_content_sections(section_key,content,active,sort_order,updated_by)
                   VALUES (?,?::jsonb,true,?,?)
                   ON CONFLICT(section_key) DO UPDATE
                   SET content=excluded.content, active=true, sort_order=excluded.sort_order,
                       updated_by=excluded.updated_by, updated_at=now()""",
                key, json.toString(), index, actor,
            )
        }
        val hero = mapper.createObjectNode().put("title", title).put("body", body)
        jdbc.update("INSERT INTO home_content_sections(section_key,content,active,sort_order,updated_by) VALUES ('hero',?::jsonb,true,0,?) ON CONFLICT(section_key) DO UPDATE SET content=excluded.content,updated_by=excluded.updated_by,updated_at=now()", hero.toString(), actor)
        audit(actor, "HOME_CONTENT_UPDATED", "home_content_sections", "hero")
        return adminHomeDraft()
    }
    private fun activeHomeSections() = jdbc.query(
        "SELECT section_key,content FROM home_content_sections WHERE active ORDER BY sort_order,id",
        { rs, _ -> rs.getString("section_key") to mapper.readTree(rs.getString("content")) },
    )
    private fun homeBlocks(rows: List<Pair<String, JsonNode>>) = rows.map { (key, content) ->
        mapOf("id" to key, "title" to content.path("title").asText(key), "body" to content.path("body").asText(""))
    }
    fun saveProduct(sku: String, name: String, description: String, brand: String, category: String, images: List<String>, variants: List<Map<String, Any?>>, price: Map<String, Any?>, active: Boolean, actor: Long): CatalogProduct {
        val brandId = named("brands", brand); val categoryId = named("categories", category)
        val base = number(price["base"]) ?: number(price["effective"]) ?: BigDecimal.ZERO
        val existing = jdbc.query("SELECT p.id,v.id variant_id FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.sku=?", { rs, _ -> rs.getLong("id") to rs.getLong("variant_id") }, sku).firstOrNull()
        val productId: Long; val variantId: Long
        if (existing == null) {
            productId = jdbc.queryForObject("INSERT INTO products(brand_id,category_id,name,slug,description,base_price,status) VALUES (?,?,?,?,?,?,?) RETURNING id", Long::class.java, brandId, categoryId, name, slug(sku), description, base, if (active) "ACTIVE" else "DRAFT")!!
            variantId = jdbc.queryForObject("INSERT INTO product_variants(product_id,sku,label,active) VALUES (?,?,?,?) RETURNING id", Long::class.java, productId, sku, name, active)!!
        } else {
            productId = existing.first; variantId = existing.second
            jdbc.update("UPDATE products SET brand_id=?,category_id=?,name=?,description=?,base_price=?,status=?,updated_at=now() WHERE id=?", brandId, categoryId, name, description, base, if (active) "ACTIVE" else "DRAFT", productId)
            jdbc.update("UPDATE product_variants SET label=?,active=?,updated_at=now() WHERE id=?", name, active, variantId)
        }
        jdbc.update("DELETE FROM product_images WHERE product_id=?", productId)
        images.filter { it.startsWith("https://") }.forEachIndexed { index, url -> jdbc.update("INSERT INTO product_images(product_id,url,sort_order,is_primary) VALUES (?,?,?,?)", productId, url, index, index == 0) }
        variants.forEachIndexed { index, variant ->
            val variantSku = variant["sku"]?.toString()?.takeIf { it.isNotBlank() } ?: if (index == 0) sku else return@forEachIndexed
            val (targetVariantId, createdVariant) = if (variantSku == sku) variantId to (existing == null) else {
                val existingVariant = jdbc.query("SELECT id,product_id FROM product_variants WHERE sku=?", { rs, _ -> rs.getLong("id") to rs.getLong("product_id") }, variantSku).firstOrNull()
                if (existingVariant != null && existingVariant.second != productId) throw CommerceValidation("CATALOG_VARIANT_SKU_ALREADY_BELONGS_TO_ANOTHER_PRODUCT")
                if (existingVariant == null) {
                    jdbc.queryForObject("INSERT INTO product_variants(product_id,sku,label,active) VALUES (?,?,?,?) RETURNING id", Long::class.java, productId, variantSku, variant["name"]?.toString() ?: variantSku, variant["active"] != false)!! to true
                } else {
                    jdbc.update("UPDATE product_variants SET label=?,active=?,updated_at=now() WHERE id=?", variant["name"]?.toString() ?: variantSku, variant["active"] != false, existingVariant.first)
                    existingVariant.first to false
                }
            }
            val rawQuantity = variant["availableQuantity"]
            if (rawQuantity != null) {
                val quantity = number(rawQuantity)?.intValueExact() ?: throw CommerceValidation("CATALOG_AVAILABLE_QUANTITY_INVALID")
                val reason = variant["stockAdjustmentReason"]?.toString() ?: if (createdVariant) "INITIAL_CATALOG_STOCK" else null
                inventory.setAvailableQuantity(targetVariantId, quantity, "USER:$actor", reason)
            }
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

