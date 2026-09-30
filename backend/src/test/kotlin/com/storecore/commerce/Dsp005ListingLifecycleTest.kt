package com.storecore.commerce

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.catalog.infrastructure.JdbcCatalogService
import com.storecore.commerce.application.CreateListingMappingCommand
import com.storecore.commerce.application.CreateListingMappingUseCase
import com.storecore.commerce.application.DesiredStockProjectionUseCase
import com.storecore.commerce.application.ListingLifecycleCommand
import com.storecore.commerce.application.ListingLifecycleUseCase
import com.storecore.commerce.application.port.output.EffectivePriceQueryPort
import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.ChannelOutboxKind
import com.storecore.commerce.domain.ListingLifecycleAction
import com.storecore.commerce.infrastructure.JdbcChannelListingMappingAdapter
import com.storecore.commerce.infrastructure.JdbcChannelStockOutboxAdapter
import com.storecore.commerce.infrastructure.JdbcInventoryService
import com.storecore.commerce.infrastructure.JdbcMarketplaceAccountSelector
import com.storecore.commerce.infrastructure.JdbcMarketplaceListingProjectionAdapter
import com.storecore.configuration.CapabilityAdminTestSupport
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
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Dsp005ListingLifecycleTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var capabilities: JdbcCapabilityService
    private lateinit var mapping: CreateListingMappingUseCase
    private lateinit var lifecycle: ListingLifecycleUseCase
    private lateinit var catalog: JdbcCatalogService
    private lateinit var transactions: TransactionTemplate
    private var adminId: Long = 0
    private lateinit var adminSession: UUID

    @BeforeAll
    fun start() {
        postgres.start()
        val provisioned = CapabilityAdminTestSupport.migrateAndProvision(postgres)
        jdbc = provisioned.first
        capabilities = JdbcCapabilityService(jdbc, provisioned.second)
        transactions = TransactionTemplate(DataSourceTransactionManager(jdbc.dataSource!!))
        val projection = DesiredStockProjectionUseCase(
            capabilities,
            JdbcMarketplaceListingProjectionAdapter(jdbc),
            JdbcChannelStockOutboxAdapter(jdbc, ObjectMapper()),
        )
        val mappings = JdbcChannelListingMappingAdapter(jdbc)
        val accounts = JdbcMarketplaceAccountSelector(jdbc)
        mapping = CreateListingMappingUseCase(capabilities, accounts, mappings, projection, jdbc, transactions)
        lifecycle = ListingLifecycleUseCase(capabilities, accounts, mappings, projection, jdbc, transactions)
        val inventory = JdbcInventoryService(jdbc, transactions, projection)
        catalog = JdbcCatalogService(jdbc, ObjectMapper(), inventory, transactions, object : EffectivePriceQueryPort {
            override fun findBySkus(skus: Collection<String>) = emptyMap<String, com.storecore.commerce.domain.EffectivePrice>()
        })
        val hash = Argon2PasswordHasher().hash("a-very-long-password".toCharArray())
        adminId = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id",
            Long::class.java,
            "dsp005-admin@example.com",
            hash,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
        adminSession = CapabilityAdminTestSupport.liveAdminSession(jdbc, adminId)
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('Dsp005', 'dsp005-brand')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('Dsp005', 'dsp005-cat')")
    }

    @AfterAll
    fun stop() = postgres.stop()

    @Test
    fun createStaysPausedActivateProjectsPauseWithholdsRemapBlocksConfirmBaselines() {
        assertEquals(ListingLifecycleAction.Activate, ListingLifecycleAction.fromWire("activate"))
        assertEquals(ListingLifecycleAction.Unknown, ListingLifecycleAction.fromWire("SHIP"))
        val skuA = seedVariant("SKU-DSP005-A", 10, 0, 2)
        val second = seedVariant("SKU-DSP005-B", 8, 0, 0)
        val accountId = insertAccount("ml-sync-005", ChannelAccountPurpose.ExternalMlSync.wire)
        enableMl()
        try {
            mapping.execute(actor(), CreateListingMappingCommand(accountId, "MLA-005", "", "SKU-DSP005-A"))
            val listingId = jdbc.queryForObject("SELECT id FROM channel_listings WHERE external_listing_id='MLA-005'", Long::class.java)!!
            assertEquals("PAUSED", jdbc.queryForObject("SELECT state FROM channel_listings WHERE id=?", String::class.java, listingId))
            assertEquals(skuA, jdbc.queryForObject("SELECT variant_id FROM channel_listings WHERE id=?", Long::class.java, listingId))
            assertEquals(0, stockOutbox(listingId))
            assertEquals("WITHHELD", jdbc.queryForObject("SELECT projection_state FROM channel_listing_stock_projection WHERE listing_id=?", String::class.java, listingId))
            lifecycle.execute(actor(), ListingLifecycleCommand(accountId, "MLA-005", "", ListingLifecycleAction.Activate))
            assertEquals("ACTIVE", jdbc.queryForObject("SELECT state FROM channel_listings WHERE id=?", String::class.java, listingId))
            assertEquals(1, stockOutbox(listingId))
            assertEquals("EMITTED", jdbc.queryForObject("SELECT projection_state FROM channel_listing_stock_projection WHERE listing_id=?", String::class.java, listingId))
            lifecycle.execute(actor(), ListingLifecycleCommand(accountId, "MLA-005", "", ListingLifecycleAction.Pause))
            assertEquals("PAUSED", jdbc.queryForObject("SELECT state FROM channel_listings WHERE id=?", String::class.java, listingId))
            assertEquals("WITHHELD", jdbc.queryForObject("SELECT projection_state FROM channel_listing_stock_projection WHERE listing_id=?", String::class.java, listingId))
            assertEquals(1, stockOutbox(listingId))
            mapping.execute(actor(), CreateListingMappingCommand(accountId, "MLA-005", "", "SKU-DSP005-B"))
            assertEquals(true, jdbc.queryForObject("SELECT manual_intervention_required FROM channel_listings WHERE id=?", Boolean::class.java, listingId))
            assertEquals(second, jdbc.queryForObject("SELECT variant_id FROM channel_listings WHERE id=?", Long::class.java, listingId))
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE event_type='LISTING_REMAP_BLOCKED'", Int::class.java))
            assertThrows(Exception::class.java) {
                lifecycle.execute(actor(), ListingLifecycleCommand(accountId, "MLA-005", "", ListingLifecycleAction.Activate))
            }
            lifecycle.execute(actor(), ListingLifecycleCommand(accountId, "MLA-005", "", ListingLifecycleAction.ConfirmMapping))
            assertEquals(false, jdbc.queryForObject("SELECT manual_intervention_required FROM channel_listings WHERE id=?", Boolean::class.java, listingId))
            assertEquals(2, stockOutbox(listingId))
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM audit_events WHERE event_type='LISTING_MAPPING_CONFIRMED'", Int::class.java))
        } finally {
            disableMl()
        }
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind='LISTING_STOCK'", Int::class.java))
    }

    @Test
    fun saveProductDeliveryFailureRollsBackCatalogBalanceAndOutbox() {
        val variantId = seedVariant("SKU-DSP005-RB", 6, 0, 1)
        val accountId = insertAccount("ml-sync-005rb", ChannelAccountPurpose.ExternalMlSync.wire)
        enableMl()
        try {
            mapping.execute(actor(), CreateListingMappingCommand(accountId, "MLA-005-RB", "", "SKU-DSP005-RB"))
            lifecycle.execute(actor(), ListingLifecycleCommand(accountId, "MLA-005-RB", "", ListingLifecycleAction.Activate))
            val listingId = jdbc.queryForObject("SELECT id FROM channel_listings WHERE external_listing_id='MLA-005-RB'", Long::class.java)!!
            assertEquals(1, stockOutbox(listingId))
            jdbc.execute(
                """
                CREATE OR REPLACE FUNCTION dsp005_fail_stock_delivery() RETURNS trigger LANGUAGE plpgsql AS ${'$'}${'$'}
                BEGIN
                  IF EXISTS (SELECT 1 FROM public.channel_outbox o WHERE o.id = NEW.outbox_id AND o.kind = 'STOCK_DESIRED_CHANGED') THEN
                    RAISE EXCEPTION 'DSP005_DELIVERY_FAIL';
                  END IF;
                  RETURN NEW;
                END;
                ${'$'}${'$'}
                """.trimIndent(),
            )
            jdbc.execute(
                """
                CREATE TRIGGER trg_dsp005_fail_stock_delivery
                  BEFORE INSERT ON public.channel_outbox_delivery
                  FOR EACH ROW EXECUTE FUNCTION dsp005_fail_stock_delivery()
                """.trimIndent(),
            )
            val error = assertThrows(Exception::class.java) {
                catalog.saveProduct(
                    sku = "SKU-DSP005-RB",
                    name = "RolledBack",
                    description = "should not stick",
                    brand = "Dsp005",
                    category = "Dsp005",
                    images = emptyList(),
                    variants = listOf(mapOf("sku" to "SKU-DSP005-RB", "name" to "RolledBack", "availableQuantity" to 3, "stockAdjustmentReason" to "dsp005-rb")),
                    price = mapOf("base" to 10),
                    active = true,
                    actor = adminId,
                )
            }
            assertTrue(error.message.orEmpty().contains("DSP005_DELIVERY_FAIL") || error.cause?.message.orEmpty().contains("DSP005_DELIVERY_FAIL"), error.toString())
            assertEquals("SKU-DSP005-RB", jdbc.queryForObject("SELECT name FROM products p JOIN product_variants v ON v.product_id=p.id WHERE v.id=?", String::class.java, variantId))
            assertEquals(6, jdbc.queryForObject("SELECT available_quantity FROM inventory_balances WHERE variant_id=?", Int::class.java, variantId))
            assertEquals(1, stockOutbox(listingId))
            assertEquals(5, jdbc.queryForObject("SELECT desired_quantity FROM channel_listing_stock_projection WHERE listing_id=?", Int::class.java, listingId))
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS trg_dsp005_fail_stock_delivery ON public.channel_outbox_delivery")
            jdbc.execute("DROP FUNCTION IF EXISTS dsp005_fail_stock_delivery()")
            disableMl()
        }
    }

    private fun stockOutbox(listingId: Long): Int =
        jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE listing_id=? AND kind=?", Int::class.java, listingId, ChannelOutboxKind.StockDesiredChanged.wire)!!

    private fun actor() = InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN))

    private fun insertAccount(key: String, purpose: String): Long =
        jdbc.queryForObject(
            "INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state,purpose) VALUES (?,'MERCADO_LIBRE','ref:dsp005','ACTIVE',?) RETURNING id",
            Long::class.java, key, purpose,
        )!!

    private fun seedVariant(sku: String, available: Int, reserved: Int, safety: Int): Long {
        val productId = jdbc.queryForObject(
            "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, ?, ?, 10, 'ACTIVE') RETURNING id",
            Long::class.java, sku, sku.lowercase(),
        )!!
        val variantId = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id, sku, label) VALUES (?, ?, 'Default') RETURNING id",
            Long::class.java, productId, sku,
        )!!
        jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, reserved_quantity, safety_stock) VALUES (?,?,?,?)", variantId, available, reserved, safety)
        return variantId
    }

    private fun enableMl() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'", Int::class.java)!!
        capabilities.changeState(actor(), "MARKETPLACE_ML", CapabilityState.ACTIVE, version, "dsp005 enable", UUID.randomUUID())
    }

    private fun disableMl() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'", Int::class.java)!!
        capabilities.changeState(actor(), "MARKETPLACE_ML", CapabilityState.DISABLED, version, "dsp005 restore", UUID.randomUUID())
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
