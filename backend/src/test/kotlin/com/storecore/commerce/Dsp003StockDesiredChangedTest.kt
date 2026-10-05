package com.storecore.commerce

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.DesiredStockProjectionUseCase
import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.ChannelOutboxKind
import com.storecore.commerce.domain.DesiredStockOutcome
import com.storecore.commerce.domain.OutboxDeliveryStatus
import com.storecore.commerce.domain.ProjectionSourceCause
import com.storecore.commerce.infrastructure.JdbcChannelStockOutboxAdapter
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
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Dsp003StockDesiredChangedTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var capabilities: JdbcCapabilityService
    private lateinit var projection: DesiredStockProjectionUseCase
    private lateinit var transactions: TransactionTemplate
    private var adminId: Long = 0
    private lateinit var adminSession: UUID

    @BeforeAll
    fun start() {
        postgres.start()
        val provisioned = CapabilityAdminTestSupport.migrateAndProvision(postgres)
        jdbc = provisioned.first
        capabilities = JdbcCapabilityService(jdbc, provisioned.second)
        projection = DesiredStockProjectionUseCase(
            capabilities,
            JdbcMarketplaceListingProjectionAdapter(jdbc),
            JdbcChannelStockOutboxAdapter(jdbc, ObjectMapper()),
        )
        transactions = TransactionTemplate(DataSourceTransactionManager(jdbc.dataSource!!))
        val hash = Argon2PasswordHasher().hash("a-very-long-password".toCharArray())
        adminId = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id",
            Long::class.java,
            "dsp003-admin@example.com",
            hash,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
        adminSession = CapabilityAdminTestSupport.liveAdminSession(jdbc, adminId)
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('Dsp003', 'dsp003-brand')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('Dsp003', 'dsp003-cat')")
    }

    @AfterAll
    fun stop() = postgres.stop()

    @Test
    fun v18ShaEmittedWritesPendingOutboxWithheldDoesNot() {
        val path = Path.of("src/main/resources/db/migration/V18__dsp003_stock_desired_changed_outbox.sql")
        assertEquals(V18_SHA, lfSha(Files.readAllBytes(path)))
        assertEquals(
            "20",
            jdbc.queryForObject("SELECT MAX(version::int)::text FROM flyway_schema_history WHERE success", String::class.java),
        )
        val variantId = seedVariant("SKU-DSP003-A", 10, 4, 2)
        val accountId = insertAccount("ml-sync-003a", ChannelAccountPurpose.ExternalMlSync.wire)
        val listingId = insertListing(accountId, variantId, "MLA-003-A")
        enableMl()
        try {
            val first = transactions.execute { projection.project(listOf(variantId), ProjectionSourceCause.InternalAdjustment, actor()) }!!
            assertEquals(DesiredStockOutcome.Projected, first[0].outcome)
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind=? AND listing_id=?", Int::class.java, ChannelOutboxKind.StockDesiredChanged.wire, listingId))
            assertEquals(1L, jdbc.queryForObject("SELECT projection_version FROM channel_outbox WHERE listing_id=? AND kind=?", Long::class.java, listingId, ChannelOutboxKind.StockDesiredChanged.wire))
            assertEquals(
                OutboxDeliveryStatus.Pending.wire,
                jdbc.queryForObject(
                    "SELECT d.status FROM channel_outbox_delivery d JOIN channel_outbox o ON o.id=d.outbox_id WHERE o.listing_id=? AND o.kind=?",
                    String::class.java,
                    listingId,
                    ChannelOutboxKind.StockDesiredChanged.wire,
                ),
            )
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox_stock_projection WHERE listing_id=? AND projection_version=1", Int::class.java, listingId))
            val replay = transactions.execute { projection.project(listOf(variantId), ProjectionSourceCause.InternalAdjustment, actor()) }!!
            assertEquals(DesiredStockOutcome.Unchanged, replay[0].outcome)
            assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind=? AND listing_id=?", Int::class.java, ChannelOutboxKind.StockDesiredChanged.wire, listingId))
        } finally {
            disableMl()
        }
        val withheldVariant = seedVariant("SKU-DSP003-W", 5, 1, 0)
        val unclassified = insertAccount("unclassified-003", ChannelAccountPurpose.Unclassified.wire)
        insertListing(unclassified, withheldVariant, "MLA-003-W")
        enableMl()
        try {
            val withheld = transactions.execute { projection.project(listOf(withheldVariant), ProjectionSourceCause.InternalAdjustment, actor()) }!!
            assertEquals(DesiredStockOutcome.Withheld, withheld[0].outcome)
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind=? AND listing_id=(SELECT id FROM channel_listings WHERE external_listing_id='MLA-003-W')", Int::class.java, ChannelOutboxKind.StockDesiredChanged.wire))
        } finally {
            disableMl()
        }
        jdbc.update(
            "INSERT INTO channel_outbox(idempotency_key,account_id,listing_id,kind,payload_redacted) VALUES (?,?,?,'SALE_APPLIED','{\"externalOrderId\":\"keep\"}'::jsonb)",
            UUID.randomUUID(),
            accountId,
            listingId,
        )
        assertThrows(Exception::class.java) {
            jdbc.update(
                "INSERT INTO channel_outbox(idempotency_key,account_id,listing_id,kind,payload_redacted,projection_version) VALUES (?,?,?,'STOCK_DESIRED_CHANGED','{\"listingId\":\"x\"}'::jsonb,NULL)",
                UUID.randomUUID(),
                accountId,
                listingId,
            )
        }
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox_delivery WHERE status<>'PENDING'", Int::class.java))
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
    }

    @Test
    fun deliveryFailureRollsBackSnapshotAndOutbox() {
        val variantId = seedVariant("SKU-DSP003-RB", 7, 0, 1)
        val accountId = insertAccount("ml-sync-003rb", ChannelAccountPurpose.ExternalMlSync.wire)
        val listingId = insertListing(accountId, variantId, "MLA-003-RB")
        jdbc.execute(
            """
            CREATE OR REPLACE FUNCTION dsp003_fail_stock_delivery() RETURNS trigger LANGUAGE plpgsql AS ${'$'}${'$'}
            BEGIN
              IF EXISTS (SELECT 1 FROM public.channel_outbox o WHERE o.id = NEW.outbox_id AND o.kind = 'STOCK_DESIRED_CHANGED') THEN
                RAISE EXCEPTION 'DSP003_DELIVERY_FAIL';
              END IF;
              RETURN NEW;
            END;
            ${'$'}${'$'}
            """.trimIndent(),
        )
        jdbc.execute(
            """
            CREATE TRIGGER trg_dsp003_fail_stock_delivery
              BEFORE INSERT ON public.channel_outbox_delivery
              FOR EACH ROW EXECUTE FUNCTION dsp003_fail_stock_delivery()
            """.trimIndent(),
        )
        enableMl()
        try {
            val error = assertThrows(Exception::class.java) {
                transactions.execute { projection.project(listOf(variantId), ProjectionSourceCause.InternalAdjustment, actor()) }
            }
            assertTrue(error.message.orEmpty().contains("DSP003_DELIVERY_FAIL") || error.cause?.message.orEmpty().contains("DSP003_DELIVERY_FAIL"), error.toString())
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_listing_stock_projection WHERE listing_id=?", Int::class.java, listingId))
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE listing_id=? AND kind=?", Int::class.java, listingId, ChannelOutboxKind.StockDesiredChanged.wire))
            assertEquals(0, jdbc.queryForObject("SELECT desired_quantity FROM channel_listings WHERE id=?", Int::class.java, listingId))
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS trg_dsp003_fail_stock_delivery ON public.channel_outbox_delivery")
            jdbc.execute("DROP FUNCTION IF EXISTS dsp003_fail_stock_delivery()")
            disableMl()
        }
    }

    private fun actor() = CapabilityActor.Internal(InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN)))

    private fun insertAccount(key: String, purpose: String): Long =
        jdbc.queryForObject(
            "INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state,purpose) VALUES (?,'MERCADO_LIBRE','ref:dsp003','ACTIVE',?) RETURNING id",
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
        capabilities.changeState(InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN)), "MARKETPLACE_ML", CapabilityState.ACTIVE, version, "dsp003 enable", UUID.randomUUID())
    }

    private fun disableMl() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'", Int::class.java)!!
        capabilities.changeState(InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN)), "MARKETPLACE_ML", CapabilityState.DISABLED, version, "dsp003 restore", UUID.randomUUID())
    }

    private fun lfSha(bytes: ByteArray): String {
        val normalized = String(bytes, StandardCharsets.UTF_8).replace("\r\n", "\n").replace('\r', '\n')
        return MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02X".format(it) }
    }

    companion object {
        private const val V18_SHA = "974C840C4BDC39C2CA95EB861FCE9DC9FD5BF9571D6042DB8BF6D516F1A086AE"
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
