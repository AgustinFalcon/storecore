package com.storecore.blackstore

import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionBridgePort
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionResult
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.blackstore.domain.CompanionServiceRole
import com.storecore.blackstore.domain.VerifiedCompanionPrincipal
import com.storecore.blackstore.infrastructure.JdbcPosCompanionGuard
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException

class BlackStoreSagaEngineTest {
    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        private val client = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        private lateinit var jdbc: JdbcTemplate
        private lateinit var engine: JdbcBlackStoreSagaEngine
        private lateinit var catalog: JdbcBlackStoreCatalogQuery
        private lateinit var principal: VerifiedCompanionPrincipal

        @JvmStatic
        @BeforeAll
        fun start() {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
            val dataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
            jdbc = JdbcTemplate(dataSource)
            engine = JdbcBlackStoreSagaEngine(
                jdbc,
                DataSourceTransactionManager(dataSource),
                LegacyBlackStoreProjectionBridgePort { LegacyBlackStoreProjectionResult.NOT_ELIGIBLE },
                JdbcPosCompanionGuard(jdbc),
            )
            catalog = JdbcBlackStoreCatalogQuery(jdbc)
            jdbc.update(
                "INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Test', 'localhost', 'ARS') ON CONFLICT DO NOTHING",
            )
            jdbc.update("INSERT INTO blackstore_companions(client_instance_id, status) VALUES (?, 'ACTIVE')", client)
            val companionId = jdbc.queryForObject("SELECT id FROM blackstore_companions WHERE client_instance_id=?", Long::class.java, client)!!
            jdbc.update(
                """
                INSERT INTO blackstore_companion_credentials(
                  companion_id, credential_secret_ref, credential_version, status,
                  token_fingerprint, scopes, service_role, auth_ready
                ) VALUES (?, 'test-only:saga', 1, 'ACTIVE', ?, ?::text[], 'SERVICE', TRUE)
                """.trimIndent(),
                companionId,
                "a".repeat(64),
                "{catalog:read,stock:read,stock:reserve,stock:commit,stock:release}",
            )
            val credentialId = jdbc.queryForObject(
                "SELECT id FROM blackstore_companion_credentials WHERE companion_id=? AND credential_version=1",
                Long::class.java,
                companionId,
            )!!
            principal = VerifiedCompanionPrincipal.of(
                client,
                companionId,
                credentialId,
                1,
                CompanionServiceRole.SERVICE,
                setOf(
                    CompanionScope.CATALOG_READ,
                    CompanionScope.STOCK_READ,
                    CompanionScope.STOCK_RESERVE,
                    CompanionScope.STOCK_COMMIT,
                    CompanionScope.STOCK_RELEASE,
                ),
                CompanionLifecycleStatus.ACTIVE,
            )
            val adminId = jdbc.queryForObject(
                "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('bs-saga@example.com', '\$argon2id\$fixture', 'Bs', 'Saga') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id",
                Long::class.java,
            )!!
            jdbc.update("INSERT INTO user_roles(user_id, role_id) SELECT ?, id FROM roles WHERE code='ADMIN' ON CONFLICT DO NOTHING", adminId)
            val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", Int::class.java)!!
            JdbcCapabilityService(jdbc).changeState(
                InternalUserPrincipal(UUID.randomUUID(), adminId, setOf(InternalRole.ADMIN)),
                "BLACKSTORE_INTEGRATION",
                CapabilityState.ACTIVE,
                version,
                "saga engine temporary active",
                UUID.randomUUID(),
            )
            jdbc.update("INSERT INTO brands(name, slug) VALUES ('Saga', 'saga-brand')")
            jdbc.update("INSERT INTO categories(name, slug) VALUES ('SagaCat', 'saga-cat')")
        }

