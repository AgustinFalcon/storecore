package com.storecore.commerce

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.CreateListingMappingCommand
import com.storecore.commerce.application.CreateListingMappingUseCase
import com.storecore.commerce.application.DesiredStockProjectionUseCase
import com.storecore.commerce.application.ListingLifecycleCommand
import com.storecore.commerce.application.ListingLifecycleUseCase
import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.ChannelOutboxKind
import com.storecore.commerce.domain.DesiredStockOutcome
import com.storecore.commerce.domain.ListingLifecycleAction
import com.storecore.commerce.domain.ProjectionSourceCause
import com.storecore.commerce.infrastructure.JdbcChannelListingMappingAdapter
import com.storecore.commerce.infrastructure.JdbcChannelStockOutboxAdapter
import com.storecore.commerce.infrastructure.JdbcMarketplaceAccountSelector
import com.storecore.commerce.infrastructure.JdbcMarketplaceListingProjectionAdapter
import com.storecore.configuration.CapabilityAdminTestSupport
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID
import kotlin.streams.asSequence

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Dsp008UpgradeCoexistenceTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var capabilities: JdbcCapabilityService
    private lateinit var transactions: TransactionTemplate
    private lateinit var projection: DesiredStockProjectionUseCase
    private lateinit var mapping: CreateListingMappingUseCase
    private lateinit var lifecycle: ListingLifecycleUseCase
    private var adminId: Long = 0
    private lateinit var adminSession: UUID

    @BeforeAll
    fun start() {
        postgres.start()
        val provisioned = CapabilityAdminTestSupport.migrateAndProvision(postgres)
        jdbc = provisioned.first
        capabilities = JdbcCapabilityService(jdbc, provisioned.second)
        transactions = TransactionTemplate(DataSourceTransactionManager(jdbc.dataSource!!))
        projection = DesiredStockProjectionUseCase(
            capabilities,
            JdbcMarketplaceListingProjectionAdapter(jdbc),
            JdbcChannelStockOutboxAdapter(jdbc, ObjectMapper()),
        )
        val mappings = JdbcChannelListingMappingAdapter(jdbc)
        mapping = CreateListingMappingUseCase(capabilities, JdbcMarketplaceAccountSelector(jdbc), mappings, projection, jdbc, transactions)
        lifecycle = ListingLifecycleUseCase(capabilities, JdbcMarketplaceAccountSelector(jdbc), mappings, projection, jdbc, transactions)
        val hash = Argon2PasswordHasher().hash("a-very-long-password".toCharArray())
        adminId = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id",
            Long::class.java,
            "dsp008-admin@example.com",
            hash,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
        adminSession = CapabilityAdminTestSupport.liveAdminSession(jdbc, adminId)
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('Dsp008', 'dsp008-brand')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('Dsp008', 'dsp008-cat')")
    }

    @AfterAll
    fun stop() = postgres.stop()

    @Test
    fun flywayCeilingIsV19AndNextFreeIsV20() {
        val dir = Path.of("src/main/resources/db/migration")
        val versions = Files.list(dir).use { stream ->
            stream.asSequence().map { it.fileName.toString() }.filter { it.startsWith("V") && it.contains("__") }.sorted().toList()
        }
        assertTrue(versions.any { it.startsWith("V19__") }, versions.toString())
        assertTrue(versions.none { it.startsWith("V20__") }, versions.toString())
        assertTrue(jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE success", String::class.java).contains("19"))
        assertEquals(
            "DISABLED",
            jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java),
        )
    }

    @Test
    fun upgradeQuarantineHistoricListingStockAndRemapKeepImmutableSnapshots() {
        val first = seedVariant("SKU-DSP008-A", 8, 0, 0)
        val second = seedVariant("SKU-DSP008-B", 4, 0, 0)
        val accountId = insertAccount("ml-008", ChannelAccountPurpose.Unclassified.wire)
        val listingId = jdbc.queryForObject(
            "INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state,desired_quantity) VALUES (?,?,NULL,?,'ACTIVE',0) RETURNING id",
            Long::class.java,
            accountId,
            "MLA-008",
            first,
        )!!
        val historyId = jdbc.queryForObject(
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
        val historic = jdbc.queryForObject("SELECT to_jsonb(o)::text FROM channel_outbox AS o WHERE id=?", String::class.java, historyId)!!
        enableMl()
        try {
            lateinit var withheld: List<com.storecore.commerce.domain.DesiredStockProjectionResult>
            transactions.executeWithoutResult {
                withheld = projection.project(listOf(first), ProjectionSourceCause.InternalAdjustment, CapabilityActor.Internal(actor()))
            }
            assertEquals(DesiredStockOutcome.Withheld, withheld.single().outcome)
            assertEquals("WITHHELD", jdbc.queryForObject("SELECT projection_state FROM channel_listing_stock_projection WHERE listing_id=?", String::class.java, listingId))
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE listing_id=? AND kind=?", Int::class.java, listingId, ChannelOutboxKind.StockDesiredChanged.wire))
            jdbc.update("UPDATE channel_accounts SET purpose=?, eligibility_revision=eligibility_revision+1 WHERE id=?", ChannelAccountPurpose.ExternalMlSync.wire, accountId)
            lifecycle.execute(actor(), ListingLifecycleCommand(accountId, "MLA-008", "", ListingLifecycleAction.Activate))
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE listing_id=? AND kind=?", Int::class.java, listingId, ChannelOutboxKind.StockDesiredChanged.wire))
            val emittedVersion = jdbc.queryForObject("SELECT projection_version FROM channel_listing_stock_projection WHERE listing_id=?", Long::class.java, listingId)!!
            mapping.execute(actor(), CreateListingMappingCommand(accountId, "MLA-008", "", "SKU-DSP008-B"))
            assertEquals(true, jdbc.queryForObject("SELECT manual_intervention_required FROM channel_listings WHERE id=?", Boolean::class.java, listingId))
            assertEquals(second, jdbc.queryForObject("SELECT variant_id FROM channel_listings WHERE id=?", Long::class.java, listingId))
            val historicVariant = jdbc.queryForObject(
                "SELECT variant_id FROM channel_outbox_stock_projection WHERE listing_id=? AND projection_version=?",
                Long::class.java,
                listingId,
                emittedVersion,
            )!!
            assertEquals(first, historicVariant)
            assertEquals(historic, jdbc.queryForObject("SELECT to_jsonb(o)::text FROM channel_outbox AS o WHERE id=?", String::class.java, historyId))
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind='LISTING_STOCK'", Int::class.java))
            lifecycle.execute(actor(), ListingLifecycleCommand(accountId, "MLA-008", "", ListingLifecycleAction.ConfirmMapping))
            assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE listing_id=? AND kind=?", Int::class.java, listingId, ChannelOutboxKind.StockDesiredChanged.wire))
            assertThrows(DataIntegrityViolationException::class.java) {
                jdbc.update(
                    """
                    INSERT INTO channel_outbox(idempotency_key, account_id, listing_id, kind, payload_redacted, projection_version)
                    VALUES (?, ?, ?, 'STOCK_DESIRED_CHANGED', '{}'::jsonb, NULL)
                    """.trimIndent(),
                    UUID.randomUUID(),
                    accountId,
                    listingId,
                )
            }
        } finally {
            disableMl()
        }
        assertEquals(
            "DISABLED",
            jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java),
        )
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind='LISTING_STOCK'", Int::class.java))
    }

    private fun actor() = InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN))

    private fun insertAccount(key: String, purpose: String): Long =
        jdbc.queryForObject(
            "INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state,purpose) VALUES (?,'MERCADO_LIBRE','ref:dsp008','ACTIVE',?) RETURNING id",
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

    private fun enableMl() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'", Int::class.java)!!
        capabilities.changeState(actor(), "MARKETPLACE_ML", CapabilityState.ACTIVE, version, "dsp008 enable", UUID.randomUUID())
    }

    private fun disableMl() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'", Int::class.java)!!
        capabilities.changeState(actor(), "MARKETPLACE_ML", CapabilityState.DISABLED, version, "dsp008 restore", UUID.randomUUID())
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
