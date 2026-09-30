package com.storecore.blackstore

import com.storecore.blackstore.application.BlackStoreIntegrationService
import com.storecore.blackstore.application.dto.BlackStoreReconcileRequest
import com.storecore.blackstore.application.dto.BlackStoreReservationLineRequest
import com.storecore.blackstore.application.dto.BlackStoreReservationRequest
import com.storecore.blackstore.application.port.BlackStoreCompanionGuard
import com.storecore.blackstore.application.port.BlackStoreRateLimitPort
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionBridgePort
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionResult
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.blackstore.domain.CompanionServiceRole
import com.storecore.blackstore.domain.VerifiedCompanionPrincipal
import com.storecore.blackstore.infrastructure.JdbcPosCompanionGuard
import com.storecore.catalog.infrastructure.JdbcPriceQuoteAdapter
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Posc004CommitReleaseTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var catalog: JdbcBlackStoreCatalogQuery
    private lateinit var engine: JdbcBlackStoreSagaEngine
    private lateinit var service: BlackStoreIntegrationService
    private lateinit var principal: VerifiedCompanionPrincipal
    private val client = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    @BeforeAll
    fun start() {
        postgres.start()
        Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        val dataSource = DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password)
        jdbc = JdbcTemplate(dataSource)
        val quotes = JdbcPriceQuoteAdapter(jdbc)
        catalog = JdbcBlackStoreCatalogQuery(jdbc, quotes)
        engine = JdbcBlackStoreSagaEngine(
            jdbc,
            DataSourceTransactionManager(dataSource),
            LegacyBlackStoreProjectionBridgePort { LegacyBlackStoreProjectionResult.NOT_ELIGIBLE },
            JdbcPosCompanionGuard(jdbc),
            quotes,
        )
        service = BlackStoreIntegrationService(
            object : CapabilityDecisionPort {
                override fun decide(module: String, action: String, actor: CapabilityActor) = Unit
            },
            object : BlackStoreCompanionGuard {
                override fun assertNoLiveTraffic() = Unit
                override fun assertBound(clientInstanceId: UUID) = Unit
            },
            BlackStoreRateLimitPort { _, _ -> },
            engine,
            catalog,
        )
        jdbc.update("INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Test', 'localhost', 'ARS') ON CONFLICT DO NOTHING")
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('F', 'f-004')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('F', 'f-cat')")
        jdbc.update("INSERT INTO blackstore_companions(client_instance_id, status) VALUES (?, 'ACTIVE')", client)
        val companionId = jdbc.queryForObject("SELECT id FROM blackstore_companions WHERE client_instance_id=?", Long::class.java, client)!!
        jdbc.update(
            """
            INSERT INTO blackstore_companion_credentials(
              companion_id, credential_secret_ref, credential_version, status,
              token_fingerprint, scopes, service_role, auth_ready
            ) VALUES (?, 'test-only:004', 1, 'ACTIVE', ?, ?::text[], 'SERVICE', TRUE)
            """.trimIndent(),
            companionId,
            "4".repeat(64),
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
            "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('f-admin@example.com', '\$argon2id\$fixture', 'F', 'Admin') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id",
            Long::class.java,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id, role_id) SELECT ?, id FROM roles WHERE code='ADMIN' ON CONFLICT DO NOTHING", adminId)
        jdbc.update(
            """UPDATE module_configurations
               SET state='ACTIVE', config_version=config_version+1, updated_by=?, updated_at=clock_timestamp()
               WHERE module_code='BLACKSTORE_INTEGRATION' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'""",
            adminId,
        )
    }

    @Test
    fun commitConsumesOnceWithoutSaleOrListingStock() {
        val sku = "SKU-004C-${UUID.randomUUID()}".take(24)
        val variantId = seedVariant(sku, 8)
        val quote = liveQuote(variantId)
        val operationId = UUID.randomUUID()
        val desiredBefore = jdbc.queryForObject("SELECT COALESCE(SUM(desired_quantity),0) FROM channel_listings", Int::class.java)!!
        val outboxBefore = jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind='LISTING_STOCK'", Int::class.java)!!
        val reserved = reserve(sku, variantId, quote, "sale-commit", operationId, 2)
        assertEquals("RESERVED", reserved.state)
        val committed = service.commit(principal, client.toString(), "POS-4", "sale-commit", operationId.toString(), reserved.reservationRef!!.toString())
        assertEquals("COMMITTED", committed.state)
        val replayed = service.commit(principal, client.toString(), "POS-4", "sale-commit", operationId.toString(), reserved.reservationRef.toString())
        assertEquals(committed, replayed)
        assertEquals(6, available(variantId))
        assertEquals(0, reservedQty(variantId))
        assertEquals(
            1,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM inventory_ledger WHERE channel='EXTERNAL_BLACKSTORE' AND event_type='STOCK_COMMIT_EXTERNAL' AND variant_id=?",
                Int::class.java,
                variantId,
            ),
        )
        assertEquals(
            0,
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM inventory_ledger WHERE event_type='SALE' AND channel='EXTERNAL_BLACKSTORE' AND variant_id=?",
                Int::class.java,
                variantId,
            ),
        )
        assertEquals(desiredBefore, jdbc.queryForObject("SELECT COALESCE(SUM(desired_quantity),0) FROM channel_listings", Int::class.java))
        assertEquals(outboxBefore, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind='LISTING_STOCK'", Int::class.java))
        assertEquals("VALIDATION", assertThrows(BlackStoreSagaException::class.java) {
            service.commit(principal, client.toString(), "POS-4", "sale-commit", operationId.toString(), UUID.randomUUID().toString())
        }.message)
        assertEquals("OPERATION_STATE_CONFLICT", assertThrows(BlackStoreSagaException::class.java) {
            service.release(principal, client.toString(), "POS-4", "sale-commit", operationId.toString(), reserved.reservationRef.toString())
        }.message)
    }

    @Test
    fun releaseRestoresStockAndGetReconcileFollowContract() {
        val sku = "SKU-004R-${UUID.randomUUID()}".take(24)
        val variantId = seedVariant(sku, 5)
        val quote = liveQuote(variantId)
        val pendingOp = UUID.randomUUID()
        engine.claimPending(
            principal,
            BlackStoreQuadruple(client, "POS-4", "sale-get", pendingOp),
            catalog.currentCatalogVersion(),
            listOf(BlackStoreReserveLine(variantId, sku, 1, quote.priceVersion.wire)),
        )
        assertEquals("PENDING", service.operation(principal, client.toString(), "POS-4", "sale-get", pendingOp.toString(), pendingOp.toString()).state)
        val missing = UUID.randomUUID().toString()
        assertEquals("NOT_FOUND", assertThrows(BlackStoreSagaException::class.java) {
            service.operation(principal, client.toString(), "POS-4", "sale-get", missing, missing)
        }.message)
        val releaseOp = UUID.randomUUID()
        val reserved = reserve(sku, variantId, quote, "sale-rel", releaseOp, 2)
        assertEquals(3, available(variantId))
        val released = service.release(principal, client.toString(), "POS-4", "sale-rel", releaseOp.toString(), reserved.reservationRef!!.toString())
        assertEquals("RELEASED", released.state)
        assertEquals(5, available(variantId))
        assertEquals(0, reservedQty(variantId))
        val replayed = service.release(principal, client.toString(), "POS-4", "sale-rel", releaseOp.toString(), reserved.reservationRef.toString())
        assertEquals(released, replayed)
        assertEquals(5, available(variantId))
        assertEquals("VALIDATION", assertThrows(BlackStoreSagaException::class.java) {
            service.reconcile(principal, client.toString(), BlackStoreReconcileRequest(emptyList()))
        }.message)
        assertEquals("VALIDATION", assertThrows(BlackStoreSagaException::class.java) {
            service.reconcile(principal, client.toString(), BlackStoreReconcileRequest(List(501) { "r-$it" }))
        }.message)
        val reconciled = service.reconcile(
            principal,
            client.toString(),
            BlackStoreReconcileRequest(listOf(reserved.receipt!!, reserved.receipt!!, "unknown-004")),
        )
        assertEquals(1, reconciled.present.size)
        assertEquals("RELEASED", reconciled.present.single().state)
        assertEquals(listOf("unknown-004"), reconciled.unknownReceipts)
        assertEquals("CONFLICT", BlackStoreSagaException.conflict().message)
        assertEquals(409, BlackStoreSagaException.conflict().httpStatus)
        assertTrue(BlackStoreSagaException.conflict().retryable)
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @AfterAll
        fun stop() = postgres.stop()
    }

    private fun reserve(
        sku: String,
        variantId: Long,
        quote: com.storecore.catalog.domain.PriceQuote,
        saleId: String,
        operationId: UUID,
        quantity: Int,
    ) = service.reserve(
        principal,
        client.toString(),
        "POS-4",
        saleId,
        operationId.toString(),
        BlackStoreReservationRequest(
            catalog.currentCatalogVersion(),
            quote.priceVersion.wire,
            listOf(BlackStoreReservationLineRequest(variantId, sku, quantity, quote.priceVersion.wire)),
        ),
    )

    private fun liveQuote(variantId: Long) =
        JdbcPriceQuoteAdapter(jdbc).quoteByVariantIds(JdbcPriceQuoteAdapter(jdbc).clock(), listOf(variantId)).getValue(variantId)

    private fun available(variantId: Long) =
        jdbc.queryForObject("SELECT available_quantity FROM inventory_balances WHERE variant_id=?", Int::class.java, variantId)!!

    private fun reservedQty(variantId: Long) =
        jdbc.queryForObject("SELECT reserved_quantity FROM inventory_balances WHERE variant_id=?", Int::class.java, variantId)!!

    private fun seedVariant(sku: String, available: Int): Long {
        val slug = "f-${UUID.randomUUID()}"
        val productId = jdbc.queryForObject(
            "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, ?, ?, 10, 'ACTIVE') RETURNING id",
            Long::class.java,
            sku.take(40),
            slug,
        )!!
        val variantId = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id, sku, label) VALUES (?, ?, 'F') RETURNING id",
            Long::class.java,
            productId,
            sku,
        )!!
        jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?,?,0)", variantId, available)
        return variantId
    }
}