        @JvmStatic
        @AfterAll
        fun stop() = postgres.stop()
    }

    @Test
    fun `tx-a is visible and tx-b reserves then commit consumes reserved`() {
        val seeded = seedVariant("SKU-RSV-${UUID.randomUUID()}", available = 10, safety = 2)
        val q = quadruple()
        val pending = engine.claimPending(principal, q, seeded.catalogVersion, seeded.line(3))
        assertEquals("PENDING", pending.state)
        assertNull(pending.receipt)
        assertEquals("PENDING", engine.get(principal, q).state)
        val reserved = engine.finishReserve(principal, q, seeded.catalogVersion, seeded.line(3))
        assertEquals("RESERVED", reserved.state)
        assertEquals(reserved.receipt, engine.reserve(principal, q, seeded.catalogVersion, seeded.line(3)).receipt)
        assertEquals(5, sellable(seeded.variantId))
        assertEquals(3, reservedQty(seeded.variantId))
        val committed = engine.commit(principal, q)
        assertEquals("COMMITTED", committed.state)
        assertEquals(5, sellable(seeded.variantId))
        assertEquals(0, reservedQty(seeded.variantId))
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM inventory_ledger WHERE channel='EXTERNAL_BLACKSTORE' AND event_type='STOCK_COMMIT_EXTERNAL' AND quantity_delta=-3",
                Int::class.java,
            ),
        )
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE event_type='SALE' AND channel='EXTERNAL_BLACKSTORE'", Int::class.java))
        assertThrows(BlackStoreSagaException::class.java) { engine.reserve(principal, q, seeded.catalogVersion, seeded.line(1)) }.also {
            assertEquals("OPERATION_STATE_CONFLICT", it.message)
            assertEquals(409, it.httpStatus)
            assertEquals(false, it.retryable)
        }
        assertEquals("COMMITTED", engine.get(principal, q).state)
    }

    @Test
    fun `commit replay preserves full receipt ledger balances saga and reservation rows`() {
        val seeded = seedVariant("SKU-REPLAY-${UUID.randomUUID()}", available = 9, safety = 1)
        val q = quadruple()
        val reserved = engine.reserve(principal, q, seeded.catalogVersion, seeded.line(2))
        val committed = engine.commit(principal, q)

        assertEquals("COMMITTED", committed.state)
        assertTrue(committed.receipt != null)
        assertEquals(BlackStoreSagaPolicy.reservationRefFor(q), committed.reservationRef)
        assertEquals("CONSUMED", reservationStatus(q, seeded.variantId))
        val ledgerBeforeReplay = completeLedgerSnapshot(q)
        val balancesBeforeReplay = balanceSnapshot(seeded.variantId)
        val sagaBeforeReplay = operationSnapshot(q)
        val reservationsBeforeReplay = reservationSnapshot(q)
        assertEquals(2, ledgerBeforeReplay.size)
        assertEquals(1, reservationsBeforeReplay.size)

        val replayed = engine.commit(principal, q)

        assertEquals(committed, replayed)
        assertEquals(committed.receipt, replayed.receipt)
        assertEquals(committed.reservationRef, replayed.reservationRef)
        assertEquals(ledgerBeforeReplay, completeLedgerSnapshot(q))
        assertEquals(balancesBeforeReplay, balanceSnapshot(seeded.variantId))
        assertEquals(sagaBeforeReplay, operationSnapshot(q))
        assertEquals(reservationsBeforeReplay, reservationSnapshot(q))
        assertEquals("COMMITTED", engine.get(principal, q).state)
        assertEquals(1, reservationCount(q, seeded.variantId, "CONSUMED"))
        assertEquals(7, availableQty(seeded.variantId))
        assertEquals(0, reservedQty(seeded.variantId))
        assertEquals(6, sellable(seeded.variantId))
    }

    @Test
    fun `insufficient stock deletes pending claim`() {
        val seeded = seedVariant("SKU-INS-${UUID.randomUUID()}", available = 5, safety = 2)
        val q = quadruple()
            engine.claimPending(principal, q, seeded.catalogVersion, seeded.line(4))
        val error = assertThrows(BlackStoreSagaException::class.java) { engine.finishReserve(principal, q, seeded.catalogVersion, seeded.line(4)) }
        assertEquals("INSUFFICIENT_STOCK", error.message)
        val failure = error.lineFailures.single()
        assertEquals("INSUFFICIENT_STOCK", failure.code)
        assertEquals(4, failure.requested)
        assertEquals(3, failure.availableQuantity)
        assertThrows(BlackStoreSagaException::class.java) { engine.get(principal, q) }.also { assertEquals("NOT_FOUND", it.message) }
        assertEquals(3, sellable(seeded.variantId))
        assertEquals(0, reservedQty(seeded.variantId))
    }

    @Test
    fun `stale catalog deletes claim and payload mismatch keeps pending`() {
        val seeded = seedVariant("SKU-STL-${UUID.randomUUID()}", available = 8, safety = 0)
        val q = quadruple()
            engine.claimPending(principal, q, "stale-version", seeded.line(1))
        val stale = assertThrows(BlackStoreSagaException::class.java) { engine.finishReserve(principal, q, "stale-version", seeded.line(1)) }
        assertEquals("CATALOG_VERSION_STALE", stale.message)
        assertEquals(422, stale.httpStatus)
        val q2 = quadruple()
            engine.claimPending(principal, q2, seeded.catalogVersion, seeded.line(1))
        val mismatch = assertThrows(BlackStoreSagaException::class.java) { engine.finishReserve(principal, q2, seeded.catalogVersion, seeded.line(2)) }
        assertEquals("IDEMPOTENCY_PAYLOAD_MISMATCH", mismatch.message)
        assertEquals("PENDING", engine.get(principal, q2).state)
    }

    @Test
    fun `release and expiry restore sellable stock`() {
        val seeded = seedVariant("SKU-REL-${UUID.randomUUID()}", available = 6, safety = 1)
        val q = quadruple()
        engine.reserve(principal, q, seeded.catalogVersion, seeded.line(2))
        assertEquals(3, sellable(seeded.variantId))
        assertEquals("RELEASED", engine.release(principal, q).state)
        assertEquals(5, sellable(seeded.variantId))
        assertEquals(0, reservedQty(seeded.variantId))

        val q2 = quadruple()
        engine.reserve(principal, q2, seeded.catalogVersion, seeded.line(2))
        jdbc.update(
            "UPDATE blackstore_integration_operations SET expires_at = now() - interval '1 second' WHERE operation_id=?",
            q2.operationId,
        )
        assertEquals(1, engine.expireDue(100))
        assertEquals("EXPIRED", engine.get(principal, q2).state)
        assertEquals(5, sellable(seeded.variantId))
        val expiredCmd = assertThrows(BlackStoreSagaException::class.java) { engine.commit(principal, q2) }
        assertEquals("EXPIRED", expiredCmd.message)
    }

    @Test
    fun `tombstone blocks reserve and purge follows retention then 410`() {
        val seeded = seedVariant("SKU-PRG-${UUID.randomUUID()}", available = 4, safety = 0)
        val q = quadruple()
        val reserved = engine.reserve(principal, q, seeded.catalogVersion, seeded.line(1))
        engine.commit(principal, q)
        val early = assertThrows(BlackStoreSagaException::class.java) { engine.purge(q) }
        assertEquals("RETENTION_ACTIVE", early.message)
        jdbc.update("UPDATE blackstore_integration_operations SET updated_at = now() - interval '91 days' WHERE operation_id=?", q.operationId)
        engine.purge(q)
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operations WHERE operation_id=?", Int::class.java, q.operationId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operation_tombstones WHERE operation_id=?", Int::class.java, q.operationId))
        assertTrue(
            jdbc.queryForObject(
                "SELECT retention_until >= retired_at + interval '7 years' FROM blackstore_integration_operation_tombstones WHERE operation_id=?",
                Boolean::class.java,
                q.operationId,
            ) == true,
        )
        val retired = assertThrows(BlackStoreSagaException::class.java) { engine.get(principal, q) }
        assertEquals("OPERATION_RETIRED", retired.message)
        assertEquals(410, retired.httpStatus)
        assertEquals(false, retired.retryable)
        val retiredPost = assertThrows(BlackStoreSagaException::class.java) { engine.reserve(principal, q, seeded.catalogVersion, seeded.line(1)) }
        assertEquals("OPERATION_RETIRED", retiredPost.message)
        assertEquals(410, retiredPost.httpStatus)
        assertEquals(false, retiredPost.retryable)
        val reconcile = engine.reconcile(principal, listOf(reserved.receipt!!, "unknown-receipt"))
        assertTrue(reconcile.present.isEmpty())
        assertEquals(listOf(reserved.receipt, "unknown-receipt"), reconcile.unknownReceipts)
        assertTrue(
            (jdbc.queryForObject(
                "SELECT COUNT(*) FROM inventory_ledger WHERE channel='EXTERNAL_BLACKSTORE' AND event_type='STOCK_COMMIT_EXTERNAL'",
                Int::class.java,
            ) ?: 0) >= 1,
        )
    }

    @Test
    fun `catalog sellable nets safety and cursor expires on version change`() {
        val first = seedVariant("SKU-CAT-${UUID.randomUUID()}", available = 9, safety = 4)
        seedVariant("SKU-CAT-${UUID.randomUUID()}", available = 3, safety = 0)
        val page = catalog.readPage(client, cursor = null, pageSize = 200, includeCost = false)
        val item = page.items.single { it.variantId == first.variantId }
        assertEquals(5, item.availableQuantity)
        assertEquals("catalog-${first.productId}", item.priceVersion)
        assertEquals("ARS", item.currency)
        val stock = catalog.readStock(first.variantId)
        assertEquals(5, stock.availableQuantity)
        val firstPage = catalog.readPage(client, cursor = null, pageSize = 1, includeCost = false)
        assertEquals(1, firstPage.items.size)
        assertTrue(firstPage.nextCursor != null)
        jdbc.update("UPDATE products SET name = name || 'x', updated_at = now() WHERE id=?", first.productId)
        assertEquals("CURSOR_EXPIRED", assertThrows(BlackStoreSagaException::class.java) {
            catalog.readPage(client, cursor = firstPage.nextCursor, pageSize = 1, includeCost = false)
        }.message)
        assertEquals("COST_SCOPE_REQUIRED", assertThrows(BlackStoreSagaException::class.java) {
            catalog.readPage(client, cursor = null, pageSize = 200, includeCost = true)
        }.also {
            assertEquals(403, it.httpStatus)
            assertFalse(it.retryable)
        }.message)
        val overrideDenied = assertThrows(BlackStoreSagaException::class.java) {
            engine.reserve(principal, quadruple(), catalog.currentCatalogVersion(), listOf(BlackStoreReserveLine(first.variantId, first.sku, 1, "price-override")))
        }
        assertTrue(overrideDenied.lineFailures.any { it.code == "PRICE_VERSION_MISMATCH" })
        assertEquals(409, overrideDenied.httpStatus)
    }

    @Test
    fun `concurrent identical quadruple yields one receipt`() {
        val seeded = seedVariant("SKU-CON-${UUID.randomUUID()}", available = 6, safety = 0)
        val q = quadruple()
        val pool = Executors.newFixedThreadPool(2)
        val start = CountDownLatch(1)
        val futures = mutableListOf<Future<SagaAttempt<BlackStoreOperationReceipt>>>()
        val attempts = try {
            repeat(2) {
                futures += pool.submit<SagaAttempt<BlackStoreOperationReceipt>> {
                    start.await()
                    captureSagaAttempt { engine.reserve(principal, q, seeded.catalogVersion, seeded.line(2)) }
                }
            }
            start.countDown()
            awaitEveryFuture(futures).map { it as SagaAttempt<BlackStoreOperationReceipt> }
        } finally {
            start.countDown()
            pool.shutdownNow()
            assertTrue(pool.awaitTermination(20, TimeUnit.SECONDS), "reserve executor did not terminate")
        }

        val receipts = attempts.filterIsInstance<SagaAttempt.Success<BlackStoreOperationReceipt>>()
            .map { it.value.receipt!! }
        val businessErrors = attempts.filterIsInstance<SagaAttempt.BusinessError>().map { it.code }
        assertTrue(receipts.isNotEmpty(), "at least one identical reserve request must succeed")
        assertTrue(businessErrors.all { it in setOf("CONFLICT") }, "unexpected reserve errors: $businessErrors")
        assertEquals(1, receipts.distinct().size)
        assertEquals("RESERVED", operationState(q))
        assertEquals(1, reservationLineCount(q, seeded.variantId))
        assertEquals(1, reservationCount(q, seeded.variantId, "ACTIVE"))
        assertEquals(listOf("RESERVATION" to -2), ledgerEvents(q))
        assertEquals(4, availableQty(seeded.variantId))
        assertEquals(2, reservedQty(seeded.variantId))
        assertEquals(4, sellable(seeded.variantId))
    }

    @Test
    fun `commit versus expire is exclusive`() {
        val seeded = seedVariant("SKU-RACE-${UUID.randomUUID()}", available = 5, safety = 0)
        val q = quadruple()
        engine.reserve(principal, q, seeded.catalogVersion, seeded.line(2))
        jdbc.update("UPDATE blackstore_integration_operations SET expires_at = now() - interval '1 second' WHERE operation_id=?", q.operationId)
        val pool = Executors.newFixedThreadPool(2)
        val start = CountDownLatch(1)
        val futures = mutableListOf<Future<*>>()
        val outcomes = try {
            futures += pool.submit<SagaAttempt<BlackStoreOperationReceipt>> {
                start.await()
                captureSagaAttempt { engine.commit(principal, q) }
            }
            futures += pool.submit<Int> {
                start.await()
                engine.expireDue(100)
            }
            start.countDown()
            awaitEveryFuture(futures)
        } finally {
            start.countDown()
            pool.shutdownNow()
            assertTrue(pool.awaitTermination(20, TimeUnit.SECONDS), "commit/expire executor did not terminate")
        }

        @Suppress("UNCHECKED_CAST")
        val commitAttempt = outcomes[0] as SagaAttempt<BlackStoreOperationReceipt>
        val expiredCount = outcomes[1] as Int
        val commitBusinessErrors = listOfNotNull((commitAttempt as? SagaAttempt.BusinessError)?.code)
        assertTrue(commitBusinessErrors.all { it in setOf("EXPIRED") }, "unexpected commit errors: $commitBusinessErrors")
        val committedReceipt = (commitAttempt as? SagaAttempt.Success<BlackStoreOperationReceipt>)?.value
        if (committedReceipt != null) assertEquals("COMMITTED", committedReceipt.state)
        assertTrue(expiredCount in 0..1, "expiry worker may expire at most this one operation")

        val terminal = engine.get(principal, q).state
        assertTrue(terminal == "COMMITTED" || terminal == "EXPIRED", terminal)
        assertEquals(terminal == "EXPIRED", expiredCount == 1)
        assertEquals(terminal, operationState(q))
        assertEquals(1, reservationLineCount(q, seeded.variantId))
        assertEquals(0, reservedQty(seeded.variantId))
        if (terminal == "COMMITTED") {
            assertEquals(3, availableQty(seeded.variantId))
            assertEquals(3, sellable(seeded.variantId))
            assertEquals(1, reservationCount(q, seeded.variantId, "CONSUMED"))
            assertEquals(listOf("RESERVATION" to -2, "STOCK_COMMIT_EXTERNAL" to -2), ledgerEvents(q))

            val ledgerBeforeReplay = ledgerEvents(q)
            val availableBeforeReplay = availableQty(seeded.variantId)
            val reservedBeforeReplay = reservedQty(seeded.variantId)
            val reservationStatusBeforeReplay = reservationStatus(q, seeded.variantId)
            assertEquals("COMMITTED", engine.commit(principal, q).state)
            assertEquals(ledgerBeforeReplay, ledgerEvents(q))
            assertEquals(availableBeforeReplay, availableQty(seeded.variantId))
            assertEquals(reservedBeforeReplay, reservedQty(seeded.variantId))
            assertEquals(reservationStatusBeforeReplay, reservationStatus(q, seeded.variantId))
        } else {
            assertEquals(5, availableQty(seeded.variantId))
            assertEquals(5, sellable(seeded.variantId))
            assertEquals(1, reservationCount(q, seeded.variantId, "EXPIRED"))
            assertEquals(listOf("RESERVATION" to -2, "RELEASE" to 2), ledgerEvents(q))
            val error = assertThrows(BlackStoreSagaException::class.java) { engine.commit(principal, q) }
            assertEquals("EXPIRED", error.message)
            assertEquals(listOf("RESERVATION" to -2, "RELEASE" to 2), ledgerEvents(q))
        }
    }

    @Test
    fun `future verifier surfaces an unexpected asynchronous failure`() {
        val pool = Executors.newSingleThreadExecutor()
        try {
            val future = pool.submit<String> { throw IllegalStateException("synthetic unexpected failure") }
            val failure = assertThrows(AssertionError::class.java) { awaitEveryFuture(listOf(future)) }
            assertEquals("synthetic unexpected failure", failure.cause?.cause?.message)
        } finally {
            pool.shutdownNow()
            assertTrue(pool.awaitTermination(20, TimeUnit.SECONDS), "synthetic Future executor did not terminate")
        }
    }

    @Test
    fun `reconcile is read-only and stale pending is deleted without ledger`() {
        val seeded = seedVariant("SKU-RO-${UUID.randomUUID()}", available = 7, safety = 1)
        val q = quadruple()
        val reserved = engine.reserve(principal, q, seeded.catalogVersion, seeded.line(1))
        val ledgerBefore = jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger", Int::class.java)!!
        val availableBefore = jdbc.queryForObject("SELECT available_quantity FROM inventory_balances WHERE variant_id=?", Int::class.java, seeded.variantId)!!
        val reservedBefore = reservedQty(seeded.variantId)
        val opsBefore = jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operations", Int::class.java)!!
        val result = engine.reconcile(principal, listOf(reserved.receipt!!))
        assertEquals(1, result.present.size)
        assertTrue(result.unknownReceipts.isEmpty())
        assertEquals(ledgerBefore, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger", Int::class.java))
        assertEquals(availableBefore, jdbc.queryForObject("SELECT available_quantity FROM inventory_balances WHERE variant_id=?", Int::class.java, seeded.variantId))
        assertEquals(reservedBefore, reservedQty(seeded.variantId))
        assertEquals(opsBefore, jdbc.queryForObject("SELECT COUNT(*) FROM blackstore_integration_operations", Int::class.java))

        val pending = quadruple()
            engine.claimPending(principal, pending, seeded.catalogVersion, seeded.line(1))
        jdbc.update("UPDATE blackstore_integration_operations SET created_at = now() - interval '61 seconds' WHERE operation_id=?", pending.operationId)
        val ledgerMid = jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger", Int::class.java)!!
        assertEquals(1, engine.deleteStalePending())
        assertEquals("NOT_FOUND", assertThrows(BlackStoreSagaException::class.java) { engine.get(principal, pending) }.message)
        assertEquals(ledgerMid, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger", Int::class.java))
    }

    @Test
    fun `foreign get is 404 and foreign reconcile is unknown`() {
        val seeded = seedVariant("SKU-OWN-${UUID.randomUUID()}", available = 5, safety = 0)
        val q = quadruple()
        val reserved = engine.reserve(principal, q, seeded.catalogVersion, seeded.line(1))
        val foreign = VerifiedCompanionPrincipal.of(
            UUID.randomUUID(),
            principal.companionId,
            principal.credentialId,
            principal.credentialVersion,
            CompanionServiceRole.SERVICE,
            principal.scopes,
            CompanionLifecycleStatus.ACTIVE,
        )
        assertEquals("NOT_FOUND", assertThrows(BlackStoreSagaException::class.java) { engine.get(foreign, q) }.message)
        val foreignReconcile = engine.reconcile(foreign, listOf(reserved.receipt!!))
        assertTrue(foreignReconcile.present.isEmpty())
        assertEquals(listOf(reserved.receipt), foreignReconcile.unknownReceipts)
        assertEquals("RESERVED", engine.get(principal, q).state)
    }

    @Test
    fun `duplicate variant and missing balance stay on the application datasource`() {
        val seeded = seedVariant("SKU-DUP-${UUID.randomUUID()}", available = 4, safety = 0)
        val dataSource = jdbc.dataSource as DriverManagerDataSource
        assertEquals(postgres.jdbcUrl, dataSource.url)
        assertFalse(dataSource.url.contains("blackstore", ignoreCase = true))
        val duplicate = assertThrows(BlackStoreSagaException::class.java) {
            engine.reserve(principal, quadruple(), seeded.catalogVersion, seeded.line(1) + seeded.line(1))
        }
        assertEquals("DUPLICATE_VARIANT", duplicate.message)
        val orphanSku = "SKU-ORB-${UUID.randomUUID()}"
        val orphanProduct = jdbc.queryForObject(
            "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, ?, ?, 10, 'ACTIVE') RETURNING id",
            Long::class.java,
            orphanSku,
            orphanSku.lowercase(),
        )!!
        val orphanVariant = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id, sku, label) VALUES (?, ?, 'NoBal') RETURNING id",
            Long::class.java,
            orphanProduct,
            orphanSku,
        )!!
        val missing = assertThrows(BlackStoreSagaException::class.java) {
            engine.reserve(principal, quadruple(), catalog.currentCatalogVersion(), listOf(BlackStoreReserveLine(orphanVariant, orphanSku, 1, "catalog-$orphanProduct")))
        }
        assertEquals("INSUFFICIENT_STOCK", missing.message)
        assertEquals(0, missing.lineFailures.single().availableQuantity)
        assertEquals(1, missing.lineFailures.single().requested)
        val secrets = listOf("sk_live_", "Bearer ", "4111111111111111", "cvv")
        assertTrue(secrets.none { token -> missing.message!!.contains(token) || missing.toString().contains(token) })
        assertTrue(secrets.none { token -> jdbc.dataSource!!.connection.use { it.metaData.url }.contains(token) })
    }

    @Test
    fun `purgeDue tombstones aged terminals in batch`() {
        val seeded = seedVariant("SKU-PDU-${UUID.randomUUID()}", available = 3, safety = 0)
        val q = quadruple()
        engine.reserve(principal, q, seeded.catalogVersion, seeded.line(1))
        engine.commit(principal, q)
        jdbc.update("UPDATE blackstore_integration_operations SET updated_at = now() - interval '91 days' WHERE operation_id=?", q.operationId)
        assertEquals(1, engine.purgeDue(100))
        assertEquals("OPERATION_RETIRED", assertThrows(BlackStoreSagaException::class.java) { engine.get(principal, q) }.message)
    }

    private fun quadruple() = BlackStoreQuadruple(client, "POS-1", "sale-${UUID.randomUUID()}", UUID.randomUUID())

    private fun seedVariant(sku: String, available: Int, safety: Int): Seeded {
        val productId = jdbc.queryForObject(
            "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, ?, ?, 10, 'ACTIVE') RETURNING id",
            Long::class.java,
            sku,
            sku.lowercase(),
        )!!
        val variantId = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id, sku, label) VALUES (?, ?, 'Default') RETURNING id",
            Long::class.java,
            productId,
            sku,
        )!!
        jdbc.update(
            "INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?,?,?)",
            variantId,
            available,
            safety,
        )
        return Seeded(productId, variantId, sku, catalog.currentCatalogVersion())
    }

    private fun sellable(variantId: Long): Int =
        jdbc.queryForObject("SELECT GREATEST(0, available_quantity - safety_stock) FROM inventory_balances WHERE variant_id=?", Int::class.java, variantId)!!

    private fun reservedQty(variantId: Long): Int =
        jdbc.queryForObject("SELECT reserved_quantity FROM inventory_balances WHERE variant_id=?", Int::class.java, variantId)!!

    private fun availableQty(variantId: Long): Int =
        jdbc.queryForObject("SELECT available_quantity FROM inventory_balances WHERE variant_id=?", Int::class.java, variantId)!!

    private fun operationState(q: BlackStoreQuadruple): String =
        jdbc.queryForObject(
            "SELECT state FROM blackstore_integration_operations WHERE client_instance_id=? AND device_id=? AND sale_id=? AND operation_id=?",
            String::class.java,
            q.clientInstanceId,
            q.deviceId,
            q.saleId,
            q.operationId,
        )!!

    private fun reservationLineCount(q: BlackStoreQuadruple, variantId: Long): Int =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM blackstore_integration_reservation_lines WHERE reservation_ref=? AND variant_id=?",
            Int::class.java,
            BlackStoreSagaPolicy.reservationRefFor(q),
            variantId,
        )!!

    private fun reservationCount(q: BlackStoreQuadruple, variantId: Long, status: String): Int =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM inventory_reservations WHERE reservation_saga_key=? AND variant_id=? AND status=?",
            Int::class.java,
            BlackStoreSagaPolicy.reservationRefFor(q),
            variantId,
            status,
        )!!

    private fun reservationStatus(q: BlackStoreQuadruple, variantId: Long): String =
        jdbc.queryForObject(
            "SELECT status FROM inventory_reservations WHERE reservation_saga_key=? AND variant_id=?",
            String::class.java,
            BlackStoreSagaPolicy.reservationRefFor(q),
            variantId,
        )!!

    private fun ledgerEvents(q: BlackStoreQuadruple): List<Pair<String, Int>> =
        jdbc.query(
            """
            SELECT l.event_type, l.quantity_delta
            FROM inventory_ledger l
            JOIN inventory_reservations r ON r.id = l.reservation_id
            WHERE r.reservation_saga_key=? AND l.channel='EXTERNAL_BLACKSTORE'
            ORDER BY l.id
            """.trimIndent(),
            { rs, _ -> rs.getString("event_type") to rs.getInt("quantity_delta") },
            BlackStoreSagaPolicy.reservationRefFor(q),
        )

    private fun completeLedgerSnapshot(q: BlackStoreQuadruple): List<Map<String, Any>> =
        jdbc.queryForList(
            """
            SELECT l.*
            FROM inventory_ledger l
            JOIN inventory_reservations r ON r.id = l.reservation_id
            WHERE r.reservation_saga_key=?
            ORDER BY l.id
            """.trimIndent(),
            BlackStoreSagaPolicy.reservationRefFor(q),
        )

    private fun balanceSnapshot(variantId: Long): Map<String, Any> =
        jdbc.queryForMap("SELECT * FROM inventory_balances WHERE variant_id=?", variantId)

    private fun operationSnapshot(q: BlackStoreQuadruple): Map<String, Any> =
        jdbc.queryForMap(
            "SELECT * FROM blackstore_integration_operations WHERE client_instance_id=? AND device_id=? AND sale_id=? AND operation_id=?",
            q.clientInstanceId,
            q.deviceId,
            q.saleId,
            q.operationId,
        )

    private fun reservationSnapshot(q: BlackStoreQuadruple): List<Map<String, Any>> =
        jdbc.queryForList(
            "SELECT * FROM inventory_reservations WHERE reservation_saga_key=? ORDER BY variant_id",
            BlackStoreSagaPolicy.reservationRefFor(q),
        )

    private fun awaitEveryFuture(futures: List<Future<*>>): List<Any?> {
        val outcomes = mutableListOf<Any?>()
        val failures = mutableListOf<AssertionError>()
        var interrupted = false
        futures.forEachIndexed { index, future ->
            try {
                outcomes += future.get(20, TimeUnit.SECONDS)
            } catch (failure: ExecutionException) {
                outcomes += null
                failures += AssertionError("asynchronous task $index failed unexpectedly", failure.cause ?: failure)
            } catch (failure: TimeoutException) {
                outcomes += null
                failures += AssertionError("asynchronous task $index timed out", failure)
            } catch (failure: InterruptedException) {
                outcomes += null
                interrupted = true
                failures += AssertionError("interrupted while awaiting asynchronous task $index", failure)
            }
        }
        if (interrupted) Thread.currentThread().interrupt()
        if (failures.isNotEmpty()) {
            val failure = AssertionError("${failures.size} asynchronous task(s) failed verification", failures.first())
            failures.drop(1).forEach(failure::addSuppressed)
            throw failure
        }
        return outcomes
    }

    private inline fun <T> captureSagaAttempt(block: () -> T): SagaAttempt<T> = try {
        SagaAttempt.Success(block())
    } catch (failure: BlackStoreSagaException) {
        SagaAttempt.BusinessError(failure.message ?: failure.javaClass.simpleName)
    }

    private sealed interface SagaAttempt<out T> {
        data class Success<T>(val value: T) : SagaAttempt<T>
        data class BusinessError(val code: String) : SagaAttempt<Nothing>
    }

    private data class Seeded(val productId: Long, val variantId: Long, val sku: String, val catalogVersion: String) {
        fun line(quantity: Int) = listOf(BlackStoreReserveLine(variantId, sku, quantity, "catalog-$productId"))
    }
}
