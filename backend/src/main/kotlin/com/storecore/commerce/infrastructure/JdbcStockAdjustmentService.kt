package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.StockAdjustmentUseCases
import com.storecore.commerce.domain.*
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.application.AuthorizationDenied
import com.storecore.identity.application.ResourceNotFound
import com.storecore.identity.domain.InternalUserPrincipal
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import java.security.MessageDigest
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@Service
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class JdbcStockAdjustmentService(
    private val jdbc: JdbcTemplate, private val transactions: TransactionTemplate,
    private val capabilities: CapabilityDecisionPort, private val mapper: ObjectMapper,
) : StockAdjustmentUseCases {
    private data class Stored(val actorId: Long, val variantId: Long, val hash: String, val content: String, val result: String, val at: Instant)
    private val codec = StockAdjustmentReceiptCodec(mapper)

    override fun adjust(actor: InternalUserPrincipal, command: AdjustAvailableStockCommand): StockAdjustmentExecution = transactions.execute {
        lockLiveActor(actor)
        capabilities.decide("MANUAL_FULFILLMENT", "MANAGE", CapabilityActor.Internal(actor))
        // Hash collisions merely serialize unrelated commands; UUID uniqueness remains authoritative.
        jdbc.query("SELECT pg_advisory_xact_lock(?)", { _, _ -> Unit }, command.commandId.mostSignificantBits xor command.commandId.leastSignificantBits)
        val content = mapper.writeValueAsString(listOf(command.variantId.toString(), command.quantityDelta,
            command.expected.available, command.expected.reserved, command.expected.safety, command.reason))
        val hash = MessageDigest.getInstance("SHA-256").digest(content.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
        val existing = stored(command.commandId)
        if (existing != null) {
            if (existing.actorId != actor.userId || existing.variantId != command.variantId || existing.hash != hash || mapper.readTree(existing.content) != mapper.readTree(content))
                return@execute StockAdjustmentExecution.Invalid(StockAdjustmentRequestError.IDEMPOTENCY_CONFLICT)
            return@execute StockAdjustmentExecution.Recorded(codec.decode(existing.result, command.commandId, command.variantId, existing.at))
        }
        if (jdbc.query("SELECT id FROM product_variants WHERE id=?", { rs, _ -> rs.getLong(1) }, command.variantId).isEmpty()) throw ResourceNotFound()
        val before = jdbc.query("SELECT available_quantity,reserved_quantity,safety_stock FROM inventory_balances WHERE variant_id=? FOR UPDATE",
            { rs, _ -> StockBalanceSnapshot(rs.getInt(1), rs.getInt(2), rs.getInt(3)) }, command.variantId).singleOrNull()
        val rejected = ApplyAvailableStockAdjustment.reject(command, before)
        val at = Instant.now().truncatedTo(ChronoUnit.MICROS)
        val receipt = if (rejected != null) {
            StockAdjustmentReceipt(command.commandId, command.variantId.toString(), StockAdjustmentState.REJECTED, rejected, before, null, null, at)
        } else {
            val after = before!!.copy(available = (before.available.toLong() + command.quantityDelta).toInt())
            jdbc.update("UPDATE inventory_balances SET available_quantity=?,updated_at=now() WHERE variant_id=?", after.available, command.variantId)
            val ledger = jdbc.queryForObject("INSERT INTO inventory_ledger(variant_id,event_idempotency_key,event_type,channel,quantity_delta,actor) VALUES (?,?,'ADJUSTMENT','INTERNAL',?,?) RETURNING id",
                Long::class.java, command.variantId, UUID.nameUUIDFromBytes("STOCK_ADJUSTMENT:${command.commandId}".toByteArray(Charsets.UTF_8)), command.quantityDelta, "USER:${actor.userId}")!!
            jdbc.update("INSERT INTO audit_events(actor_type,actor_id,event_type,aggregate_type,aggregate_id,payload_redacted) VALUES ('USER',?,'INVENTORY_ADJUSTED','INVENTORY_VARIANT',?,?::jsonb)",
                actor.userId.toString(), command.variantId, mapper.writeValueAsString(mapOf("commandId" to command.commandId, "ledgerId" to ledger, "quantityDelta" to command.quantityDelta, "reason" to command.reason, "before" to before, "after" to after)))
            StockAdjustmentReceipt(command.commandId, command.variantId.toString(), StockAdjustmentState.APPLIED, null, before, after, ledger.toString(), at)
        }
        jdbc.update("INSERT INTO inventory_adjustment_commands(command_id,actor_id,variant_id,request_hash,request_content,state,rejection_reason,ledger_id,recorded_at,result) VALUES (?,?,?,?,?::jsonb,?,?,?,?,?::jsonb)",
            command.commandId, actor.userId, command.variantId, hash, content, receipt.state.name, receipt.reason?.name, receipt.ledgerId?.toLong(), java.sql.Timestamp.from(at), mapper.writeValueAsString(receipt))
        StockAdjustmentExecution.Recorded(receipt)
    }!!

    override fun lookup(actor: InternalUserPrincipal, variantId: Long, commandId: UUID): StockAdjustmentLookup = transactions.execute {
        lockLiveActor(actor)
        capabilities.decide("MANUAL_FULFILLMENT", "READ", CapabilityActor.Internal(actor))
        val existing = stored(commandId)
        if (existing == null || existing.actorId != actor.userId || existing.variantId != variantId) StockAdjustmentLookup(StockAdjustmentLookupState.NOT_FOUND)
        else StockAdjustmentLookup(StockAdjustmentLookupState.FOUND, codec.decode(existing.result, commandId, variantId, existing.at))
    }!!

    private fun stored(commandId: UUID) = jdbc.query("SELECT actor_id,variant_id,request_hash,request_content::text,result::text,recorded_at FROM inventory_adjustment_commands WHERE command_id=?",
        { rs, _ -> Stored(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getTimestamp(6).toInstant()) }, commandId).singleOrNull()

    /** Shares locks with deactivation and role removal until outer CSRF transaction commits. */
    private fun lockLiveActor(actor: InternalUserPrincipal) {
        val live = jdbc.queryForList("SELECT r.code FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles r ON r.id=ur.role_id WHERE u.id=? AND u.active AND r.code IN ('ADMIN','OPERATOR') FOR SHARE OF u,ur,r", actor.userId)
        if (live.isEmpty()) throw AuthorizationDenied()
    }
}
