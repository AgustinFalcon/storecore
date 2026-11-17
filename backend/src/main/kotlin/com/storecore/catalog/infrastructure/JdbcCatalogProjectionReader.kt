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

/** Fixed query count per page: products, variants/balances, media and two option bulk reads. */
@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
open class JdbcCatalogProjectionReader(private val jdbc: JdbcTemplate, private val mapper: ObjectMapper) {
    open fun list(admin: Boolean, query: CatalogSearchTerm = CatalogSearchTerm.fromWire(null), brand: Long? = null, category: Long? = null, offers: Boolean = false, page: Int = 0, size: Int = 50): BoundedPage<CatalogProduct> {
        validatePage(page, size)
        val clauses = mutableListOf(if(admin) "TRUE" else "p.status='ACTIVE' AND EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND v.active)")
        val args = mutableListOf<Any>()
        if(query.present) {
            clauses += """(lower(p.name) LIKE lower(?) ESCAPE '!' OR
                EXISTS (SELECT 1 FROM product_variants v WHERE v.product_id=p.id AND ${if(admin) "TRUE" else "v.active"} AND lower(v.sku) LIKE lower(?) ESCAPE '!') OR
                EXISTS (SELECT 1 FROM categories search_category WHERE search_category.id=p.category_id AND lower(search_category.name) LIKE lower(?) ESCAPE '!'))""".trimIndent()
            repeat(3) { args += query.literalLikePattern }
        }
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
        return assemble(readProducts(where, listOf(sku)), admin).firstOrNull()?.let { it.copy(sku = sku, price = it.variants.firstOrNull { variant -> variant.sku == sku }?.price?.knownPrice()) }
    }
    open fun inventory(page: Int, size: Int): BoundedPage<InventoryProjection> {
        validatePage(page,size)
        val total=jdbc.queryForObject("SELECT count(*) FROM product_variants",Long::class.java)!!
        val items=jdbc.query("""SELECT v.id,v.sku,v.label,p.name,i.variant_id balance_id,i.available_quantity,i.reserved_quantity,i.safety_stock,i.updated_at
            FROM product_variants v JOIN products p ON p.id=v.product_id LEFT JOIN inventory_balances i ON i.variant_id=v.id
            ORDER BY v.sku,v.id LIMIT ? OFFSET ?""", { rs,_ -> balance(rs) },size,page.toLong()*size)
        return BoundedPage(items,total,page,size)
    }
    private data class Row(val id: Long, val name: String, val description: String, val brand: String, val category: String, val status: ProductStatus, val base: java.math.BigDecimal?, val offer: SkuOffer?, val hasOptionSchema: Boolean, val optionRevision: Long)
    private fun readProducts(where: String, args: List<Any>): List<Row> = jdbc.query("""SELECT p.id,p.name,p.description,p.status,p.base_price,p.has_option_schema,p.option_schema_revision,b.name brand,c.name category,o.id offer_id,o.name offer_name,o.discount_type,o.discount_value
        FROM products p LEFT JOIN brands b ON b.id=p.brand_id LEFT JOIN categories c ON c.id=p.category_id
        LEFT JOIN LATERAL (SELECT o.* FROM offers o JOIN offer_products op ON op.offer_id=o.id WHERE op.product_id=p.id AND o.status='ACTIVE' AND now() BETWEEN o.starts_at AND o.ends_at ORDER BY o.priority DESC,o.id LIMIT 1) o ON TRUE WHERE $where""", { rs,_ ->
        val offer=rs.getString("offer_id")?.let { SkuOffer(it,rs.getString("offer_name"),com.storecore.offers.domain.DiscountKind.fromWire(rs.getString("discount_type")),rs.getString("discount_value")?.toBigDecimalOrNull()) }
        Row(rs.getLong("id"),rs.getString("name"),rs.getString("description") ?: "",rs.getString("brand") ?: "",rs.getString("category") ?: "",ProductStatus.fromWire(rs.getString("status")),rs.getString("base_price")?.toBigDecimalOrNull(),offer,rs.getBoolean("has_option_schema"),rs.getLong("option_schema_revision"))
    },*args.toTypedArray())
    private fun assemble(rows: List<Row>, admin: Boolean): List<CatalogProduct> {
        if(rows.isEmpty()) return emptyList()
        val ids=rows.map { it.id }; val placeholders=ids.joinToString(",") { "?" }
        // Child collections are explicitly bounded per product. Oversized data fails instead of silently losing identity.
        val variants=jdbc.query("""SELECT * FROM (SELECT v.*,p.name,i.variant_id balance_id,i.available_quantity,i.reserved_quantity,i.safety_stock,i.updated_at balance_updated_at,
            row_number() OVER (PARTITION BY v.product_id ORDER BY v.id) rn FROM product_variants v JOIN products p ON p.id=v.product_id
            LEFT JOIN inventory_balances i ON i.variant_id=v.id WHERE v.product_id IN ($placeholders)) children WHERE rn<=1001 ORDER BY product_id,id""", { rs,_ ->
            val inventory=balance(rs,"balance_updated_at")
            val product=rows.first { it.id == rs.getLong("product_id") }
            val policy=VariantBasePricePolicy.fromPersistence(product.base,rs.getString("base_price_override"))
            rs.getLong("product_id") to CatalogVariant(rs.getString("id"),rs.getString("sku"),rs.getString("label"),VariantStatus.fromWire(rs.getBoolean("active")),
                attributes(rs), if(admin) inventory.available else inventory.saleable,inventory,SkuPricePolicy.resolve(policy,product.offer),policy.view,emptyMap())
        },*ids.toTypedArray()).groupBy({it.first},{it.second})
        val media=jdbc.query("""SELECT * FROM (SELECT m.*,row_number() OVER (PARTITION BY product_id ORDER BY sort_order,id) rn FROM product_images m WHERE product_id IN ($placeholders)) children WHERE rn<=1001 ORDER BY product_id,sort_order,id""",{rs,_ -> rs.getLong("product_id") to CatalogMedia(rs.getString("id"),rs.getString("url"),rs.getInt("sort_order"),rs.getBoolean("is_primary"))},*ids.toTypedArray()).groupBy({it.first},{it.second})
        val optionRows=readOptionStructure(ids,placeholders)
        val assignmentRows=readOptionAssignments(ids,placeholders)
        return rows.map { row ->
            val allVariants=variants[row.id].orEmpty(); val m=media[row.id].orEmpty()
            if(allVariants.size>OptionLimits.MAX_VARIANTS || m.size>1000) throw CommerceValidation("CATALOG_PRODUCT_COLLECTION_LIMIT_EXCEEDED")
            val projected=projectOptions(row,optionRows[row.id].orEmpty(),assignmentRows[row.id].orEmpty(),allVariants)
            val visible=if(admin) allVariants else allVariants.filter { it.active }
            val safeVariants=visible.map { variant -> variant.copy(optionValues=projected.assignments[variant.id].orEmpty().mapKeys { it.key.value }.mapValues { it.value.value }) }
            CatalogProduct(row.id.toString(),safeVariants.firstOrNull()?.sku ?: "",row.name,row.description,row.brand,row.category,row.status,m,safeVariants,safeVariants.firstOrNull()?.price?.knownPrice(),row.base,CatalogOptionSchema.fromDomain(projected.schema))
        }
    }

