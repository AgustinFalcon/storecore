package com.storecore.commerce

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.DesiredStockProjectionUseCase
import com.storecore.commerce.application.port.output.InventoryReserveLine
import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.ChannelOutboxKind
import com.storecore.commerce.domain.ProjectionSourceCause
import com.storecore.commerce.infrastructure.JdbcChannelStockOutboxAdapter
import com.storecore.commerce.infrastructure.JdbcInventoryService
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
class Dsp004InventoryCallersTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var capabilities: JdbcCapabilityService
    private lateinit var inventory: JdbcInventoryService
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
        inventory = JdbcInventoryService(jdbc, transactions, projection)
        val hash = Argon2PasswordHasher().hash("a-very-long-password".toCharArray())
        adminId = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id",
            Long::class.java,
            "dsp004-admin@example.com",
            hash,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
        adminSession = CapabilityAdminTestSupport.liveAdminSession(jdbc, adminId)
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('Dsp004', 'dsp004-brand')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('Dsp004', 'dsp004-cat')")
    }

    @AfterAll
    fun stop() = postgres.stop()

    @Test
    fun webCallersProjectOnceAndReleaseIsIdempotent() {
        assertEquals(ProjectionSourceCause.WebConsume, ProjectionSourceCause.fromWire("WEB_CONSUME"))
        assertEquals(ProjectionSourceCause.Unknown, ProjectionSourceCause.fromWire("WEB_CONSUME_X"))
        val high = seedVariant("SKU-DSP004-Z", 12, 0, 2)
        val low = seedVariant("SKU-DSP004-A", 10, 0, 2)
        val accountId = insertAccount("ml-sync-004", ChannelAccountPurpose.ExternalMlSync.wire)
        val listingHigh = insertListing(accountId, high, "MLA-004-Z")
        val listingLow = insertListing(accountId, low, "MLA-004-A")
        enableMl()
        try {
            val saga = UUID.randomUUID()
            inventory.reserveAll(
                saga,
                listOf(
                    InventoryReserveLine(UUID.randomUUID(), high, 1),
                    InventoryReserveLine(UUID.randomUUID(), low, 1),
                ),
                "WEB:dsp004",
            )
            assertEquals(11, available(high))
            assertEquals(9, available(low))
            assertEquals(1, stockOutbox(listingHigh))
            assertEquals(1, stockOutbox(listingLow))
            assertEquals("WEB_RESERVE", sourceCause(listingHigh))
            val consumed = inventory.consumeSaga(saga, "WEB:dsp004-consume")
            assertEquals(2, consumed)
            assertEquals(11, available(high))
            assertEquals(1, stockOutbox(listingHigh))
            assertEquals("WEB_RESERVE", sourceCause(listingHigh))
            assertEquals(0, inventory.releaseSaga(saga, "WEB:dsp004-accredited"))
            assertEquals(11, available(high))
            val unpaid = UUID.randomUUID()
            inventory.reserveAll(unpaid, listOf(InventoryReserveLine(UUID.randomUUID(), low, 1)), "WEB:dsp004-unpaid")
            assertEquals(8, available(low))
            assertEquals(2, stockOutbox(listingLow))
            val released = inventory.releaseSaga(unpaid, "WEB:dsp004-release")
            assertEquals(1, released)
            assertEquals(9, available(low))
            assertEquals("RELEASED", jdbc.queryForObject("SELECT status FROM inventory_reservations WHERE reservation_saga_key=?", String::class.java, unpaid))
            val replay = inventory.releaseSaga(unpaid, "WEB:dsp004-release")
            assertEquals(0, replay)
            assertEquals(9, available(low))
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE event_type='RELEASE' AND actor='WEB:dsp004-release'", Int::class.java))
            jdbc.update(
                """INSERT INTO inventory_reservations(variant_id,reservation_saga_key,reservation_line_key,quantity,status,expires_at,created_at)
                   VALUES (?,?,?,1,'ACTIVE', now() - interval '1 minute', now() - interval '40 minutes')""",
                high, UUID.randomUUID(), UUID.randomUUID(),
            )
            jdbc.update("UPDATE inventory_balances SET available_quantity=available_quantity-1, reserved_quantity=reserved_quantity+1 WHERE variant_id=?", high)
            inventory.expireOverdue()
            assertEquals("EXPIRED", jdbc.queryForObject("SELECT status FROM inventory_reservations WHERE variant_id=? AND status='EXPIRED' LIMIT 1", String::class.java, high))
            assertEquals(11, available(high))
        } finally {
            disableMl()
        }
        val isolated = seedVariant("SKU-DSP004-OFF", 5, 0, 0)
        inventory.reserve(UUID.randomUUID(), UUID.randomUUID(), isolated, 1, "WEB:off")
        assertEquals(4, available(isolated))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind=? AND listing_id IS NULL", Int::class.java, ChannelOutboxKind.StockDesiredChanged.wire))
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
    }

    @Test
    fun deliveryFailureRollsBackReserve() {
        val variantId = seedVariant("SKU-DSP004-RB", 6, 0, 1)
        val accountId = insertAccount("ml-sync-004rb", ChannelAccountPurpose.ExternalMlSync.wire)
        val listingId = insertListing(accountId, variantId, "MLA-004-RB")
        jdbc.execute(
            """
            CREATE OR REPLACE FUNCTION dsp004_fail_stock_delivery() RETURNS trigger LANGUAGE plpgsql AS ${'$'}${'$'}
            BEGIN
              IF EXISTS (SELECT 1 FROM public.channel_outbox o WHERE o.id = NEW.outbox_id AND o.kind = 'STOCK_DESIRED_CHANGED') THEN
                RAISE EXCEPTION 'DSP004_DELIVERY_FAIL';
              END IF;
              RETURN NEW;
            END;
            ${'$'}${'$'}
            """.trimIndent(),
        )
        jdbc.execute(
            """
            CREATE TRIGGER trg_dsp004_fail_stock_delivery
              BEFORE INSERT ON public.channel_outbox_delivery
              FOR EACH ROW EXECUTE FUNCTION dsp004_fail_stock_delivery()
            """.trimIndent(),
        )
        enableMl()
        try {
            val error = assertThrows(Exception::class.java) {
                inventory.reserve(UUID.randomUUID(), UUID.randomUUID(), variantId, 1, "WEB:rb")
            }
            assertTrue(error.message.orEmpty().contains("DSP004_DELIVERY_FAIL") || error.cause?.message.orEmpty().contains("DSP004_DELIVERY_FAIL"), error.toString())
            assertEquals(6, available(variantId))
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_reservations WHERE variant_id=?", Int::class.java, variantId))
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE listing_id=? AND kind=?", Int::class.java, listingId, ChannelOutboxKind.StockDesiredChanged.wire))
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS trg_dsp004_fail_stock_delivery ON public.channel_outbox_delivery")
            jdbc.execute("DROP FUNCTION IF EXISTS dsp004_fail_stock_delivery()")
            disableMl()
        }
    }

    private fun available(variantId: Long): Int =
        jdbc.queryForObject("SELECT available_quantity FROM inventory_balances WHERE variant_id=?", Int::class.java, variantId)!!

    private fun stockOutbox(listingId: Long): Int =
        jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE listing_id=? AND kind=?", Int::class.java, listingId, ChannelOutboxKind.StockDesiredChanged.wire)!!

    private fun sourceCause(listingId: Long): String =
        jdbc.queryForObject("SELECT source_cause FROM channel_listing_stock_projection WHERE listing_id=?", String::class.java, listingId)!!

    private fun insertAccount(key: String, purpose: String): Long =
        jdbc.queryForObject(
            "INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state,purpose) VALUES (?,'MERCADO_LIBRE','ref:dsp004','ACTIVE',?) RETURNING id",
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

    private fun insertListing(accountId: Long, variantId: Long, externalId: String): Long =
        jdbc.queryForObject(
            "INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state) VALUES (?,?,NULL,?,'ACTIVE') RETURNING id",
            Long::class.java,
            accountId,
            externalId,
            variantId,
        )!!

    private fun enableMl() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'", Int::class.java)!!
        capabilities.changeState(InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN)), "MARKETPLACE_ML", CapabilityState.ACTIVE, version, "dsp004 enable", UUID.randomUUID())
    }

    private fun disableMl() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'", Int::class.java)!!
        capabilities.changeState(InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN)), "MARKETPLACE_ML", CapabilityState.DISABLED, version, "dsp004 restore", UUID.randomUUID())
    }

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
