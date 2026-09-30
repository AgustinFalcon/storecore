package com.storecore.commerce

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.blackstore.BlackStoreQuadruple
import com.storecore.blackstore.BlackStoreReserveLine
import com.storecore.blackstore.JdbcBlackStoreCatalogQuery
import com.storecore.blackstore.JdbcBlackStoreSagaEngine
import com.storecore.blackstore.application.LegacyBlackStoreProjectionBridge
import com.storecore.blackstore.application.port.LegacyBlackStoreProjectionResult
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.blackstore.domain.CompanionServiceRole
import com.storecore.blackstore.domain.VerifiedCompanionPrincipal
import com.storecore.blackstore.infrastructure.JdbcPosCompanionGuard
import com.storecore.catalog.infrastructure.JdbcPriceQuoteAdapter
import com.storecore.commerce.application.DesiredStockProjectionUseCase
import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.ChannelOutboxKind
import com.storecore.commerce.domain.OutboxDeliveryStatus
import com.storecore.commerce.domain.ProjectionSourceCause
import com.storecore.commerce.infrastructure.JdbcChannelStockOutboxAdapter
import com.storecore.commerce.infrastructure.JdbcMarketplaceListingProjectionAdapter
import com.storecore.configuration.CapabilityAdminTestSupport
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID

