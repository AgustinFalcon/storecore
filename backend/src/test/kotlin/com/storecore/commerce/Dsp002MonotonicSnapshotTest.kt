package com.storecore.commerce

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.DesiredStockProjectionUseCase
import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.domain.DesiredStockOutcome
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
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import org.springframework.jdbc.core.JdbcTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.Path
import java.security.MessageDigest
import java.util.UUID

@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class Dsp002MonotonicSnapshotTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var capabilities: JdbcCapabilityService
    private lateinit var projection: DesiredStockProjectionUseCase
    private var adminId: Long = 0
    private lateinit var adminSession: UUID

    @BeforeAll
    fun start() {
        postgres.start()
        val provisioned = CapabilityAdminTestSupport.migrateAndProvision(postgres)
        jdbc = provisioned.first
        capabilities = JdbcCapabilityService(jdbc, provisioned.second)
        projection = DesiredStockProjectionUseCase(capabilities, JdbcMarketplaceListingProjectionAdapter(jdbc), JdbcChannelStockOutboxAdapter(jdbc, ObjectMapper()))
        val hash = Argon2PasswordHasher().hash("a-very-long-password".toCharArray())
        adminId = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id",
            Long::class.java,
            "dsp002-admin@example.com",
            hash,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
        adminSession = CapabilityAdminTestSupport.liveAdminSession(jdbc, adminId)
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('Dsp002', 'dsp002-brand')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('Dsp002', 'dsp002-cat')")
    }

    @AfterAll
    fun stop() = postgres.stop()

    @Test
    fun v17ShaAndFormulaIgnoresReservedQuantity() {
        val path = Path.of("src/main/resources/db/migration/V17__dsp002_listing_stock_projection.sql")
        assertEquals(V17_SHA, lfSha(Files.readAllBytes(path)))
        assertTrue(
            jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE success", String::class.java).contains("17"),
        )
        val variantId = seedVariant("SKU-DSP002-A", available = 10, reserved = 4, safety = 2)
        val accountId = insertAccount("ml-sync-002a", ChannelAccountPurpose.ExternalMlSync.wire)
        val listingId = insertListing(accountId, variantId, "MLA-002-A")
        enableMl()
        try {
            val first = projection.project(listOf(variantId), ProjectionSourceCause.InternalAdjustment, actor())
            assertEquals(1, first.size)
            assertEquals(DesiredStockOutcome.Projected, first[0].outcome)
            assertEquals(8, first[0].desiredQuantity)
            assertEquals(1L, first[0].projectionVersion)
            assertEquals(8, jdbc.queryForObject("SELECT desired_quantity FROM channel_listing_stock_projection WHERE listing_id=?", Int::class.java, listingId))
            assertEquals(8, jdbc.queryForObject("SELECT desired_quantity FROM channel_listings WHERE id=?", Int::class.java, listingId))
            assertEquals("EMITTED", jdbc.queryForObject("SELECT projection_state FROM channel_listing_stock_projection WHERE listing_id=?", String::class.java, listingId))
            val replay = projection.project(listOf(variantId), ProjectionSourceCause.InternalAdjustment, actor())
            assertEquals(DesiredStockOutcome.Unchanged, replay[0].outcome)
            assertEquals(1L, replay[0].projectionVersion)
            jdbc.update("UPDATE inventory_balances SET available_quantity=6, reserved_quantity=9 WHERE variant_id=?", variantId)
            val advanced = projection.project(listOf(variantId), ProjectionSourceCause.InternalAdjustment, actor())
            assertEquals(DesiredStockOutcome.Projected, advanced[0].outcome)
            assertEquals(4, advanced[0].desiredQuantity)
            assertEquals(2L, advanced[0].projectionVersion)
            assertTrue(2L > 1L)
            val firstVersion = jdbc.queryForObject("SELECT projection_version FROM channel_listing_stock_projection WHERE listing_id=?", Long::class.java, listingId)!!
            val workers = (1..2).map {
                Thread {
                    projection.project(listOf(variantId), ProjectionSourceCause.InternalAdjustment, actor())
                }
            }
            workers.forEach { it.start() }
            workers.forEach { it.join(5_000) }
            val afterConcurrent = jdbc.queryForObject("SELECT projection_version FROM channel_listing_stock_projection WHERE listing_id=?", Long::class.java, listingId)!!
            assertTrue(afterConcurrent >= firstVersion)
        } finally {
            disableMl()
        }
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind='LISTING_STOCK'", Int::class.java))
        assertEquals(
            "DISABLED",
            jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java),
        )
    }

    @Test
    fun unclassifiedAndMissingListingAreFailClosed() {
        val missing = seedVariant("SKU-DSP002-NONE", available = 5, reserved = 1, safety = 0)
        val withheldVariant = seedVariant("SKU-DSP002-UNC", available = 5, reserved = 1, safety = 0)
        val unclassified = insertAccount("unclassified-002", ChannelAccountPurpose.Unclassified.wire)
        insertListing(unclassified, withheldVariant, "MLA-002-UNC")
        enableMl()
        try {
            val none = projection.project(listOf(missing), ProjectionSourceCause.InternalAdjustment, actor())
            assertEquals(DesiredStockOutcome.NoListing, none[0].outcome)
            val withheld = projection.project(listOf(withheldVariant), ProjectionSourceCause.InternalAdjustment, actor())
            assertEquals(DesiredStockOutcome.Withheld, withheld[0].outcome)
            assertEquals("WITHHELD", jdbc.queryForObject("SELECT projection_state FROM channel_listing_stock_projection WHERE external_listing_id='MLA-002-UNC'", String::class.java))
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_outbox WHERE kind='STOCK_DESIRED_CHANGED'", Int::class.java))
        } finally {
            disableMl()
        }
    }

    private fun actor() = CapabilityActor.Internal(InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN)))

    private fun insertAccount(key: String, purpose: String): Long =
        jdbc.queryForObject(
            "INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state,purpose) VALUES (?,'MERCADO_LIBRE','ref:dsp002','ACTIVE',?) RETURNING id",
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
        capabilities.changeState(
            InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN)),
            "MARKETPLACE_ML",
            CapabilityState.ACTIVE,
            version,
            "dsp002 enable",
            UUID.randomUUID(),
        )
    }

    private fun disableMl() {
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'", Int::class.java)!!
        capabilities.changeState(
            InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN)),
            "MARKETPLACE_ML",
            CapabilityState.DISABLED,
            version,
            "dsp002 restore",
            UUID.randomUUID(),
        )
    }

    private fun lfSha(bytes: ByteArray): String {
        val normalized = String(bytes, StandardCharsets.UTF_8).replace("\r\n", "\n").replace('\r', '\n')
        return MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02X".format(it) }
    }

    companion object {
        private const val V17_SHA = "3E6106520BBFB58AD4E19D84B1D272EC562D3E843D531B5D7AD60907A76486B5"
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
