package com.storecore.catalog.infrastructure

import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.catalog.domain.*
import com.storecore.catalog.domain.CatalogProduct
import com.storecore.commerce.application.CommerceValidation
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet

/** Fixed query count per page: products, variants/balances, media. Never loads one product at a time. */
@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
open class JdbcCatalogProjectionReader(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    open fun list(admin: Boolean, query: String = "", brand: Long? = null, category: Long? = null, offers: Boolean = false, page: Int = 0, size: Int = 50): BoundedPage<CatalogProduct> {
        validatePage(page, size)
        val clauses = mutableListOf(if(admin) "TRUE" else "p.status='ACTIVE' AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND v.active)")
        val args = mutableListOf<Any>()
        if(query.isNotBlank()) { clauses += "(lower(p.name) LIKE lower(?) OR EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND ${if(admin) "TRUE" else "v.active"} AND lower(v.sku) LIKE lower(?)))"; args += "%$query%"; args += "%$query%" }
        if(brand != null) { clauses += "p.brand_id=?"; args += brand }
        if(category != null) { clauses += "p.category_id=?"; args += category }
        if(offers) clauses += "EXISTS (SELECT 1 FROM offer_products op JOIN offers o ON o.id=op.offer_id WHERE op.product_id=p.id AND o.status='ACTIVE' AND now() BETWEEN o.starts_at AND o.ends_at)"
        val where = clauses.joinToString(" AND ")
        val total = jdbc.queryForObject("SELECT count(*) FROM products p WHERE $where", Long::class.java, *args.toTypedArray())!!
        val rows = readProducts("$where ORDER BY p.name,p.id LIMIT ? OFFSET ?", args + listOf(size, page.toLong()*size))
        return BoundedPage(assemble(rows, admin), total, page, size)
    }
    open fun product(sku: String, admin: Boolean): CatalogProduct? {
        val where = "EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND v.sku=? ${if(admin) "" else "AND v.active"}) ${if(admin) "" else "AND p.status='ACTIVE'"}"
        return assemble(readProducts(where, listOf(sku)), admin).firstOrNull()?.let { it.copy(sku = sku) }
    }
    open fun inventory(page: Int, size: Int): BoundedPage<InventoryProjection> {
        validatePage(page,size)
        val total=jdbc.queryForObject("SELECT count(*) FROM product_variants",Long::class.java)!!
        val items=jdbc.query("""SELECT v.id,v.sku,v.label,p.name,i.variant_id balance_id,i.available_quantity,i.reserved_quantity,i.safety_stock,i.updated_at
            FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN inventory_balances i ON i.variant_id=v.id
            ORDER BY v.sku,v.id LIMIT ? OFFSET ?""", { rs,_ -> balance(rs) },size,page.toLong()*size)
        return BoundedPage(items,total,page,size)
    }
    private data class Row(val id: Long, val name: String, val description: String, val brand: String, val category: String, val status: ProductStatus, val price: PriceProjection)
    private fun readProducts(where: String, args: List<Any>): List<Row> = jdbc.query("""SELECT p.id,p.name,p.description,p.status,p.base_price,b.name brand,c.name category,o.id offer_id,o.name offer_name,o.discount_type,o.discount_value
        FROM products p LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN categories c ON c.id=p.category_id
        LEFT JOIN LATERAL (SELECT o.* FROM offers o JOIN offer_products op ON op.offer_id=o.id WHERE op.product_id=p.id AND o.status='ACTIVE' AND now() BETWEEN o.starts_at AND o.ends_at ORDER BY o.priority DESC,o.id LIMIT 1) o ON TRUE WHERE $where""", { rs,_ ->
        val base=rs.getBigDecimal("base_price")
        val discount=rs.getBigDecimal("discount_value")?.let { com.storecore.offers.domain.DiscountKind.fromWire(rs.getString("discount_type")).discount(base,it) }
        Row(rs.getLong("id"),rs.getString("name"),rs.getString("description") ?: "",rs.getString("brand") ?: "",rs.getString("category") ?: "",ProductStatus.fromWire(rs.getString("status")),
            PriceProjection(base,base,base.subtract(discount ?: java.math.BigDecimal.ZERO), if(discount == null) null else OfferProjection(rs.getString("offer_id"),rs.getString("offer_name"))))
    },*args.toTypedArray())
    private fun assemble(rows: List<Row>, admin: Boolean): List<CatalogProduct> {
        if(rows.isEmpty()) return emptyList()
        val ids=rows.map { it.id }; val placeholders=ids.joinToString(",") { "?" }
        // Child collections are explicitly bounded per product. Oversized data fails instead of silently losing identity.
        val variants=jdbc.query("""SELECT * FROM (SELECT v.*,p.name,i.variant_id balance_id,i.available_quantity,i.reserved_quantity,i.safety_stock,i.updated_at balance_updated_at,
            row_number() OVER (PARTITION BY v.product_id ORDER BY v.id) rn FROM product_variants v JOIN products p ON p.id=v.product_id
            LEFT JOIN inventory_balances i ON i.variant_id=v.id WHERE v.product_id IN ($placeholders) ${if(admin) "" else "AND v.active"}) children WHERE rn<=1001 ORDER BY product_id,id""", { rs,_ ->
            val inventory=balance(rs,"balance_updated_at")
            rs.getLong("product_id") to CatalogVariant(rs.getString("id"),rs.getString("sku"),rs.getString("label"),VariantStatus.fromWire(rs.getBoolean("active")),
                attributes(rs), if(admin) inventory.available else inventory.saleable,inventory)
        },*ids.toTypedArray()).groupBy({it.first},{it.second})
        val media=jdbc.query("""SELECT * FROM (SELECT m.*,row_number() OVER (PARTITION BY product_id ORDER BY sort_order,id) rn FROM product_images m WHERE product_id IN ($placeholders)) children WHERE rn<=1001 ORDER BY product_id,sort_order,id""",{rs,_ -> rs.getLong("product_id") to CatalogMedia(rs.getString("id"),rs.getString("url"),rs.getInt("sort_order"),rs.getBoolean("is_primary"))},*ids.toTypedArray()).groupBy({it.first},{it.second})
        return rows.map { row ->
            val v=variants[row.id].orEmpty(); val m=media[row.id].orEmpty()
            if(v.size>1000 || m.size>1000) throw CommerceValidation("CATALOG_PRODUCT_COLLECTION_LIMIT_EXCEEDED")
            CatalogProduct(row.id.toString(),v.firstOrNull()?.sku ?: "",row.name,row.description,row.brand,row.category,row.status,m,v,row.price)
        }
    }
    private fun attributes(rs: ResultSet): Map<String, Any?> {
        val values: Map<String, Any?> = mapper.readValue(rs.getString("attributes"), object: TypeReference<Map<String, Any?>>() {})
        val order = (rs.getArray("attribute_order").array as Array<*>).filterIsInstance<String>()
        return linkedMapOf<String, Any?>().apply {
            (order.filter { values.containsKey(it) } + values.keys.sorted()).distinct().forEach { put(it, values[it]) }
        }
    }
    private fun balance(rs:ResultSet, timeColumn:String="updated_at") = InventoryProjection.fromBalance(rs.getString("id"),rs.getString("sku"),rs.getString("name"),rs.getString("label"),rs.getObject("balance_id") != null,
        (rs.getObject("available_quantity") as? Number)?.toLong(),(rs.getObject("reserved_quantity") as? Number)?.toLong(),(rs.getObject("safety_stock") as? Number)?.toLong(),rs.getTimestamp(timeColumn)?.toInstant())
    private fun validatePage(page:Int,size:Int) { if(page !in 0..10000 || size !in 1..50) throw CommerceValidation("CATALOG_PAGE_INVALID") }
}
