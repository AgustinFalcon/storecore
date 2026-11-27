package com.storecore.loyalty.infrastructure

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.loyalty.application.*
import com.storecore.loyalty.domain.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.ResultSetExtractor
import java.time.DateTimeException
import java.time.Instant
import java.util.UUID

/** Explicitly constructed read-only adapter; no production capability or Spring registration. */
class JdbcLoyaltyWalletRepository(private val jdbc: JdbcTemplate) : LoyaltyWalletRepository, LoyaltyCommandPort {
    private val snapshots = HistoricalLoyaltySnapshotDecoder()

    override fun findByCustomer(customerId: Long, now: Instant): LoyaltyWalletRead = jdbc.query(
        """SELECT w.id AS wallet_id,w.customer_id,w.owner_realm,w.revision,w.policy_version AS wallet_policy,
            l.id AS lot_id,l.wallet_id AS lot_wallet_id,l.accepted_at,l.expires_at,l.policy_version AS lot_policy,l.issued,
            p.issued AS partition_issued,p.free,p.held,p.redeemed,p.expired,p.reversed
            FROM public.loyalty_wallets w
            LEFT JOIN public.loyalty_lots l ON l.wallet_id=w.id
            LEFT JOIN public.loyalty_lot_partitions p ON p.lot_id=l.id AND p.wallet_id=l.wallet_id
            WHERE w.customer_id=? ORDER BY l.accepted_at,l.id""",
        ResultSetExtractor<LoyaltyWalletRead> { rs ->
            if (!rs.next()) return@ResultSetExtractor LoyaltyWalletRead.Unavailable(LoyaltyWalletUnavailableReason.NOT_FOUND)
            val wallet = LoyaltyPersistedWallet(rs.getLong("wallet_id"), rs.getLong("customer_id"),
                rs.getString("owner_realm"), rs.getString("revision"), rs.getString("wallet_policy"))
            val lots = mutableListOf<LoyaltyPersistedLot>()
            do {
                if (rs.getObject("lot_id") != null) {
                    lots += LoyaltyPersistedLot(rs.getLong("lot_id"), rs.getLong("lot_wallet_id"),
                        rs.getTimestamp("accepted_at").toInstant(), rs.getTimestamp("expires_at").toInstant(), rs.getString("lot_policy"),
                        rs.getString("issued").takeIf { it == rs.getString("partition_issued") },
                        rs.getString("free"), rs.getString("held"), rs.getString("redeemed"), rs.getString("expired"), rs.getString("reversed"))
                }
            } while (rs.next())
            LoyaltyWalletTranslator.fromWire(wallet, lots, now)
        }, customerId)!!

    override fun findReceipt(commandId: UUID, realm: LoyaltyRealm, actorId: Long): LoyaltyCommandReceipt? = jdbc.query(
        """SELECT b.command_id,b.realm,b.actor_id,b.operation,b.aggregate_type,b.aggregate_ref,b.request_hash,
            r.outcome,r.original_http_status,r.before_snapshot::text,r.after_snapshot::text,r.recorded_at
            FROM public.loyalty_command_bindings b JOIN public.loyalty_command_receipts r ON r.command_id=b.command_id
            WHERE b.command_id=? AND b.realm=? AND b.actor_id=?""",
        ResultSetExtractor<LoyaltyCommandReceipt?> { rs ->
            if (!rs.next()) return@ResultSetExtractor null
            val binding = LoyaltyCommandBinding.create(rs.getObject("command_id", UUID::class.java),
                LoyaltyRealm.fromWire(rs.getString("realm")), rs.getLong("actor_id"),
                LoyaltyCommandOperation.fromWire(rs.getString("operation")), LoyaltyAggregateType.fromWire(rs.getString("aggregate_type")),
                rs.getString("aggregate_ref"), LoyaltyFingerprint.fromWire(rs.getString("request_hash")) ?: return@ResultSetExtractor null)
                ?: return@ResultSetExtractor null
            val recordedAt = rs.getTimestamp("recorded_at").toInstant()
            val before = snapshots.decode(rs.getString("before_snapshot"), recordedAt) ?: return@ResultSetExtractor null
            val after = snapshots.decode(rs.getString("after_snapshot"), recordedAt) ?: return@ResultSetExtractor null
            LoyaltyCommandReceipt.create(binding, LoyaltyOutcome.fromWire(rs.getString("outcome")),
                LoyaltyReceiptStatus.fromWire(rs.getInt("original_http_status")), before, after, recordedAt)
        }, commandId, realm.wire, actorId)
}

/** Version 1 stores canonical wallet/lot evidence, so historical derived values use the same domain translator. */
private class HistoricalLoyaltySnapshotDecoder {
    private val mapper = ObjectMapper().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
    private class InvalidSnapshot : RuntimeException()

    fun decode(raw: String, recordedAt: Instant): LoyaltyWalletSnapshot? = try {
        val root = mapper.readTree(raw)
        root.fieldsExactly("schemaVersion", "walletId", "customerId", "ownerRealm", "revision", "policyVersion", "at", "lots")
        if (!root["schemaVersion"].isIntegralNumber || root["schemaVersion"].asText() != "1") throw InvalidSnapshot()
        val at = root.instant("at")
        if (at > recordedAt || !root["lots"].isArray) throw InvalidSnapshot()
        val wallet = LoyaltyPersistedWallet(root.id("walletId"), root.id("customerId"), root.text("ownerRealm"),
            root.text("revision"), root.text("policyVersion"))
        val lots = root["lots"].map { lot ->
            lot.fieldsExactly("id", "walletId", "acceptedAt", "expiresAt", "policyVersion", "issued", "free", "held", "redeemed", "expired", "reversed")
            LoyaltyPersistedLot(lot.id("id"), lot.id("walletId"), lot.instant("acceptedAt"), lot.instant("expiresAt"),
                lot.text("policyVersion"), lot.text("issued"), lot.text("free"), lot.text("held"), lot.text("redeemed"), lot.text("expired"), lot.text("reversed"))
        }
        (LoyaltyWalletTranslator.fromWire(wallet, lots, at) as? LoyaltyWalletRead.Available)?.snapshot
    } catch (_: InvalidSnapshot) { null
    } catch (_: JsonProcessingException) { null
    } catch (_: DateTimeException) { null }

    private fun JsonNode.fieldsExactly(vararg names: String) {
        if (!isObject || fieldNames().asSequence().toSet() != names.toSet()) throw InvalidSnapshot()
    }
    private fun JsonNode.text(name: String): String = get(name)?.takeIf { it.isTextual }?.textValue() ?: throw InvalidSnapshot()
    private fun JsonNode.id(name: String): Long = LoyaltyPoints.fromWire(text(name))?.value?.takeIf { it > 0 } ?: throw InvalidSnapshot()
    private fun JsonNode.instant(name: String): Instant = Instant.parse(text(name)).also {
        if (it.nano != 0 || it.toString() != text(name)) throw InvalidSnapshot()
    }
}
