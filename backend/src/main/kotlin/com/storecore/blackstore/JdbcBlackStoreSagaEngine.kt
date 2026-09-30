package com.storecore.blackstore

import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionBridgePort
import com.storecore.blackstore.application.port.BlackStoreSagaPort
import com.storecore.blackstore.application.port.PosCompanionGuardPort
import com.storecore.blackstore.domain.RequestHashAlgorithm
import com.storecore.blackstore.domain.VerifiedCompanionPrincipal
import com.storecore.catalog.application.port.output.PriceQuotePort
import com.storecore.catalog.domain.PriceVersion
import com.storecore.commerce.domain.ProjectionSourceCause
import com.storecore.commerce.infrastructure.ChannelProjectionLockOrder
import org.springframework.dao.CannotAcquireLockException
import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Component
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.sql.Timestamp
import java.time.Duration
import java.time.Instant
import java.util.UUID

@Component
class JdbcBlackStoreSagaEngine(
    private val jdbc: JdbcTemplate,
    transactionManager: PlatformTransactionManager,
    private val projectionBridge: LegacyBlackStoreProjectionBridgePort,
    private val companionGuard: PosCompanionGuardPort,
    private val quotes: PriceQuotePort,
) : BlackStoreSagaPort {
    private val tx = TransactionTemplate(transactionManager).apply {
        isolationLevel = TransactionDefinition.ISOLATION_READ_COMMITTED
    }
    private val readTx = TransactionTemplate(transactionManager).apply {
        isolationLevel = TransactionDefinition.ISOLATION_REPEATABLE_READ
        isReadOnly = true
    }
    private val deniedAuditTx = TransactionTemplate(transactionManager).apply {
        isolationLevel = TransactionDefinition.ISOLATION_READ_COMMITTED
        propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
    }

    override fun reserve(
        principal: VerifiedCompanionPrincipal,
        quadruple: BlackStoreQuadruple,
        catalogVersion: String,
        lines: List<BlackStoreReserveLine>,
        override: PriceOverrideAttempt?,
    ): BlackStoreOperationReceipt {
        claimPending(principal, quadruple, catalogVersion, lines)
        return finishReserve(principal, quadruple, catalogVersion, lines, override)
    }

    fun claimPending(principal: VerifiedCompanionPrincipal, quadruple: BlackStoreQuadruple, catalogVersion: String, lines: List<BlackStoreReserveLine>): BlackStoreOperationReceipt {
        validateReserve(catalogVersion, lines)
        val requestHash = BlackStoreSagaPolicy.requestHashH2(catalogVersion, lines)
        return unwrapSaga {
        tx.execute {
            companionGuard.authorizeForEffect(principal, "STOCK_RESERVE")
            lockQuadruple(quadruple)
            rejectTombstone(quadruple)
            val existing = loadRow(quadruple, forUpdate = true)
            if (existing != null) {
                when (existing.state) {
                    "COMMITTED", "RELEASED" -> throw BlackStoreSagaException.stateConflict()
                    "EXPIRED" -> throw BlackStoreSagaException.expired()
                    else -> if (!hashMatches(existing, catalogVersion, lines)) throw BlackStoreSagaException.mismatch()
                }
                return@execute toReceipt(existing)
            }
            try {
                jdbc.update(
                    """
                    INSERT INTO blackstore_integration_operations(
                      client_instance_id, device_id, sale_id, operation_id, request_hash, request_hash_algorithm, catalog_version, state
                    ) VALUES (?,?,?,?,?,?,?,'PENDING')
                    """.trimIndent(),
                    quadruple.clientInstanceId,
                    quadruple.deviceId,
                    quadruple.saleId,
                    quadruple.operationId,
                    requestHash,
                    RequestHashAlgorithm.H2.wire,
                    catalogVersion,
                )
            } catch (_: DuplicateKeyException) {
                lockQuadruple(quadruple)
                rejectTombstone(quadruple)
                val raced = loadRow(quadruple, forUpdate = true) ?: throw BlackStoreSagaException.conflict()
                when (raced.state) {
                    "COMMITTED", "RELEASED" -> throw BlackStoreSagaException.stateConflict()
                    "EXPIRED" -> throw BlackStoreSagaException.expired()
                    else -> if (!hashMatches(raced, catalogVersion, lines)) throw BlackStoreSagaException.mismatch()
                }
                return@execute toReceipt(raced)
            }
            toReceipt(loadRow(quadruple, forUpdate = true)!!)
        }!!
        }
    }

    fun finishReserve(
        principal: VerifiedCompanionPrincipal,
        quadruple: BlackStoreQuadruple,
        catalogVersion: String,
        lines: List<BlackStoreReserveLine>,
        override: PriceOverrideAttempt? = null,
    ): BlackStoreOperationReceipt {
        validateReserve(catalogVersion, lines)
        val outcome = unwrapSaga {
        tx.execute {
            companionGuard.authorizeForEffect(principal, "STOCK_RESERVE")
            lockQuadruple(quadruple)
            rejectTombstone(quadruple)
            val existing = loadRow(quadruple, forUpdate = true) ?: throw BlackStoreSagaException.conflict()
            when (existing.state) {
                "COMMITTED", "RELEASED" -> throw BlackStoreSagaException.stateConflict()
                "EXPIRED" -> throw BlackStoreSagaException.expired()
                "RESERVED" -> {
                    if (!hashMatches(existing, catalogVersion, lines)) throw BlackStoreSagaException.mismatch()
                    return@execute TxOutcome(toReceipt(existing), null)
                }
                "PENDING" -> if (!hashMatches(existing, catalogVersion, lines)) throw BlackStoreSagaException.mismatch()
                else -> throw BlackStoreSagaException.stateConflict()
            }
            quotes.shareRevision()
            val asOf = quotes.clock()
            val liveCatalog = quotes.catalogVersion(asOf).wire
            val sorted = lines.sortedBy { it.variantId }
            ChannelProjectionLockOrder(jdbc).lockVariants(sorted.map { it.variantId })
            val quoted = quotes.quoteByVariantIds(asOf, sorted.map { it.variantId })
            val catalogStale = liveCatalog != catalogVersion
            val priceStale = sorted.any { line ->
                val livePrice = quoted[line.variantId]
                livePrice == null || PriceVersion.fromWire(line.priceVersion) !is PriceVersion.Quoted || line.priceVersion != livePrice.priceVersion.wire
            }
            if (catalogStale || priceStale) {
                when (val verdict = decideOverride(principal, quadruple, catalogVersion, sorted, quoted, override, liveCatalog, catalogStale)) {
                    OverrideVerdict.Missing, OverrideVerdict.QuoteMissing, OverrideVerdict.CatalogUnproven -> {
                        if (override != null) {
                            persistDeniedAudit(principal, quadruple, catalogVersion, sorted, quoted, override, liveCatalog, verdict.reasonCode)
                        }
                        deleteClaim(existing.id)
                        return@execute TxOutcome(null, BlackStoreSagaException.stale())
                    }
                    OverrideVerdict.ReasonInvalid, OverrideVerdict.RoleInvalid -> {
                        persistDeniedAudit(principal, quadruple, catalogVersion, sorted, quoted, override, liveCatalog, verdict.reasonCode)
                        deleteClaim(existing.id)
                        return@execute TxOutcome(null, BlackStoreSagaException.validation())
                    }
                    OverrideVerdict.ScopeDenied -> {
                        persistDeniedAudit(principal, quadruple, catalogVersion, sorted, quoted, override, liveCatalog, verdict.reasonCode)
                        throw com.storecore.blackstore.application.BlackStoreForbidden()
                    }
                    OverrideVerdict.Allowed -> {
                        companionGuard.authorizeForEffect(principal, "PRICE_OVERRIDE")
                        auditOverride(principal, quadruple, catalogVersion, sorted, quoted, override, liveCatalog, "ALLOWED", "OVERRIDE_ACCEPTED")
                    }
                }
            }
            val failures = mutableListOf<BlackStoreLineFailure>()
            val locked = lockBalances(sorted.map { it.variantId })
            sorted.forEachIndexed { index, line ->
                val stock = locked[line.variantId]
                if (stock == null || stock.sku != line.sku || !stock.active || stock.sku.length !in 1..64) {
                    deleteClaim(existing.id)
                    return@execute TxOutcome(null, BlackStoreSagaException.validation())
                }
                val sellable = maxOf(0, stock.available - stock.safety)
                if (line.quantity > sellable) {
                    failures += BlackStoreLineFailure(index, line.variantId, line.sku, line.quantity, sellable, "INSUFFICIENT_STOCK")
                }
            }
            if (failures.isNotEmpty()) {
                deleteClaim(existing.id)
                return@execute TxOutcome(null, BlackStoreSagaException.insufficient(failures))
            }
            val reservationRef = BlackStoreSagaPolicy.reservationRefFor(quadruple)
            val receipt = BlackStoreSagaPolicy.receiptFor(quadruple)
            val expiresAt = Instant.now().plusSeconds(BlackStoreSagaPolicy.RESERVATION_SECONDS)
            sorted.forEach { line ->
                val reservationKey = BlackStoreSagaPolicy.inventoryReservationKey(reservationRef, line.variantId)
                jdbc.update(
                    "UPDATE inventory_balances SET available_quantity=available_quantity-?, reserved_quantity=reserved_quantity+?, updated_at=now() WHERE variant_id=?",
                    line.quantity, line.quantity, line.variantId,
                )
                val reservationId = jdbc.queryForObject(
                    """
                    INSERT INTO inventory_reservations(variant_id, reservation_saga_key, reservation_line_key, quantity, status, expires_at)
                    VALUES (?,?,?,?,'ACTIVE',?) RETURNING id
                    """.trimIndent(),
                    Long::class.java,
                    line.variantId, reservationRef, reservationKey, line.quantity, Timestamp.from(expiresAt),
                )!!
                appendLedger(
                    variantId = line.variantId,
                    reservationId = reservationId,
                    eventType = "RESERVATION",
                    delta = -line.quantity,
                    key = BlackStoreSagaPolicy.ledgerKey(reservationRef, line.variantId, "RESERVATION"),
                    actor = actor(quadruple),
                )
                jdbc.update(
                    """
                    INSERT INTO blackstore_integration_reservation_lines(
                      operation_pk, reservation_ref, variant_id, sku, quantity, accepted_price_version,
                      inventory_reservation_operation_key, ledger_reserve_operation_key,
                      ledger_commit_operation_key, ledger_release_operation_key
                    ) VALUES (?,?,?,?,?,?,?,?,?,?)
                    """.trimIndent(),
                    existing.id,
                    reservationRef,
                    line.variantId,
                    line.sku,
                    line.quantity,
                    line.priceVersion,
                    reservationKey,
                    BlackStoreSagaPolicy.ledgerKey(reservationRef, line.variantId, "RESERVATION"),
                    BlackStoreSagaPolicy.ledgerKey(reservationRef, line.variantId, "STOCK_COMMIT_EXTERNAL"),
                    BlackStoreSagaPolicy.ledgerKey(reservationRef, line.variantId, "RELEASE"),
                )
            }
            jdbc.update(
                """
                UPDATE blackstore_integration_operations
                SET state='RESERVED', reservation_ref=?, receipt=?, expires_at=?, updated_at=now()
                WHERE id=?
                """.trimIndent(),
                reservationRef, receipt, Timestamp.from(expiresAt), existing.id,
            )
            TxOutcome(toReceipt(loadRow(quadruple, forUpdate = true)!!), null)
        }!!
        }
        outcome.error?.let { throw it }
        return outcome.receipt!!
    }

    override fun commit(principal: VerifiedCompanionPrincipal, quadruple: BlackStoreQuadruple): BlackStoreOperationReceipt =
        mutateReserved(quadruple, already = "COMMITTED", principal = principal, action = "STOCK_COMMIT") { row, lines ->
            lines.forEach { line ->
                val reservation = lockReservation(row.reservationRef!!, line.variantId)
                jdbc.update("UPDATE inventory_balances SET reserved_quantity=reserved_quantity-?, updated_at=now() WHERE variant_id=?", line.quantity, line.variantId)
                appendLedger(
                    variantId = line.variantId,
                    reservationId = reservation,
                    eventType = "STOCK_COMMIT_EXTERNAL",
                    delta = -line.quantity,
                    key = BlackStoreSagaPolicy.ledgerKey(row.reservationRef, line.variantId, "STOCK_COMMIT_EXTERNAL"),
                    actor = actor(quadruple),
                )
                jdbc.update("UPDATE inventory_reservations SET status='CONSUMED' WHERE id=?", reservation)
            }
            jdbc.update(
                "UPDATE blackstore_integration_operations SET state='COMMITTED', expires_at=NULL, updated_at=now() WHERE id=?",
                row.id,
            )
        }

    override fun release(principal: VerifiedCompanionPrincipal, quadruple: BlackStoreQuadruple): BlackStoreOperationReceipt =
        mutateReserved(quadruple, already = "RELEASED", principal = principal, action = "STOCK_RELEASE") { row, lines ->
            releaseStock(quadruple, row, lines, reservationStatus = "RELEASED", sagaState = "RELEASED")
        }

    override fun expireDue(limit: Int): Int {
        val candidates = jdbc.query(
            """
            SELECT client_instance_id, device_id, sale_id, operation_id
            FROM blackstore_integration_operations
            WHERE state='RESERVED' AND expires_at <= now()
            ORDER BY id
            LIMIT ?
            """.trimIndent(),
            { rs, _ ->
                BlackStoreQuadruple(
                    clientInstanceId = rs.getObject("client_instance_id", UUID::class.java),
                    deviceId = rs.getString("device_id"),
                    saleId = rs.getString("sale_id"),
                    operationId = rs.getObject("operation_id", UUID::class.java),
                )
            },
            limit,
        )
        var expired = 0
        candidates.forEach { quadruple ->
            try {
                mutateReserved(quadruple, already = "EXPIRED", skipLocked = true) { row, lines ->
                    releaseStock(quadruple, row, lines, reservationStatus = "EXPIRED", sagaState = "EXPIRED")
                }
                expired += 1
            } catch (_: BlackStoreSagaException) {
                // Commit or release won the saga lock.
            }
        }
        return expired
    }

    override fun deleteStalePending(): Int =
        jdbc.queryForObject("SELECT public.storecore_blackstore_delete_stale_pending()", Int::class.java) ?: 0

    override fun get(principal: VerifiedCompanionPrincipal, quadruple: BlackStoreQuadruple): BlackStoreOperationReceipt = unwrapSaga {
        readTx.execute {
            companionGuard.authorizeForRead(principal, "STOCK_READ")
            if (quadruple.clientInstanceId != principal.clientInstanceId) throw BlackStoreSagaException.notFound()
            rejectTombstone(quadruple)
            toReceipt(loadRow(quadruple, forUpdate = false) ?: throw BlackStoreSagaException.notFound())
        }!!
    }

    override fun reconcile(principal: VerifiedCompanionPrincipal, knownReceipts: List<String>): BlackStoreReconcileResult {
        if (knownReceipts.isEmpty() || knownReceipts.size > 500) throw BlackStoreSagaException.validation()
        val unique = knownReceipts.distinct()
        val placeholders = unique.joinToString(",") { "?" }
        return unwrapSaga {
        readTx.execute {
            companionGuard.authorizeForRead(principal, "STOCK_READ")
            val found = jdbc.query(
                """
                SELECT client_instance_id, device_id, sale_id, operation_id
                FROM blackstore_integration_operations
                WHERE receipt IN ($placeholders)
                  AND client_instance_id = ?
                """.trimIndent(),
                { rs, _ ->
                    BlackStoreQuadruple(
                        clientInstanceId = rs.getObject("client_instance_id", UUID::class.java),
                        deviceId = rs.getString("device_id"),
                        saleId = rs.getString("sale_id"),
                        operationId = rs.getObject("operation_id", UUID::class.java),
                    )
                },
                *unique.toTypedArray(),
                principal.clientInstanceId,
            ).map { get(principal, it) }
            val present = found.mapNotNull { it.receipt }.toSet()
            BlackStoreReconcileResult(present = found, unknownReceipts = unique.filterNot { it in present })
        }!!
        }
    }

    fun purge(quadruple: BlackStoreQuadruple) {
        unwrapSaga {
            tx.execute {
                try {
                    jdbc.query(
                        "SELECT public.storecore_blackstore_purge_terminal(?::uuid,?::varchar,?::varchar,?::uuid)",
                        { _, _ -> },
                        quadruple.clientInstanceId,
                        quadruple.deviceId,
                        quadruple.saleId,
                        quadruple.operationId,
                    )
                } catch (ex: RuntimeException) {
                    throw translateWorker(ex)
                }
            }
        }
    }

    override fun purgeDue(limit: Int): Int {
        val candidates = jdbc.query(
            """
            SELECT client_instance_id, device_id, sale_id, operation_id
            FROM blackstore_integration_operations
            WHERE state IN ('COMMITTED','RELEASED','EXPIRED')
              AND updated_at < now() - interval '90 days'
            ORDER BY id
            LIMIT ?
            """.trimIndent(),
            { rs, _ ->
                BlackStoreQuadruple(
                    clientInstanceId = rs.getObject("client_instance_id", UUID::class.java),
                    deviceId = rs.getString("device_id"),
                    saleId = rs.getString("sale_id"),
                    operationId = rs.getObject("operation_id", UUID::class.java),
                )
            },
            limit,
        )
        var purged = 0
        candidates.forEach { quadruple ->
            try {
                purge(quadruple)
                purged += 1
            } catch (_: BlackStoreSagaException) {
            }
        }
        return purged
    }

    private fun mutateReserved(
        quadruple: BlackStoreQuadruple,
        already: String,
        skipLocked: Boolean = false,
        principal: VerifiedCompanionPrincipal? = null,
        action: String? = null,
        body: (OperationRow, List<LineRow>) -> Unit,
    ): BlackStoreOperationReceipt = unwrapSaga {
        tx.execute {
        if (principal != null && action != null) {
            companionGuard.authorizeForEffect(principal, action)
        }
        lockQuadruple(quadruple)
        rejectTombstone(quadruple)
        val row = loadRow(quadruple, forUpdate = true, skipLocked = skipLocked) ?: throw BlackStoreSagaException.notFound()
        if (row.state == already) return@execute toReceipt(row)
        if (row.state == "EXPIRED" && already != "EXPIRED") throw BlackStoreSagaException.expired()
        if (row.state != "RESERVED") throw BlackStoreSagaException.stateConflict()
        val lines = loadLines(row.id)
        val variantIds = lines.map { it.variantId }
        val emit = ChannelProjectionLockOrder(jdbc).lockVariants(variantIds)
        lockBalances(variantIds)
        body(row, lines)
        if (emit) {
            projectionBridge.requestProjection(variantIds, projectionCause(already))
        }
        toReceipt(loadRow(quadruple, forUpdate = true)!!)
        }!!
    }

    private fun releaseStock(
        quadruple: BlackStoreQuadruple,
        row: OperationRow,
        lines: List<LineRow>,
        reservationStatus: String,
        sagaState: String,
    ) {
        lines.forEach { line ->
            val reservation = lockReservation(row.reservationRef!!, line.variantId)
            jdbc.update(
                "UPDATE inventory_balances SET available_quantity=available_quantity+?, reserved_quantity=reserved_quantity-?, updated_at=now() WHERE variant_id=?",
                line.quantity, line.quantity, line.variantId,
            )
            appendLedger(
                variantId = line.variantId,
                reservationId = reservation,
                eventType = "RELEASE",
                delta = line.quantity,
                key = BlackStoreSagaPolicy.ledgerKey(row.reservationRef, line.variantId, "RELEASE"),
                actor = actor(quadruple),
            )
            jdbc.update("UPDATE inventory_reservations SET status=? WHERE id=?", reservationStatus, reservation)
        }
        jdbc.update(
            "UPDATE blackstore_integration_operations SET state=?, updated_at=now() WHERE id=?",
            sagaState, row.id,
        )
    }

    private fun appendLedger(variantId: Long, reservationId: Long, eventType: String, delta: Int, key: UUID, actor: String) {
        jdbc.update(
            """
            INSERT INTO inventory_ledger(variant_id, reservation_id, event_idempotency_key, event_type, channel, quantity_delta, actor)
            VALUES (?,?,?,?, 'EXTERNAL_BLACKSTORE', ?, ?)
            """.trimIndent(),
            variantId, reservationId, key, eventType, delta, actor,
        )
    }

    private fun lockReservation(reservationRef: UUID, variantId: Long): Long =
        jdbc.query(
            "SELECT id FROM inventory_reservations WHERE reservation_saga_key=? AND variant_id=? AND status='ACTIVE' FOR UPDATE",
            { rs, _ -> rs.getLong("id") },
            reservationRef,
            variantId,
        ).singleOrNull() ?: throw BlackStoreSagaException.conflict()

    private fun lockBalances(variantIds: List<Long>): Map<Long, StockRow> {
        if (variantIds.isEmpty()) return emptyMap()
        val placeholders = variantIds.joinToString(",") { "?" }
        jdbc.query(
            "SELECT variant_id FROM inventory_balances WHERE variant_id IN ($placeholders) ORDER BY variant_id ASC FOR UPDATE",
            { _, _ -> },
            *variantIds.toTypedArray(),
        )
        return jdbc.query(
            """
            SELECT v.id AS variant_id, COALESCE(i.available_quantity, 0) AS available_quantity,
                   COALESCE(i.safety_stock, 0) AS safety_stock, v.sku, v.active, p.id AS product_id, p.status
            FROM product_variants v
            JOIN products p ON p.id = v.product_id
            LEFT JOIN inventory_balances i ON i.variant_id = v.id
            WHERE v.id IN ($placeholders)
            ORDER BY v.id ASC
            FOR UPDATE OF v
            """.trimIndent(),
            { rs, _ ->
                StockRow(
                    variantId = rs.getLong("variant_id"),
                    available = rs.getInt("available_quantity"),
                    safety = rs.getInt("safety_stock"),
                    sku = rs.getString("sku"),
                    active = rs.getBoolean("active") && rs.getString("status") == "ACTIVE",
                    productId = rs.getLong("product_id"),
                )
            },
            *variantIds.toTypedArray(),
        ).associateBy { it.variantId }
    }

    private fun lockQuadruple(quadruple: BlackStoreQuadruple) {
        jdbc.query(
            "SELECT pg_advisory_xact_lock(hashtext(?), hashtext(?))",
            { _, _ -> },
            "${quadruple.clientInstanceId}|${quadruple.operationId}",
            "${quadruple.deviceId}|${quadruple.saleId}",
        )
    }

    private fun rejectTombstone(quadruple: BlackStoreQuadruple) {
        if (tombstoneExists(quadruple)) throw BlackStoreSagaException.retired()
    }

    private fun tombstoneExists(quadruple: BlackStoreQuadruple): Boolean =
        jdbc.queryForObject(
            """
            SELECT EXISTS(
              SELECT 1 FROM blackstore_integration_operation_tombstones
              WHERE client_instance_id=? AND device_id=? AND sale_id=? AND operation_id=?
            )
            """.trimIndent(),
            Boolean::class.java,
            quadruple.clientInstanceId,
            quadruple.deviceId,
            quadruple.saleId,
            quadruple.operationId,
        ) == true

    private fun deleteClaim(operationPk: Long) {
        jdbc.update("DELETE FROM blackstore_integration_reservation_lines WHERE operation_pk=?", operationPk)
        jdbc.update("DELETE FROM blackstore_integration_operations WHERE id=?", operationPk)
    }

    private fun loadRow(quadruple: BlackStoreQuadruple, forUpdate: Boolean, skipLocked: Boolean = false): OperationRow? {
        val suffix = when {
            forUpdate && skipLocked -> " FOR UPDATE SKIP LOCKED"
            forUpdate -> " FOR UPDATE"
            else -> ""
        }
        return jdbc.query(
            """
            SELECT id, request_hash, request_hash_algorithm, catalog_version, state, reservation_ref, receipt, expires_at, updated_at
            FROM blackstore_integration_operations
            WHERE client_instance_id=? AND device_id=? AND sale_id=? AND operation_id=?
            $suffix
            """.trimIndent(),
            { rs, _ ->
                OperationRow(
                    id = rs.getLong("id"),
                    requestHash = rs.getString("request_hash"),
                    algorithm = RequestHashAlgorithm.fromWire(rs.getString("request_hash_algorithm")),
                    catalogVersion = rs.getString("catalog_version"),
                    state = rs.getString("state"),
                    reservationRef = rs.getObject("reservation_ref", UUID::class.java),
                    receipt = rs.getString("receipt"),
                    expiresAt = rs.getTimestamp("expires_at")?.toInstant(),
                    updatedAt = rs.getTimestamp("updated_at").toInstant(),
                )
            },
            quadruple.clientInstanceId,
            quadruple.deviceId,
            quadruple.saleId,
            quadruple.operationId,
        ).singleOrNull()
    }

    private fun loadLines(operationPk: Long): List<LineRow> =
        jdbc.query(
            """
            SELECT variant_id, sku, quantity, accepted_price_version
            FROM blackstore_integration_reservation_lines
            WHERE operation_pk=?
            ORDER BY variant_id
            """.trimIndent(),
            { rs, _ ->
                LineRow(
                    variantId = rs.getLong("variant_id"),
                    sku = rs.getString("sku"),
                    quantity = rs.getInt("quantity"),
                    priceVersion = rs.getString("accepted_price_version"),
                )
            },
            operationPk,
        )

    private fun toReceipt(row: OperationRow): BlackStoreOperationReceipt {
        val lines = if (row.state == "PENDING") emptyList() else loadLines(row.id)
        val availableAfter = if (row.state == "RESERVED" || row.state == "COMMITTED") {
            lines.map { line ->
                val sellable = jdbc.queryForObject(
                    "SELECT GREATEST(0, available_quantity - safety_stock) FROM inventory_balances WHERE variant_id=?",
                    Int::class.java,
                    line.variantId,
                ) ?: 0
                BlackStoreAvailableAfter(line.variantId, sellable)
            }
        } else {
            emptyList()
        }
        return BlackStoreOperationReceipt(
            state = row.state,
            catalogVersion = row.catalogVersion,
            receipt = row.receipt,
            reservationRef = row.reservationRef,
            expiresAt = row.expiresAt,
            acceptedPriceVersions = lines.map { BlackStoreAcceptedPrice(it.variantId, it.sku, it.priceVersion) },
            availableAfter = availableAfter,
        )
    }

    private fun validateReserve(catalogVersion: String, lines: List<BlackStoreReserveLine>) {
        if (catalogVersion.isBlank() || catalogVersion.length > 64) throw BlackStoreSagaException.validation()
        if (lines.isEmpty() || lines.size > 200) throw BlackStoreSagaException.validation()
        if (lines.map { it.variantId }.distinct().size != lines.size) throw BlackStoreSagaException.validation()
        lines.forEach { line ->
            if (line.quantity < 1 || line.sku.isBlank() || line.sku.length !in 1..64 || line.priceVersion.isBlank()) {
                throw BlackStoreSagaException.validation()
            }
        }
    }

    private fun hashMatches(row: OperationRow, catalogVersion: String, lines: List<BlackStoreReserveLine>): Boolean {
        return when (row.algorithm) {
            RequestHashAlgorithm.H2 -> row.requestHash.equals(BlackStoreSagaPolicy.requestHashH2(catalogVersion, lines), ignoreCase = true)
            RequestHashAlgorithm.H1 -> {
                if (!row.requestHash.equals(BlackStoreSagaPolicy.requestHash(catalogVersion, lines), ignoreCase = true)) return false
                if (row.state != "RESERVED" && row.state != "COMMITTED") return true
                val stored = loadLines(row.id)
                stored.size == lines.size && stored.all { saved ->
                    lines.any { line ->
                        line.variantId == saved.variantId && line.sku == saved.sku &&
                            line.quantity == saved.quantity && line.priceVersion == saved.priceVersion
                    }
                }
            }
            is RequestHashAlgorithm.Unknown -> false
        }
    }

    private fun decideOverride(
        principal: VerifiedCompanionPrincipal,
        quadruple: BlackStoreQuadruple,
        catalogRequested: String,
        lines: List<BlackStoreReserveLine>,
        quoted: Map<Long, com.storecore.catalog.domain.PriceQuote>,
        override: PriceOverrideAttempt?,
        liveCatalog: String,
        catalogStale: Boolean,
    ): OverrideVerdict {
        if (override == null) return OverrideVerdict.Missing
        if (override.reason.trim().length !in 3..500) return OverrideVerdict.ReasonInvalid
        val role = override.declaredRole?.trim().orEmpty()
        if (role.isNotEmpty() && role !in setOf("SUPERVISOR", "OWNER")) return OverrideVerdict.RoleInvalid
        try {
            companionGuard.authorizeForEffect(principal, "PRICE_OVERRIDE")
        } catch (_: com.storecore.blackstore.application.BlackStoreForbidden) {
            return OverrideVerdict.ScopeDenied
        } catch (_: com.storecore.blackstore.application.BlackStoreCapabilityDisabled) {
            return OverrideVerdict.ScopeDenied
        }
        val quotesOwned = lines.all { line ->
            jdbc.queryForObject(
                """
                SELECT COUNT(*) FROM blackstore_price_quotes
                 WHERE client_instance_id=? AND variant_id=? AND price_version=? AND expires_at > clock_timestamp()
                """.trimIndent(),
                Int::class.java,
                quadruple.clientInstanceId,
                line.variantId,
                line.priceVersion,
            )!! > 0
        }
        if (!quotesOwned) return OverrideVerdict.QuoteMissing
        if (catalogStale && !catalogIssuedToCompanion(quadruple.clientInstanceId, catalogRequested)) {
            return OverrideVerdict.CatalogUnproven
        }
        return OverrideVerdict.Allowed
    }

    private fun catalogIssuedToCompanion(clientInstanceId: UUID, catalogVersion: String): Boolean {
        val cursors = jdbc.queryForObject(
            "SELECT COUNT(*) FROM blackstore_catalog_cursors WHERE client_instance_id=? AND catalog_version=?",
            Int::class.java,
            clientInstanceId,
            catalogVersion,
        ) ?: 0
        val snapshots = jdbc.queryForObject(
            "SELECT COUNT(*) FROM blackstore_catalog_page_snapshots WHERE client_instance_id=? AND catalog_version=?",
            Int::class.java,
            clientInstanceId,
            catalogVersion,
        ) ?: 0
        return cursors + snapshots > 0
    }

    private fun persistDeniedAudit(
        principal: VerifiedCompanionPrincipal,
        quadruple: BlackStoreQuadruple,
        catalogRequested: String,
        lines: List<BlackStoreReserveLine>,
        quoted: Map<Long, com.storecore.catalog.domain.PriceQuote>,
        override: PriceOverrideAttempt?,
        liveCatalog: String,
        reasonCode: String,
    ) {
        deniedAuditTx.execute {
            auditOverride(principal, quadruple, catalogRequested, lines, quoted, override, liveCatalog, "DENIED", reasonCode)
        }
    }

    private fun auditOverride(
        principal: VerifiedCompanionPrincipal,
        quadruple: BlackStoreQuadruple,
        catalogRequested: String,
        lines: List<BlackStoreReserveLine>,
        quoted: Map<Long, com.storecore.catalog.domain.PriceQuote>,
        override: PriceOverrideAttempt?,
        liveCatalog: String,
        result: String,
        reasonCode: String,
    ) {
        val declaredRole = override?.declaredRole?.trim().orEmpty()
        val reason = jsonEscape(override?.reason?.trim().orEmpty().take(200))
        val lineJson = lines.joinToString(",", "[", "]") { line ->
            val live = quoted[line.variantId]?.priceVersion?.wire.orEmpty()
            """{"variantId":${line.variantId},"requested":"${jsonEscape(line.priceVersion)}","live":"${jsonEscape(live)}"}"""
        }
        val payload = """{"result":"$result","reasonCode":"$reasonCode","declaredRole":"${jsonEscape(declaredRole)}","serviceRole":"${jsonEscape(principal.serviceRole.wire)}","reason":"$reason","catalogRequested":"${jsonEscape(catalogRequested)}","liveCatalog":"${jsonEscape(liveCatalog)}","deviceId":"${jsonEscape(quadruple.deviceId)}","saleId":"${jsonEscape(quadruple.saleId)}","lines":$lineJson}"""
        jdbc.queryForObject(
            "SELECT public.storecore_blackstore_audit_override(?,?,?,?,?,?,?,?::jsonb)",
            Long::class.java,
            "BLACKSTORE_PRICE_OVERRIDE",
            "COMPANION",
            principal.clientInstanceId.toString(),
            "BLACKSTORE_OPERATION",
            0L,
            quadruple.operationId,
            reasonCode,
            payload,
        )
    }

    private fun jsonEscape(raw: String): String =
        raw.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ")

    private enum class OverrideVerdict(val reasonCode: String) {
        Missing(""),
        ReasonInvalid("REASON_INVALID"),
        RoleInvalid("ROLE_INVALID"),
        ScopeDenied("SCOPE_DENIED"),
        QuoteMissing("QUOTE_NOT_OWNED"),
        CatalogUnproven("CATALOG_NOT_ISSUED"),
        Allowed("OVERRIDE_ACCEPTED"),
    }

    private fun translateWorker(ex: Throwable): RuntimeException {
        var current: Throwable? = ex
        while (current != null) {
            val message = current.message.orEmpty()
            if (message.contains("OPERATION_RETIRED")) return BlackStoreSagaException.retired()
            if (message.contains("NOT_FOUND")) return BlackStoreSagaException.notFound()
            if (message.contains("OPERATION_STATE_CONFLICT")) return BlackStoreSagaException.stateConflict()
            if (message.contains("RETENTION_ACTIVE")) return BlackStoreSagaException("RETENTION_ACTIVE", 409, retryable = false)
            current = current.cause
        }
        return if (ex is RuntimeException) ex else RuntimeException(ex)
    }

    private fun projectionCause(already: String): ProjectionSourceCause = when (already) {
        "COMMITTED" -> ProjectionSourceCause.ExternalBlackStoreCommit
        "RELEASED" -> ProjectionSourceCause.ExternalBlackStoreRelease
        "EXPIRED" -> ProjectionSourceCause.ExternalBlackStoreExpiry
        else -> ProjectionSourceCause.Unknown
    }

    private fun actor(quadruple: BlackStoreQuadruple): String = "BLACKSTORE:${quadruple.clientInstanceId}"

    private fun <T> unwrapSaga(block: () -> T): T = try {
        block()
    } catch (ex: RuntimeException) {
        throw if (isRetryableLock(ex)) BlackStoreSagaException.conflict() else ex
    }

    private fun isRetryableLock(ex: Throwable): Boolean {
        var current: Throwable? = ex
        while (current != null) {
            if (current is CannotAcquireLockException) return true
            val message = current.message.orEmpty()
            if (message.contains("40P01") || message.contains("deadlock", ignoreCase = true)) return true
            current = current.cause
        }
        return false
    }

    private data class OperationRow(
        val id: Long,
        val algorithm: RequestHashAlgorithm,
        val requestHash: String,
        val catalogVersion: String,
        val state: String,
        val reservationRef: UUID?,
        val receipt: String?,
        val expiresAt: Instant?,
        val updatedAt: Instant,
    )

    private data class LineRow(
        val variantId: Long,
        val sku: String,
        val quantity: Int,
        val priceVersion: String,
    )

    private data class TxOutcome(
        val receipt: BlackStoreOperationReceipt?,
        val error: BlackStoreSagaException?,
    )

    private data class StockRow(
        val variantId: Long,
        val available: Int,
        val safety: Int,
        val sku: String,
        val active: Boolean,
        val productId: Long,
    )

    companion object {
        private val TERMINAL = setOf("COMMITTED", "RELEASED", "EXPIRED")
    }
}