    private enum class StructureKind {
        AXIS, VALUE, UNKNOWN;
        companion object { fun fromWire(raw: String?) = entries.firstOrNull { it.name == raw } ?: UNKNOWN }
    }
    private data class StructureRow(
        val productId: Long,
        val kind: StructureKind,
        val identity: Long,
        val parentIdentity: Long?,
        val code: String,
        val label: String,
        val presentation: String?,
        val order: Int,
        val swatchColor: String?,
    )
    private data class AssignmentRow(
        val productId: Long,
        val variantId: Long,
        val assignmentPresent: Boolean,
        val ownershipValid: Boolean,
        val axisCode: String?,
        val valueCode: String?,
    )

    private fun readOptionStructure(ids: List<Long>, placeholders: String): Map<Long, List<StructureRow>> = jdbc.query(
        """WITH bounded_axes AS (
               SELECT a.*,row_number() OVER (PARTITION BY a.product_id ORDER BY a.sort_order,a.id) rn
               FROM product_option_axes a WHERE a.product_id IN ($placeholders)
           ), bounded_values AS (
               SELECT v.*,row_number() OVER (PARTITION BY v.product_id ORDER BY v.axis_id,v.sort_order,v.id) rn
               FROM product_option_values v WHERE v.product_id IN ($placeholders)
           )
           SELECT product_id,'AXIS' kind,id identity,NULL::bigint parent_identity,code,label,presentation,sort_order,NULL::text swatch_color
           FROM bounded_axes WHERE rn<=${OptionLimits.MAX_AXES + 1}
           UNION ALL
           SELECT product_id,'VALUE' kind,id identity,axis_id parent_identity,code,label,NULL::text presentation,sort_order,swatch_color
           FROM bounded_values WHERE rn<=${OptionLimits.MAX_AXES * OptionLimits.MAX_VALUES_PER_AXIS + 1}
           ORDER BY product_id,kind,sort_order,identity""",
        { rs, _ -> StructureRow(rs.getLong("product_id"),StructureKind.fromWire(rs.getString("kind")),rs.getLong("identity"),rs.getObject("parent_identity")?.let { (it as Number).toLong() },rs.getString("code"),rs.getString("label"),rs.getString("presentation"),rs.getInt("sort_order"),rs.getString("swatch_color")) },
        *(ids + ids).toTypedArray(),
    ).groupBy { it.productId }