/**
 * TASK-DSP-009: BlackStore saga delegates to the local desired-stock projector in the same transaction.
 * GitHub issues 96 (commit path) and 100 (release/expiry residual recorded by prv39).
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Dsp009BlackStoreBridgeTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var engine: JdbcBlackStoreSagaEngine
    private lateinit var quotes: JdbcPriceQuoteAdapter
    private lateinit var catalog: JdbcBlackStoreCatalogQuery
    private lateinit var bridge: LegacyBlackStoreProjectionBridge
    private lateinit var principal: VerifiedCompanionPrincipal
    private var adminId: Long = 0
    private val client = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

    @BeforeAll
    fun start() {
        postgres.start()
        val provisioned = CapabilityAdminTestSupport.migrateAndProvision(postgres)
        jdbc = provisioned.first
        val capabilities = JdbcCapabilityService(jdbc, provisioned.second)
        val projection = DesiredStockProjectionUseCase(
            capabilities,
            JdbcMarketplaceListingProjectionAdapter(jdbc),
            JdbcChannelStockOutboxAdapter(jdbc, ObjectMapper()),
        )
        bridge = LegacyBlackStoreProjectionBridge(projection)
        quotes = JdbcPriceQuoteAdapter(jdbc)
        catalog = JdbcBlackStoreCatalogQuery(jdbc, quotes)
        engine = JdbcBlackStoreSagaEngine(
            jdbc,
            DataSourceTransactionManager(jdbc.dataSource!!),
            bridge,
            JdbcPosCompanionGuard(jdbc),
            quotes,
        )
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
            ) VALUES (?, 'test-only:dsp009', 1, 'ACTIVE', ?, ?::text[], 'SERVICE', TRUE)
            """.trimIndent(),
            companionId,
            "b".repeat(64),
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
        adminId = jdbc.queryForObject(
            "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('dsp009@example.com', '\$argon2id\$fixture', 'Dsp', 'Nine') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id",
            Long::class.java,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id, role_id) SELECT ?, id FROM roles WHERE code='ADMIN' ON CONFLICT DO NOTHING", adminId)
        CapabilityAdminTestSupport.setBlackStoreStateForTest(jdbc, CapabilityState.ACTIVE, adminId)
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('Dsp009', 'dsp009-brand')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('Dsp009', 'dsp009-cat')")
    }

    @AfterAll
    fun stop() {
        CapabilityAdminTestSupport.setBlackStoreStateForTest(jdbc, CapabilityState.DISABLED, adminId)
        postgres.stop()
    }

    @Test
    fun closedCausesAndEmptyBridgeStayNotEligible() {
        assertEquals(ProjectionSourceCause.ExternalBlackStoreCommit, ProjectionSourceCause.fromWire("EXTERNAL_BLACKSTORE_COMMIT"))
        assertEquals(ProjectionSourceCause.ExternalBlackStoreRelease, ProjectionSourceCause.fromWire("EXTERNAL_BLACKSTORE_RELEASE"))
        assertEquals(ProjectionSourceCause.ExternalBlackStoreExpiry, ProjectionSourceCause.fromWire("EXTERNAL_BLACKSTORE_EXPIRY"))
        assertEquals(ProjectionSourceCause.Unknown, ProjectionSourceCause.fromWire("EXTERNAL_BLACKSTORE_LIVE"))
        assertEquals(
            LegacyBlackStoreProjectionResult.NOT_ELIGIBLE,
            bridge.requestProjection(emptyList(), ProjectionSourceCause.Unknown),
        )
    }

    @Test
    fun commitWithoutMlLeavesListingStockHistoricAndDoesNotEmitDesiredChanged() {
        val seeded = seedVariant("SKU-DSP009-OFF")
        val listingId = insertListing(seeded.variantId, "MLA-009-OFF", ChannelAccountPurpose.ExternalMlSync.wire)
        val historyId = insertHistoricListingStock(listingId)
        val historic = jdbc.queryForObject("SELECT to_jsonb(o)::text FROM channel_outbox AS o WHERE id=?", String::class.java, historyId)!!
        val q = quadruple()
        engine.reserve(principal, q, seeded.catalogVersion, seeded.line(1))
        engine.commit(principal, q)
        assertEquals(0, desiredChangedCount(listingId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE id=? AND kind=?", Int::class.java, historyId, ChannelOutboxKind.ListingStock.wire))
        assertEquals(historic, jdbc.queryForObject("SELECT to_jsonb(o)::text FROM channel_outbox AS o WHERE id=?", String::class.java, historyId))
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='MARKETPLACE_ML'", String::class.java))
    }

    @Test
    fun commitWithMlDelegatesPendingDesiredChangedWithoutListingStock() {
        val seeded = seedVariant("SKU-DSP009-ON")
        val listingId = insertListing(seeded.variantId, "MLA-009-ON", ChannelAccountPurpose.ExternalMlSync.wire)
        val historyId = insertHistoricListingStock(listingId)
        val historic = jdbc.queryForObject("SELECT to_jsonb(o)::text FROM channel_outbox AS o WHERE id=?", String::class.java, historyId)!!
        CapabilityAdminTestSupport.activateMarketplaceMl(jdbc, adminId)
        try {
            val q = quadruple()
            engine.reserve(principal, q, seeded.catalogVersion, seeded.line(1))
            val committed = engine.commit(principal, q)
            assertEquals("COMMITTED", committed.state)
            assertEquals(1, desiredChangedCount(listingId))
            assertEquals(
                OutboxDeliveryStatus.Pending.wire,
                jdbc.queryForObject(
                    "SELECT d.status FROM channel_outbox_delivery d JOIN channel_outbox o ON o.id=d.outbox_id WHERE o.listing_id=? AND o.kind=?",
                    String::class.java,
                    listingId,
                    ChannelOutboxKind.StockDesiredChanged.wire,
                ),
            )
            assertEquals(
                ProjectionSourceCause.ExternalBlackStoreCommit.wire,
                jdbc.queryForObject(
                    "SELECT source_cause FROM channel_listing_stock_projection WHERE listing_id=?",
                    String::class.java,
                    listingId,
                ),
            )
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE id=? AND kind=?", Int::class.java, historyId, ChannelOutboxKind.ListingStock.wire))
            assertEquals(historic, jdbc.queryForObject("SELECT to_jsonb(o)::text FROM channel_outbox AS o WHERE id=?", String::class.java, historyId))
            engine.commit(principal, q)
            assertEquals(1, desiredChangedCount(listingId))
        } finally {
            disableMarketplaceMl()
        }
    }

    @Test
    fun releaseWithMlDelegatesPendingDesiredChangedWithoutListingStock() {
        val seeded = seedVariant("SKU-DSP009-REL")
        val listingId = insertListing(seeded.variantId, "MLA-009-REL", ChannelAccountPurpose.ExternalMlSync.wire)
        val historyId = insertHistoricListingStock(listingId)
        val historic = jdbc.queryForObject("SELECT to_jsonb(o)::text FROM channel_outbox AS o WHERE id=?", String::class.java, historyId)!!
        CapabilityAdminTestSupport.activateMarketplaceMl(jdbc, adminId)
        try {
            val q = quadruple()
            engine.reserve(principal, q, seeded.catalogVersion, seeded.line(1))
            val released = engine.release(principal, q)
            assertEquals("RELEASED", released.state)
            assertEquals(1, desiredChangedCount(listingId))
            assertPendingDesiredChanged(listingId, ProjectionSourceCause.ExternalBlackStoreRelease)
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE id=? AND kind=?", Int::class.java, historyId, ChannelOutboxKind.ListingStock.wire))
            assertEquals(historic, jdbc.queryForObject("SELECT to_jsonb(o)::text FROM channel_outbox AS o WHERE id=?", String::class.java, historyId))
            engine.release(principal, q)
            assertEquals(1, desiredChangedCount(listingId))
        } finally {
            disableMarketplaceMl()
        }
    }

    @Test
    fun expireWithMlDelegatesPendingDesiredChangedWithoutListingStock() {
        val seeded = seedVariant("SKU-DSP009-EXP")
        val listingId = insertListing(seeded.variantId, "MLA-009-EXP", ChannelAccountPurpose.ExternalMlSync.wire)
        val historyId = insertHistoricListingStock(listingId)
        val historic = jdbc.queryForObject("SELECT to_jsonb(o)::text FROM channel_outbox AS o WHERE id=?", String::class.java, historyId)!!
        CapabilityAdminTestSupport.activateMarketplaceMl(jdbc, adminId)
        try {
            val q = quadruple()
            engine.reserve(principal, q, seeded.catalogVersion, seeded.line(1))
            jdbc.update(
                "UPDATE blackstore_integration_operations SET expires_at = now() - interval '1 second' WHERE operation_id=?",
                q.operationId,
            )
            assertEquals(1, engine.expireDue(100))
            assertEquals("EXPIRED", engine.get(principal, q).state)
            assertEquals(1, desiredChangedCount(listingId))
            assertPendingDesiredChanged(listingId, ProjectionSourceCause.ExternalBlackStoreExpiry)
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE id=? AND kind=?", Int::class.java, historyId, ChannelOutboxKind.ListingStock.wire))
            assertEquals(historic, jdbc.queryForObject("SELECT to_jsonb(o)::text FROM channel_outbox AS o WHERE id=?", String::class.java, historyId))
            assertEquals(0, engine.expireDue(100))
            assertEquals(1, desiredChangedCount(listingId))
        } finally {
            disableMarketplaceMl()
        }
    }

    private fun disableMarketplaceMl() {
        jdbc.update(
            """UPDATE module_configurations SET state='DISABLED', config_version=config_version+1, updated_by=?, updated_at=clock_timestamp()
               WHERE module_code='MARKETPLACE_ML' AND scope_kind='INSTALLATION' AND scope_key='DEFAULT'""",
            adminId,
        )
    }

    private fun assertPendingDesiredChanged(listingId: Long, cause: ProjectionSourceCause) {
        assertEquals(
            OutboxDeliveryStatus.Pending.wire,
            jdbc.queryForObject(
                "SELECT d.status FROM channel_outbox_delivery d JOIN channel_outbox o ON o.id=d.outbox_id WHERE o.listing_id=? AND o.kind=?",
                String::class.java,
                listingId,
                ChannelOutboxKind.StockDesiredChanged.wire,
            ),
        )
        assertEquals(
            cause.wire,
            jdbc.queryForObject(
                "SELECT source_cause FROM channel_listing_stock_projection WHERE listing_id=?",
                String::class.java,
                listingId,
            ),
        )
    }

    private fun quadruple() = BlackStoreQuadruple(client, "POS-009", "sale-${UUID.randomUUID()}", UUID.randomUUID())

    private fun seedVariant(sku: String): Seeded {
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
        jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?,?,2)", variantId, 8)
        val priceVersion = quotes.quoteByVariantIds(quotes.clock(), listOf(variantId)).getValue(variantId).priceVersion.wire
        return Seeded(variantId, sku, catalog.currentCatalogVersion(), priceVersion)
    }

    private fun insertListing(variantId: Long, externalId: String, purpose: String): Long {
        val accountId = jdbc.queryForObject(
            "INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state,purpose) VALUES (?,'MERCADO_LIBRE','ref:dsp009','ACTIVE',?) RETURNING id",
            Long::class.java,
            "ml-009-${UUID.randomUUID()}",
            purpose,
        )!!
        return jdbc.queryForObject(
            "INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state,desired_quantity) VALUES (?,?,NULL,?,'ACTIVE',0) RETURNING id",
            Long::class.java,
            accountId,
            externalId,
            variantId,
        )!!
    }

    private fun insertHistoricListingStock(listingId: Long): Long {
        val accountId = jdbc.queryForObject("SELECT account_id FROM channel_listings WHERE id=?", Long::class.java, listingId)!!
        return jdbc.queryForObject(
            """
            INSERT INTO channel_outbox(idempotency_key, account_id, listing_id, kind, payload_redacted)
            VALUES (?, ?, ?, 'LISTING_STOCK', '{"legacy":true}'::jsonb)
            RETURNING id
            """.trimIndent(),
            Long::class.java,
            UUID.randomUUID(),
            accountId,
            listingId,
        )!!
    }

    private fun desiredChangedCount(listingId: Long): Int =
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM channel_outbox WHERE listing_id=? AND kind=?",
            Int::class.java,
            listingId,
            ChannelOutboxKind.StockDesiredChanged.wire,
        )!!

    private data class Seeded(val variantId: Long, val sku: String, val catalogVersion: String, val priceVersion: String) {
        fun line(quantity: Int) = listOf(BlackStoreReserveLine(variantId, sku, quantity, priceVersion))
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
