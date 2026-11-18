package com.storecore.catalog.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.catalog.application.*
import com.storecore.catalog.domain.*
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Isolation
import org.springframework.transaction.annotation.Transactional
import java.sql.ResultSet

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
open class JdbcProductOptionWriter(
    private val jdbc: JdbcTemplate,
    private val mapper: ObjectMapper,
) : ManageProductOptionsUseCase {
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    override fun read(sku: String): ProductOptionAdminSnapshot {
        val product = productBySku(sku, lock = false) ?: throw CatalogOptionNotFound()
        val axes = jdbc.query(
            "SELECT id,code,label,presentation,sort_order FROM product_option_axes WHERE product_id=? ORDER BY sort_order,id LIMIT ?",
            { rs, _ -> StoredAxis(rs.getLong("id"), rs.getString("code"), rs.getString("label"), rs.getString("presentation"), rs.getInt("sort_order")) },
            product.id, OptionLimits.MAX_AXES + 1,
        )
        val values = jdbc.query(
            "SELECT id,axis_id,code,label,swatch_color,sort_order FROM product_option_values WHERE product_id=? ORDER BY axis_id,sort_order,id LIMIT ?",
            { rs, _ -> rs.getLong("axis_id") to StoredValue(rs.getLong("id"), rs.getString("code"), rs.getString("label"), rs.getString("swatch_color"), rs.getInt("sort_order")) },
            product.id, OptionLimits.MAX_AXES * OptionLimits.MAX_VALUES_PER_AXIS + 1,
        ).groupBy({ it.first }, { it.second })
        val assignmentRows = jdbc.query(
            """SELECT * FROM (SELECT v.id,v.product_id,v.sku,v.active,av.variant_id assignment_variant_id,av.product_id assignment_product_id,
                      a.product_id axis_product_id,o.product_id value_product_id,av.axis_id assignment_axis_id,o.axis_id value_axis_id,a.code axis_code,o.code value_code,
                      row_number() OVER (ORDER BY v.id,av.axis_id,av.value_id) rn
               FROM product_variants v LEFT JOIN variant_option_values av ON av.variant_id=v.id
               LEFT JOIN product_option_axes a ON a.id=av.axis_id LEFT JOIN product_option_values o ON o.id=av.value_id
               WHERE v.product_id=?) option_assignments WHERE rn<=? ORDER BY id,rn""",
            { rs, _ ->
                val present=rs.getObject("assignment_variant_id") != null;val productId=rs.getLong("product_id")
                val ownershipValid=!present || (rs.getLong("assignment_product_id")==productId && rs.getLong("axis_product_id")==productId &&
                    rs.getLong("value_product_id")==productId && rs.getLong("assignment_axis_id")==rs.getLong("value_axis_id"))
                AssignmentRow(rs.getLong("id"), rs.getString("sku"), rs.getBoolean("active"), present, ownershipValid, rs.getString("axis_code"), rs.getString("value_code"))
            },
            product.id, OptionLimits.MAX_ASSIGNMENTS + 1,
        )
        if (axes.size > OptionLimits.MAX_AXES || values.values.sumOf { it.size } > OptionLimits.MAX_AXES * OptionLimits.MAX_VALUES_PER_AXIS ||
            values.values.any { it.size > OptionLimits.MAX_VALUES_PER_AXIS } ||
            assignmentRows.size > OptionLimits.MAX_ASSIGNMENTS || assignmentRows.map { it.id }.distinct().size > OptionLimits.MAX_VARIANTS)
            throw CatalogOptionInvalid("CATALOG_PRODUCT_COLLECTION_LIMIT_EXCEEDED")
        val malformedStructure=values.keys.any { axisId -> axes.none { it.id==axisId } }
        val axisSources=if(malformedStructure) listOf(OptionAxisSource("", "", "", null, -1, emptyList())) else axes.map { axis -> OptionAxisSource(axis.id.toString(),axis.code,axis.label,axis.presentation,axis.order,values[axis.id].orEmpty().map { value ->
            OptionValueSource(value.id.toString(),value.code,value.label,value.swatchColor,value.order)
        }) }
        val projection = ProjectProductOptionsStep().execute(
            product.present,
            product.revision,
            axisSources,
            assignmentRows.groupBy { it.id }.values.map { rows ->
                val first=rows.first()
                VariantOptionSource(first.id.toString(),first.sku,if(first.active) VariantStatus.ACTIVE else VariantStatus.INACTIVE,
                    rows.filter { it.assignmentPresent }.map { row -> if(row.ownershipValid) row.axisCode to row.valueCode else null to null })
            },
        )
        val safeAxes = if (projection.schema is ProductOptionSchema.Valid) projection.schema.axes.map { axis ->
            ProductOptionAxisView(axis.code.value, axis.label.value, axis.presentation, axis.order, axis.values.map { value ->
                ProductOptionValueView(value.code.value, value.label.value, value.swatchColor?.value, value.order)
            })
        } else emptyList()
        val assignments = if (projection.schema.state == OptionSchemaState.UNKNOWN) emptyList() else assignmentRows.groupBy { it.id }.values.map { rows ->
            val first=rows.first();val safe=projection.assignments[first.id.toString()].orEmpty()
            ProductOptionAssignmentView(first.id.toString(),first.sku,first.active,safe.mapKeys { it.key.value }.mapValues { it.value.value })
        }
        return ProductOptionAdminSnapshot(
            projection.schema.revision?.value,
            projection.schema.state,
            projection.schema.cause,
            safeAxes,
            assignments,
        )
    }

    @Transactional
    override fun replace(sku: String, command: ProductOptionSchemaCommand, actorUserId: Long): ProductOptionWriteResult = try {
        val lookup = productBySku(sku, lock = false) ?: throw CatalogOptionNotFound()
        val product = productById(lookup.id, lock = true) ?: throw CatalogOptionNotFound()
        if (product.revision != command.expectedRevision.value) throw CatalogOptionRevisionConflict()
        if (product.revision >= OptionLimits.MAX_WIRE_INTEGER) throw CatalogOptionRevisionConflict("CATALOG_OPTION_REVISION_EXHAUSTED")
        val variants = lockVariants(product.id).associateBy { it.id }.toMutableMap()
        if (variants.values.none { it.sku == sku }) throw CatalogOptionNotFound()

        val operations = resolveOperations(product.id, variants, command.variantOperations)
        val assignments = resolveAssignments(variants, command.assignments)
        val targetStates = variants.mapValues { (id, row) -> when (operations[id]?.operation) {
            VariantOptionWriteOperation.ACTIVATE -> true
            VariantOptionWriteOperation.DEACTIVATE -> false
            else -> row.active
        } }.toMutableMap()

        if (command.operation == OptionSchemaWriteOperation.REPLACE) {
            val schema = ProductOptionSchema.Valid.create(command.expectedRevision, command.axes) as? ProductOptionSchema.Valid
                ?: throw CatalogOptionInvalid()
            val validation = ValidateVariantAssignmentsStep().execute(schema, variants.values.map { row ->
                VariantOptionAssignment(row.id.toString(), if (targetStates[row.id] == true) VariantStatus.ACTIVE else VariantStatus.INACTIVE,
                    assignments[row.id]?.optionValues.orEmpty())
            })
            if (validation !is OptionAssignmentValidation.Valid) throw CatalogOptionInvalid("CATALOG_OPTION_ASSIGNMENTS_INVALID")
        }

        val additions = command.variantOperations.filter { it.operation == VariantOptionWriteOperation.ADD_INACTIVE }
        if (variants.size + additions.size > OptionLimits.MAX_VARIANTS)
            throw CatalogOptionInvalid("CATALOG_OPTION_VARIANT_LIMIT_EXCEEDED")
        for (addition in additions) {
            val reference = addition.reference as VariantOptionReference.Sku
            if (jdbc.queryForObject("SELECT count(*) FROM product_variants WHERE sku=?", Int::class.java, reference.value) != 0)
                throw CatalogOptionNotFound()
        }

        val updated = jdbc.update(
            "UPDATE products SET has_option_schema=?,option_schema_revision=option_schema_revision+1,updated_at=now() WHERE id=? AND option_schema_revision=? AND option_schema_revision<?",
            command.operation == OptionSchemaWriteOperation.REPLACE, product.id, product.revision, OptionLimits.MAX_WIRE_INTEGER,
        )
        if (updated != 1) throw CatalogOptionRevisionConflict()

        jdbc.update("DELETE FROM variant_option_values WHERE product_id=?", product.id)
        jdbc.update("DELETE FROM product_option_values WHERE product_id=?", product.id)
        jdbc.update("DELETE FROM product_option_axes WHERE product_id=?", product.id)

        targetStates.forEach { (id, active) ->
            if (variants[id]!!.active != active) jdbc.update("UPDATE product_variants SET active=?,updated_at=now() WHERE id=?", active, id)
        }
        additions.forEach { addition ->
            val reference = addition.reference as VariantOptionReference.Sku
            jdbc.update("INSERT INTO product_variants(product_id,sku,label,active) VALUES (?,?,?,FALSE)", product.id, reference.value, addition.label!!.value)
        }

        if (command.operation == OptionSchemaWriteOperation.REPLACE) persistSchema(product.id, command.axes, assignments)
        jdbc.execute("SET CONSTRAINTS ALL IMMEDIATE")
        jdbc.execute("SET CONSTRAINTS ALL DEFERRED")
        audit(actorUserId, product.id, product.revision, product.revision + 1, command)
        ProductOptionWriteResult(product.revision + 1,
            if (command.operation == OptionSchemaWriteOperation.REPLACE) OptionSchemaState.VALID else OptionSchemaState.ABSENT)
    } catch (_: DataIntegrityViolationException) {
        throw CatalogOptionInvalid()
    }

    private fun resolveOperations(productId: Long, variants: Map<Long, VariantRow>, writes: List<VariantOptionWrite>): Map<Long, VariantOptionWrite> {
        val bySku = variants.values.associateBy { it.sku }
        val resolved = linkedMapOf<Long, VariantOptionWrite>()
        for (write in writes) {
            if (write.operation == VariantOptionWriteOperation.ADD_INACTIVE) continue
            val row = when (val reference = write.reference) {
                is VariantOptionReference.Id -> variants[reference.value]
                is VariantOptionReference.Sku -> bySku[reference.value]
            } ?: throw CatalogOptionNotFound()
            if (row.productId != productId || resolved.put(row.id, write) != null) throw CatalogOptionNotFound()
        }
        return resolved
    }

    private fun resolveAssignments(variants: Map<Long, VariantRow>, writes: List<VariantOptionAssignmentCommand>): Map<Long, VariantOptionAssignmentCommand> {
        val bySku = variants.values.associateBy { it.sku }
        val resolved = linkedMapOf<Long, VariantOptionAssignmentCommand>()
        for (write in writes) {
            val row = when (val reference = write.reference) {
                is VariantOptionReference.Id -> variants[reference.value]
                is VariantOptionReference.Sku -> bySku[reference.value]
            } ?: throw CatalogOptionNotFound()
            if (resolved.put(row.id, write) != null) throw CatalogOptionNotFound()
        }
        return resolved
    }

    private fun persistSchema(productId: Long, axes: List<OptionAxis>, assignments: Map<Long, VariantOptionAssignmentCommand>) {
        val valueIds = mutableMapOf<Pair<OptionCode, OptionCode>, Pair<Long, Long>>()
        for (axis in axes.sortedBy { it.order }) {
            val axisId = jdbc.queryForObject(
                "INSERT INTO product_option_axes(product_id,code,label,presentation,sort_order) VALUES (?,?,?,?,?) RETURNING id",
                Long::class.java, productId, axis.code.value, axis.label.value, axis.presentation.name, axis.order,
            )!!
            for (value in axis.values.sortedBy { it.order }) {
                val valueId = jdbc.queryForObject(
                    "INSERT INTO product_option_values(product_id,axis_id,code,label,swatch_color,sort_order) VALUES (?,?,?,?,?,?) RETURNING id",
                    Long::class.java, productId, axisId, value.code.value, value.label.value, value.swatchColor?.value, value.order,
                )!!
                valueIds[axis.code to value.code] = axisId to valueId
            }
        }
        assignments.forEach { (variantId, assignment) -> assignment.optionValues.forEach { (axisCode, valueCode) ->
            val ids = valueIds[axisCode to valueCode] ?: throw CatalogOptionInvalid("CATALOG_OPTION_ASSIGNMENTS_INVALID")
            jdbc.update("INSERT INTO variant_option_values(product_id,variant_id,axis_id,value_id) VALUES (?,?,?,?)", productId, variantId, ids.first, ids.second)
        } }
    }

    private fun productBySku(sku: String, lock: Boolean): ProductRow? = jdbc.query(
        "SELECT DISTINCT p.id,p.has_option_schema,p.option_schema_revision FROM products p JOIN product_variants v ON v.product_id=p.id WHERE v.sku=?" + if (lock) " FOR NO KEY UPDATE OF p" else "",
        { rs, _ -> product(rs) }, sku,
    ).singleOrNull()
    private fun productById(id: Long, lock: Boolean): ProductRow? = jdbc.query(
        "SELECT id,has_option_schema,option_schema_revision FROM products WHERE id=?" + if (lock) " FOR NO KEY UPDATE" else "",
        { rs, _ -> product(rs) }, id,
    ).singleOrNull()
    private fun product(rs: ResultSet) = ProductRow(rs.getLong("id"), rs.getBoolean("has_option_schema"), rs.getLong("option_schema_revision"))
    private fun lockVariants(productId: Long): List<VariantRow> = jdbc.query(
        "SELECT id,product_id,sku,label,active FROM product_variants WHERE product_id=? ORDER BY id FOR NO KEY UPDATE",
        { rs, _ -> VariantRow(rs.getLong("id"), rs.getLong("product_id"), rs.getString("sku"), rs.getString("label"), rs.getBoolean("active")) }, productId,
    )
    private fun audit(actor: Long, productId: Long, before: Long, after: Long, command: ProductOptionSchemaCommand) {
        val payload = mapOf(
            "operation" to command.operation.name,
            "previousRevision" to before,
            "resultingRevision" to after,
            "axisCodes" to command.axes.map { it.code.value },
            "axisCount" to command.axes.size,
            "assignmentCount" to command.assignments.size,
            "variantOperationCount" to command.variantOperations.size,
        )
        jdbc.update(
            "INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted) VALUES ('USER',?,'CATALOG_OPTION_SCHEMA_REPLACED','products',?,?::jsonb)",
            actor.toString(), productId, mapper.writeValueAsString(payload),
        )
    }

    private data class ProductRow(val id: Long, val present: Boolean, val revision: Long)
    private data class VariantRow(val id: Long, val productId: Long, val sku: String, val label: String, val active: Boolean)
    private data class StoredAxis(val id: Long, val code: String, val label: String, val presentation: String, val order: Int)
    private data class StoredValue(val id: Long, val code: String, val label: String, val swatchColor: String?, val order: Int)
    private data class AssignmentRow(val id: Long, val sku: String, val active: Boolean, val assignmentPresent: Boolean, val ownershipValid: Boolean, val axisCode: String?, val valueCode: String?)
}
