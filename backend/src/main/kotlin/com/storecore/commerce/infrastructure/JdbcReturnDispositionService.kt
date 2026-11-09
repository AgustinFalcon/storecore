package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.ReturnDispositionRejected
import com.storecore.commerce.domain.*
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.application.AuthorizationDenied
import com.storecore.identity.application.ResourceNotFound
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.dao.DuplicateKeyException
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID

data class ReturnDispositionLineView(
    val returnItemId: String, val orderItemId: String, val sku: String, val name: String, val quantity: Int,
    val restockQuantity: Int? = null, val damagedQuantity: Int? = null, val rejectedQuantity: Int? = null,
    val damageReason: DamageReason? = null, val rejectionReason: RejectionReason? = null, val observation: String? = null,
)
data class ReturnDispositionResult(val confirmedAt: String, val lines: List<ReturnDispositionLineView>)
data class ReturnDispositionView(
    val orderId: String, val returnId: String?, val state: ReturnDispositionState,
    val lines: List<ReturnDispositionLineView>, val result: ReturnDispositionResult? = null,
)

/** Coordinates the order lock, inspection and inventory effects in one transaction. */
@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcReturnDispositionService(
    private val jdbc: JdbcTemplate, private val capabilities: CapabilityDecisionPort,
    private val evidence: JdbcFulfillmentEvidence, private val records: JdbcFulfillmentRecords,
    private val transactions: TransactionTemplate, private val mapper: ObjectMapper,
) {
    private data class Received(val id: Long, val status: RmaStatus, val legacyInspection: InspectionOutcome)
    private data class Item(val view: ReturnDispositionLineView, val variantId: Long, val orderId: Long, val soldQuantity: Int, val commandId: Long?, val legacyLedger: Long?)
    private data class Applied(val returnId: Long, val key: UUID, val hash: String, val result: String)

    fun read(actor: InternalUserPrincipal, orderId: Long): ReturnDispositionView = transactions.execute {
        capabilities.decide("MANUAL_FULFILLMENT", "READ", CapabilityActor.Internal(actor))
        lockOrder(orderId, write = false)
        current(orderId)
    }!!

    fun confirm(actor: InternalUserPrincipal, orderId: Long, command: ReturnDispositionCommand): ReturnDispositionView {
      try {
       return transactions.execute {
        lockLiveActor(actor)
        capabilities.decide("MANUAL_FULFILLMENT", "MANAGE", CapabilityActor.Internal(actor))
        lockOrder(orderId, write = true)
        // The aggregate lock may have waited. Re-check against the locked live
        // authority before any durable command or inventory effect is written.
        lockLiveActor(actor)
        val received = received(orderId) ?: reject(DispositionRejection.RETURN_NOT_RECEIVED)
        val hash = hash(command)
        val applied = jdbc.query(
            "SELECT return_id,idempotency_key,request_hash,result::text FROM rma_disposition_commands WHERE return_id=? OR idempotency_key=?",
            { rs, _ -> Applied(rs.getLong("return_id"), rs.getObject("idempotency_key", UUID::class.java), rs.getString("request_hash"), rs.getString("result")) },
            received.id, command.idempotencyKey,
        )
        if (applied.isNotEmpty()) {
            val original = applied.singleOrNull() ?: reject(DispositionRejection.IDEMPOTENCY_CONFLICT)
            if (original.returnId != received.id || original.key != command.idempotencyKey || original.hash != hash) reject(DispositionRejection.IDEMPOTENCY_CONFLICT)
            return@execute decodeResult(original.result)
        }
        ApplyReturnDisposition.reject(received.status, records.shipmentStatus(orderId), FulfillmentPolicy.evaluate(evidence.load(orderId)))?.let(::reject)
        jdbc.query("SELECT id FROM returns WHERE id=? FOR UPDATE", { rs, _ -> rs.getLong(1) }, received.id)
        val items = items(received.id, lock = true)
        if (!complete(orderId, items) || received.legacyInspection != InspectionOutcome.NOT_RECORDED || items.any { it.commandId != null || it.legacyLedger != null }) reject(DispositionRejection.HISTORICAL_INCOMPLETE)
        InspectReturn.reject(items.associate { it.view.returnItemId.toLong() to it.view.quantity }, command.lines)?.let(::reject)
        val byId = command.lines.associateBy { it.returnItemId }
        items.map { it.variantId }.distinct().sorted().forEach { variantId ->
            val available = jdbc.query("SELECT available_quantity FROM inventory_balances WHERE variant_id=? FOR UPDATE", { rs, _ -> rs.getInt(1) }, variantId).singleOrNull() ?: reject(DispositionRejection.EVIDENCE_UNAVAILABLE)
            val restored = items.filter { it.variantId == variantId }.sumOf { byId.getValue(it.view.returnItemId.toLong()).quantities.restock.toLong() }
            if (available.toLong() + restored > Int.MAX_VALUE) reject(DispositionRejection.INVALID_PARTITION)
        }
        val confirmedAt = Instant.now()
        val resultLines = items.map { item ->
            val line = byId.getValue(item.view.returnItemId.toLong())
            item.view.copy(restockQuantity = line.quantities.restock, damagedQuantity = line.quantities.damaged, rejectedQuantity = line.quantities.rejected,
                damageReason = line.damageReason, rejectionReason = line.rejectionReason, observation = line.observation)
        }
        val result = ReturnDispositionView(orderId.toString(), received.id.toString(), ReturnDispositionState.CONFIRMED, resultLines, ReturnDispositionResult(confirmedAt.toString(), resultLines))
        val commandId = jdbc.queryForObject(
            "INSERT INTO rma_disposition_commands(return_id,idempotency_key,request_hash,actor_id,confirmed_at,result) VALUES (?,?,?,?,?,?::jsonb) RETURNING id",
            Long::class.java, received.id, command.idempotencyKey, hash, actor.userId, java.sql.Timestamp.from(confirmedAt), mapper.writeValueAsString(result),
        )!!
        items.forEach { item ->
            val line = byId.getValue(item.view.returnItemId.toLong())
            val restock = line.quantities.restock
            val ledgerId = if (restock > 0) {
                val ledger = jdbc.queryForObject(
                    "INSERT INTO inventory_ledger(variant_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,'RMA_RESTOCK','INTERNAL',?,?) RETURNING id",
                    Long::class.java, item.variantId, UUID.nameUUIDFromBytes("RMA_RESTOCK:${received.id}:${item.view.returnItemId}".toByteArray(Charsets.UTF_8)), restock, "USER:${actor.userId}",
                )!!
                jdbc.update("UPDATE inventory_balances SET available_quantity=available_quantity+?,updated_at=now() WHERE variant_id=?", restock, item.variantId)
                ledger
            } else null
            jdbc.update(
                """UPDATE return_items SET disposition_command_id=?,restock_quantity=?,damaged_quantity=?,rejected_quantity=?,damage_reason=?,rejection_reason=?,inspection_observation=?,adjustment_ledger_id=? WHERE id=? AND return_id=?""",
                commandId, restock, line.quantities.damaged, line.quantities.rejected, line.damageReason?.name, line.rejectionReason?.name, line.observation, ledgerId, line.returnItemId, received.id,
            )
            jdbc.update(
                """INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted) VALUES ('USER',?,'RMA_ITEM_DISPOSED','RETURN_ITEM',?,?::jsonb)""",
                actor.userId.toString(), line.returnItemId, mapper.writeValueAsString(mapOf("returnId" to received.id, "commandId" to commandId, "restockQuantity" to restock, "damagedQuantity" to line.quantities.damaged, "rejectedQuantity" to line.quantities.rejected, "damageReason" to line.damageReason, "rejectionReason" to line.rejectionReason, "ledgerId" to ledgerId)),
            )
        }
        jdbc.update("UPDATE returns SET status=?,updated_at=now() WHERE id=?", RmaStatus.CLOSED.name, received.id)
        result
       }!!
      } catch (_: DuplicateKeyException) {
        // Same-order retries serialize before lookup on the order lock and replay
        // above. Only different orders can race on the globally unique key;
        // such a key belongs to another RMA and must never replay its result.
        reject(DispositionRejection.IDEMPOTENCY_CONFLICT)
      }
    }

    private fun current(orderId: Long): ReturnDispositionView {
        val received = received(orderId) ?: return ReturnDispositionView(orderId.toString(), null, ReturnDispositionState.UNAVAILABLE, emptyList())
        val durable = jdbc.query("SELECT result::text FROM rma_disposition_commands WHERE return_id=?", { rs, _ -> rs.getString(1) }, received.id).singleOrNull()
        if (durable != null) return decodeResult(durable)
        val items = items(received.id, lock = false)
        val state = when {
            received.status in listOf(RmaStatus.INSPECTED, RmaStatus.CLOSED) || received.legacyInspection != InspectionOutcome.NOT_RECORDED || items.any { it.commandId != null || it.legacyLedger != null } -> ReturnDispositionState.HISTORICAL_INCOMPLETE
            complete(orderId, items) && ApplyReturnDisposition.reject(received.status, records.shipmentStatus(orderId), FulfillmentPolicy.evaluate(evidence.load(orderId))) == null -> ReturnDispositionState.EDITABLE
            else -> ReturnDispositionState.UNAVAILABLE
        }
        return ReturnDispositionView(orderId.toString(), received.id.toString(), state, items.map { it.view })
    }
    private fun received(orderId: Long) = jdbc.query("SELECT id,status,inspection_result FROM returns WHERE order_id=? ORDER BY id", { rs, _ -> Received(rs.getLong("id"), RmaStatus.fromWire(rs.getString("status")), InspectionOutcome.fromWire(rs.getString("inspection_result"))) }, orderId).singleOrNull()
    private fun items(returnId: Long, lock: Boolean): List<Item> = jdbc.query(
        """SELECT ri.*,oi.order_id,oi.quantity sold_quantity,oi.variant_id,COALESCE(oi.product_snapshot->>'sku',v.sku) sku,COALESCE(oi.product_snapshot->>'name',v.label) item_name
           FROM return_items ri JOIN order_items oi ON oi.id=ri.order_item_id JOIN product_variants v ON v.id=oi.variant_id
           WHERE ri.return_id=? ORDER BY ri.id ${if (lock) "FOR UPDATE OF ri" else ""}""",
        { rs, _ -> Item(ReturnDispositionLineView(rs.getLong("id").toString(), rs.getLong("order_item_id").toString(), rs.getString("sku"), rs.getString("item_name"), rs.getInt("quantity")), rs.getLong("variant_id"), rs.getLong("order_id"), rs.getInt("sold_quantity"), rs.getObject("disposition_command_id")?.let { (it as Number).toLong() }, rs.getObject("adjustment_ledger_id")?.let { (it as Number).toLong() }) }, returnId,
    )
    private fun complete(orderId: Long, items: List<Item>): Boolean {
        val expected = jdbc.query("SELECT id,quantity FROM order_items WHERE order_id=? ORDER BY id", { rs, _ -> rs.getLong("id") to rs.getInt("quantity") }, orderId).toMap()
        return expected.isNotEmpty() && items.size == expected.size && items.map { it.view.orderItemId.toLong() }.distinct().size == items.size && items.all { it.orderId == orderId && it.view.quantity == it.soldQuantity && expected[it.view.orderItemId.toLong()] == it.view.quantity }
    }
    private fun lockOrder(orderId: Long, write: Boolean) {
        if (jdbc.query("SELECT id FROM orders WHERE id=? ${if (write) "FOR UPDATE" else "FOR SHARE"}", { rs, _ -> rs.getLong(1) }, orderId).isEmpty()) throw ResourceNotFound()
    }
    /**
     * Linearizes this mutation with user deactivation and role removal. The
     * surrounding transaction retains these row locks through CSRF rotation.
     */
    private fun lockLiveActor(actor: InternalUserPrincipal) {
        val live = jdbc.queryForList(
            """SELECT r.code FROM users u
               JOIN user_roles ur ON ur.user_id=u.id
               JOIN roles r ON r.id=ur.role_id
               WHERE u.id=? AND u.active AND r.code IN ('ADMIN','OPERATOR')
               FOR SHARE OF u,ur,r""",
            actor.userId,
        )
        if (live.isEmpty()) throw AuthorizationDenied()
    }
    private fun hash(command: ReturnDispositionCommand): String = MessageDigest.getInstance("SHA-256")
        .digest(mapper.writeValueAsBytes(command.lines.sortedBy { it.returnItemId })).joinToString("") { "%02x".format(it) }
    /** Stored results cross the same closed-type boundary as all other persistence reads. */
    private fun decodeResult(raw: String): ReturnDispositionView {
        val tree = mapper.readTree(raw)
        fun lines(node: JsonNode) = node.map { line -> ReturnDispositionLineView(line.path("returnItemId").asText(), line.path("orderItemId").asText(), line.path("sku").asText(), line.path("name").asText(), line.path("quantity").asInt(),
            line.path("restockQuantity").takeUnless { it.isNull || it.isMissingNode }?.asInt(), line.path("damagedQuantity").takeUnless { it.isNull || it.isMissingNode }?.asInt(), line.path("rejectedQuantity").takeUnless { it.isNull || it.isMissingNode }?.asInt(),
            line.path("damageReason").takeUnless { it.isNull || it.isMissingNode }?.asText()?.let(DamageReason::fromWire), line.path("rejectionReason").takeUnless { it.isNull || it.isMissingNode }?.asText()?.let(RejectionReason::fromWire), line.path("observation").takeUnless { it.isNull || it.isMissingNode }?.asText()) }
        val result = tree.path("result")
        return ReturnDispositionView(tree.path("orderId").asText(), tree.path("returnId").takeUnless { it.isNull || it.isMissingNode }?.asText(), ReturnDispositionState.fromWire(tree.path("state").asText()), lines(tree.path("lines")), result.takeUnless { it.isNull || it.isMissingNode }?.let { ReturnDispositionResult(it.path("confirmedAt").asText(), lines(it.path("lines"))) })
    }
    private fun reject(reason: DispositionRejection): Nothing = throw ReturnDispositionRejected(reason)
}
