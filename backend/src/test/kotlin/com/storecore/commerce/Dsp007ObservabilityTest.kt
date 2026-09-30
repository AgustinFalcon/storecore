package com.storecore.commerce

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.DesiredStockProjectionUseCase
import com.storecore.commerce.application.port.DesiredStockProjectionObserver
import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.DesiredStockOutcome
import com.storecore.commerce.domain.DesiredStockProjectionResult
import com.storecore.commerce.domain.ProjectionSourceCause
import com.storecore.commerce.infrastructure.JdbcChannelStockOutboxAdapter
import com.storecore.commerce.infrastructure.JdbcDesiredStockPendingStats
import com.storecore.commerce.infrastructure.JdbcMarketplaceListingProjectionAdapter
import com.storecore.commerce.infrastructure.LoggingDesiredStockProjectionObserver
import com.storecore.configuration.CapabilityAdminTestSupport
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Dsp007ObservabilityTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var capabilities: JdbcCapabilityService
    private lateinit var transactions: TransactionTemplate
    private lateinit var observer: LoggingDesiredStockProjectionObserver
    private lateinit var captured: CopyOnWriteArrayList<String>
    private lateinit var projection: DesiredStockProjectionUseCase
    private lateinit var pending: JdbcDesiredStockPendingStats
    private var adminId: Long = 0
    private lateinit var adminSession: UUID

    @BeforeAll
    fun start() {
        postgres.start()
        val provisioned = CapabilityAdminTestSupport.migrateAndProvision(postgres)
        jdbc = provisioned.first
        capabilities = JdbcCapabilityService(jdbc, provisioned.second)
        transactions = TransactionTemplate(DataSourceTransactionManager(jdbc.dataSource!!))
        observer = LoggingDesiredStockProjectionObserver()
        captured = CopyOnWriteArrayList()
        val recording = DesiredStockProjectionObserver { results ->
            observer.record(results)
            results.forEach { result ->
                captured += "desired_stock outcome=${result.outcome.wire} listingId=${result.listingId} version=${result.projectionVersion} remote_delivery=false"
            }
        }
        projection = DesiredStockProjectionUseCase(
            capabilities,
            JdbcMarketplaceListingProjectionAdapter(jdbc),
            JdbcChannelStockOutboxAdapter(jdbc, ObjectMapper()),
            recording,
        )
        pending = JdbcDesiredStockPendingStats(jdbc)
        val hash = Argon2PasswordHasher().hash("a-very-long-password".toCharArray())
        adminId = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id",
            Long::class.java,
            "dsp007-admin@example.com",
            hash,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
        adminSession = CapabilityAdminTestSupport.liveAdminSession(jdbc, adminId)
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('Dsp007', 'dsp007-brand')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('Dsp007', 'dsp007-cat')")
    }

    @AfterAll
    fun stop() = postgres.stop()

    @Test
    fun countersDistinguishOutcomesAndPendingIsLocalOnly() {
        val missing = seedVariant("SKU-DSP007-NONE", 4, 0, 0)
        val active = seedVariant("SKU-DSP007-ON", 10, 0, 2)
        val paused = seedVariant("SKU-DSP007-OFF", 5, 0, 0)
        val accountId = insertAccount("ml-sync-007", ChannelAccountPurpose.ExternalMlSync.wire)
        insertListing(accountId, active, "MLA-007-ON", "ACTIVE")
        insertListing(accountId, paused, "MLA-007-OFF", "PAUSED")
        enableMl()
        try {
            val first = project(listOf(missing, active, paused))
            assertEquals(DesiredStockOutcome.NoListing, first.single { it.variantId == missing }.outcome)
            assertEquals(DesiredStockOutcome.Projected, first.single { it.variantId == active }.outcome)
            assertEquals(DesiredStockOutcome.Withheld, first.single { it.variantId == paused }.outcome)
            val replay = project(listOf(active))
            assertEquals(DesiredStockOutcome.Unchanged, replay.single().outcome)
            assertEquals(1L, observer.count(DesiredStockOutcome.Projected))
            assertEquals(1L, observer.count(DesiredStockOutcome.Unchanged))
            assertEquals(1L, observer.count(DesiredStockOutcome.Withheld))
            assertEquals(1L, observer.count(DesiredStockOutcome.NoListing))
            val stats = pending.snapshot()
            assertEquals(1L, stats.withheldSnapshots)
            assertEquals(1L, stats.pendingDeliveries)
            val age = stats.oldestPendingAgeSeconds
            assertTrue(age != null && age >= 0L)
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox_delivery WHERE status='SENT'", Int::class.java))
            captured.forEach { line ->
                assertTrue(line.contains("remote_delivery=false"), line)
                assertFalse(line.contains("ref:dsp007"), line)
                assertFalse(line.contains("oauth", ignoreCase = true), line)
                assertFalse(line.contains("token", ignoreCase = true), line)
                assertFalse(line.contains("dsp007-admin@example.com"), line)
                assertFalse(line.contains("payload", ignoreCase = true), line)
            }
            assertTrue(captured.any { it.contains("outcome=PROJECTED") })
            assertTrue(captured.any { it.contains("outcome=UNCHANGED") })
            assertTrue(captured.any { it.contains("outcome=WITHHELD") })
            assertTrue(captured.any { it.contains("outcome=NO_LISTING") })
        } finally {
            disableMl()
        }
        assertEquals(
            "DISABLED",
            jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java),
        )
    }

    private fun project(variantIds: List<Long>): List<DesiredStockProjectionResult> {
        lateinit var results: List<DesiredStockProjectionResult>
        transactions.executeWithoutResult {
            results = projection.project(variantIds, ProjectionSourceCause.InternalAdjustment, CapabilityActor.Internal(actor()))
        }
        return results
    }

    private fun actor() = InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN))

    private fun insertAccount(key: String, purpose: String): Long =
        jdbc.queryForObject(
            "INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state,purpose) VALUES (?,'MERCADO_LIBRE','ref:dsp007','ACTIVE',?) RETURNING id",
            Long::class.java,
            key,
            purpose,
        )!!

    private fun seedVariant(sku: String, available: Int, reserved: Int, safety: Int): Long {
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
            "INSERT INTO inventory_balances(variant_id, available_quantity, reserved_quantity, safety_stock) VALUES (?,?,?,?)",
            variantId,
            available,
            reserved,
            safety,
        )
        return variantId
    }

    private fun insertListing(accountId: Long, variantId: Long, externalId: String, state: String): Long =
        jdbc.queryForObject(
            "INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state) VALUES (?,?,NULL,?,?) RETURNING id",
            Long::class.java,
            accountId,
            externalId,
            variantId,
            state,
        )!!

    private fun enableMl() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'", Int::class.java)!!
        capabilities.changeState(actor(), "MARKETPLACE_ML", CapabilityState.ACTIVE, version, "dsp007 enable", UUID.randomUUID())
    }

    private fun disableMl() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'", Int::class.java)!!
        capabilities.changeState(actor(), "MARKETPLACE_ML", CapabilityState.DISABLED, version, "dsp007 restore", UUID.randomUUID())
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
