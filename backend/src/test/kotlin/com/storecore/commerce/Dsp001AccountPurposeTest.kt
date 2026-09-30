package com.storecore.commerce

import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.application.CreateListingMappingCommand
import com.storecore.commerce.application.CreateListingMappingUseCase
import com.storecore.commerce.application.MercadoLibreAccountNotEligible
import com.storecore.commerce.domain.ChannelAccountPurpose
import com.storecore.commerce.infrastructure.JdbcChannelListingMappingAdapter
import com.storecore.commerce.infrastructure.JdbcMarketplaceAccountSelector
import com.storecore.configuration.application.CapabilityDisabled
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.CapabilityAdminTestSupport
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
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.application.DesiredStockProjectionUseCase
import com.storecore.commerce.infrastructure.JdbcChannelStockOutboxAdapter
import com.storecore.commerce.infrastructure.JdbcMarketplaceListingProjectionAdapter
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
class Dsp001AccountPurposeTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var capabilities: JdbcCapabilityService
    private lateinit var mapping: CreateListingMappingUseCase
    private var adminId: Long = 0
    private lateinit var adminSession: UUID

    @BeforeAll
    fun start() {
        postgres.start()
        val provisioned = CapabilityAdminTestSupport.migrateAndProvision(postgres)
        jdbc = provisioned.first
        capabilities = JdbcCapabilityService(jdbc, provisioned.second)
        val transactions = TransactionTemplate(DataSourceTransactionManager(jdbc.dataSource!!))
        mapping = CreateListingMappingUseCase(
            capabilities,
            JdbcMarketplaceAccountSelector(jdbc),
            JdbcChannelListingMappingAdapter(jdbc),
            DesiredStockProjectionUseCase(
                capabilities,
                JdbcMarketplaceListingProjectionAdapter(jdbc),
                JdbcChannelStockOutboxAdapter(jdbc, ObjectMapper()),
            ),
            jdbc,
            transactions,
        )
        val hash = Argon2PasswordHasher().hash("a-very-long-password".toCharArray())
        adminId = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id",
            Long::class.java,
            "dsp001-admin@example.com",
            hash,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", adminId)
        adminSession = CapabilityAdminTestSupport.liveAdminSession(jdbc, adminId)
        jdbc.update("INSERT INTO brands(name, slug) VALUES ('Dsp001', 'dsp001-brand')")
        jdbc.update("INSERT INTO categories(name, slug) VALUES ('Dsp001', 'dsp001-cat')")
    }

    @AfterAll
    fun stop() = postgres.stop()

    @Test
    fun v16ShaFlywayBackfillAndPurposeCheck() {
        val path = Path.of("src/main/resources/db/migration/V16__dsp001_channel_account_purpose.sql")
        assertEquals(V16_SHA, lfSha(Files.readAllBytes(path)))
        assertTrue(
            jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE success", String::class.java).contains("16"),
        )
        jdbc.update("INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state) VALUES ('legacy-unknown','MERCADO_LIBRE','ref:legacy','ACTIVE')")
        assertEquals(
            ChannelAccountPurpose.Unclassified.wire,
            jdbc.queryForObject("SELECT purpose FROM channel_accounts WHERE account_key='legacy-unknown'", String::class.java),
        )
        assertEquals(
            1,
            jdbc.queryForObject("SELECT eligibility_revision FROM channel_accounts WHERE account_key='legacy-unknown'", Int::class.java),
        )
        assertThrows(DataIntegrityViolationException::class.java) {
            jdbc.update(
                "INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state,purpose) VALUES ('bad-purpose','MERCADO_LIBRE','ref:bad','ACTIVE','SOMETHING_ELSE')",
            )
        }
        assertEquals(
            "DISABLED",
            jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java),
        )
    }

    @Test
    fun createListingRejectsMissingUnauthorizedPromoAndUnclassified() {
        val sku = seedSku("SKU-DSP001-A")
        assertThrows(CommerceValidation::class.java) {
            mapping.execute(actor(), CreateListingMappingCommand(null, "MLA-MISS", "", sku))
        }
        assertThrows(CommerceValidation::class.java) {
            mapping.execute(actor(), CreateListingMappingCommand(0L, "MLA-ZERO", "", sku))
        }
        enableMl()
        try {
            assertThrows(MercadoLibreAccountNotEligible::class.java) {
                mapping.execute(actor(), CreateListingMappingCommand(9_999_999L, "MLA-GONE", "", sku))
            }
            val unclassified = insertAccount("unclassified-sync", ChannelAccountPurpose.Unclassified.wire)
            assertThrows(MercadoLibreAccountNotEligible::class.java) {
                mapping.execute(actor(), CreateListingMappingCommand(unclassified, "MLA-UNC", "", sku))
            }
            val promo = insertAccount("internal-price-policy", ChannelAccountPurpose.InternalPricePolicy.wire)
            assertThrows(MercadoLibreAccountNotEligible::class.java) {
                mapping.execute(actor(), CreateListingMappingCommand(promo, "MLA-PROMO", "", sku))
            }
        } finally {
            disableMl()
        }
        assertEquals(
            0,
            jdbc.queryForObject("SELECT COUNT(*) FROM channel_listings WHERE external_listing_id IN ('MLA-MISS','MLA-ZERO','MLA-GONE','MLA-UNC','MLA-PROMO')", Int::class.java),
        )
    }

    @Test
    fun disabledGuardFailsClosedAndExplicitAccountWinsAmongMany() {
        val sku = seedSku("SKU-DSP001-B")
        val first = insertAccount("ml-sync-a", ChannelAccountPurpose.ExternalMlSync.wire)
        val second = insertAccount("ml-sync-b", ChannelAccountPurpose.ExternalMlSync.wire)
        assertTrue(second > first)
        assertThrows(CapabilityDisabled::class.java) {
            mapping.execute(actor(), CreateListingMappingCommand(second, "MLA-GUARD", "", sku))
        }
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_listings WHERE external_listing_id='MLA-GUARD'", Int::class.java))
        enableMl()
        try {
            capabilities.decide("MARKETPLACE_ML", "SYNC", CapabilityActor.Internal(actor()))
            val created = mapping.execute(actor(), CreateListingMappingCommand(second, "MLA-GUARD", "VAR-1", sku))
            assertEquals(second, created.accountId)
            assertEquals(
                second,
                jdbc.queryForObject("SELECT account_id FROM channel_listings WHERE external_listing_id='MLA-GUARD'", Long::class.java),
            )
            assertEquals(
                0,
                jdbc.queryForObject("SELECT COUNT(*) FROM channel_listings WHERE account_id=? AND external_listing_id='MLA-GUARD'", Int::class.java, first),
            )
        } finally {
            disableMl()
        }
        val service = Files.readString(Path.of("src/main/kotlin/com/storecore/commerce/infrastructure/JdbcMercadoLibreService.kt"))
        val selector = Files.readString(Path.of("src/main/kotlin/com/storecore/commerce/infrastructure/JdbcMarketplaceAccountSelector.kt"))
        val useCase = Files.readString(Path.of("src/main/kotlin/com/storecore/commerce/application/CreateListingMappingUseCase.kt"))
        assertTrue(service.contains("ORDER BY id LIMIT 1"), service)
        assertTrue(service.contains("fun notify("), service)
        assertTrue(!selector.contains("ORDER BY"), selector)
        assertTrue(!useCase.contains("ORDER BY"), useCase)
        assertTrue(!useCase.contains("manual-price-writer"), useCase)
        assertTrue(!selector.contains("manual-price-writer"), selector)
        assertEquals(
            "DISABLED",
            jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java),
        )
    }

    private fun actor() = InternalUserPrincipal(adminSession, adminId, setOf(InternalRole.ADMIN))

    private fun insertAccount(key: String, purpose: String): Long =
        jdbc.queryForObject(
            "INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state,purpose) VALUES (?,'MERCADO_LIBRE','ref:dsp001','ACTIVE',?) RETURNING id",
            Long::class.java,
            key,
            purpose,
        )!!

    private fun seedSku(sku: String): String {
        val productId = jdbc.queryForObject(
            "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, ?, ?, 10, 'ACTIVE') RETURNING id",
            Long::class.java,
            sku,
            sku.lowercase(),
        )!!
        jdbc.update("INSERT INTO product_variants(product_id, sku, label) VALUES (?, ?, 'Default')", productId, sku)
        return sku
    }

    private fun enableMl() {
        val version = jdbc.queryForObject(
            "SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'",
            Int::class.java,
        )!!
        capabilities.changeState(actor(), "MARKETPLACE_ML", CapabilityState.ACTIVE, version, "dsp001 enable", UUID.randomUUID())
    }

    private fun disableMl() {
        val version = jdbc.queryForObject(
            "SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'",
            Int::class.java,
        )!!
        capabilities.changeState(actor(), "MARKETPLACE_ML", CapabilityState.DISABLED, version, "dsp001 restore", UUID.randomUUID())
    }

    private fun lfSha(bytes: ByteArray): String {
        val normalized = String(bytes, StandardCharsets.UTF_8).replace("\r\n", "\n").replace('\r', '\n')
        return MessageDigest.getInstance("SHA-256").digest(normalized.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02X".format(it) }
    }

    companion object {
        private const val V16_SHA = "C8E8F95714F1E324B868A1E066E030711CB021984D3EAE27776E5E5BE98D4B18"
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
    }
}