    private fun readOptionAssignments(ids: List<Long>, placeholders: String): Map<Long, List<AssignmentRow>> = jdbc.query(
        """SELECT * FROM (
               SELECT v.product_id,v.id variant_id,av.variant_id assignment_variant_id,av.product_id assignment_product_id,
                      a.product_id axis_product_id,o.product_id value_product_id,av.axis_id assignment_axis_id,o.axis_id value_axis_id,a.code axis_code,o.code value_code,
                      row_number() OVER (PARTITION BY v.product_id ORDER BY v.id,av.axis_id,av.value_id) rn
               FROM product_variants v
               LEFT JOIN variant_option_values av ON av.variant_id=v.id
               LEFT JOIN product_option_axes a ON a.id=av.axis_id
               LEFT JOIN product_option_values o ON o.id=av.value_id
               WHERE v.product_id IN ($placeholders)
           ) option_assignments WHERE rn<=${OptionLimits.MAX_ASSIGNMENTS + 1} ORDER BY product_id,variant_id,rn""",
        { rs, _ ->
            val present=rs.getObject("assignment_variant_id") != null
            val productId=rs.getLong("product_id")
            val ownershipValid=!present || (rs.getLong("assignment_product_id")==productId && rs.getLong("axis_product_id")==productId &&
                rs.getLong("value_product_id")==productId && rs.getLong("assignment_axis_id")==rs.getLong("value_axis_id"))
            AssignmentRow(productId,rs.getLong("variant_id"),present,ownershipValid,rs.getString("axis_code"),rs.getString("value_code"))
        },
        *ids.toTypedArray(),
    ).groupBy { it.productId }

    private fun projectOptions(row: Row, structure: List<StructureRow>, assignments: List<AssignmentRow>, variants: List<CatalogVariant>): ProductOptionProjection {
        val axes=structure.filter { it.kind==StructureKind.AXIS }
        val values=structure.filter { it.kind==StructureKind.VALUE }
        if(axes.size>OptionLimits.MAX_AXES || values.size>OptionLimits.MAX_AXES*OptionLimits.MAX_VALUES_PER_AXIS ||
            values.groupingBy { it.parentIdentity }.eachCount().values.any { it>OptionLimits.MAX_VALUES_PER_AXIS } || assignments.size>OptionLimits.MAX_ASSIGNMENTS)
            throw CommerceValidation("CATALOG_PRODUCT_COLLECTION_LIMIT_EXCEEDED")
        val knownAxisIds=axes.map { it.identity }.toSet()
        val malformedStructure=structure.any { it.kind==StructureKind.UNKNOWN } || values.any { it.parentIdentity !in knownAxisIds }
        val sources=if(malformedStructure) listOf(OptionAxisSource("", "", "", null, -1, emptyList())) else axes.map { axis ->
            OptionAxisSource(axis.identity.toString(),axis.code,axis.label,axis.presentation,axis.order,values.filter { it.parentIdentity==axis.identity }.map { value ->
                OptionValueSource(value.identity.toString(),value.code,value.label,value.swatchColor,value.order)
            })
        }
        val rowsByVariant=assignments.groupBy { it.variantId }
        val variantSources=variants.map { variant ->
            val raw=rowsByVariant[variant.id.toLongOrNull()].orEmpty()
            val valuesForVariant=raw.filter { it.assignmentPresent }.map { assignment ->
                if(assignment.ownershipValid) assignment.axisCode to assignment.valueCode else null to null
            }
            VariantOptionSource(variant.id,variant.sku,variant.status,valuesForVariant)
        }
        if(rowsByVariant.keys.any { id -> variants.none { it.id==id.toString() } })
            return ProductOptionProjection.unknown(SchemaRevision.of(row.optionRevision))
        return ProjectProductOptionsStep().execute(row.hasOptionSchema,row.optionRevision,sources,variantSources)
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
