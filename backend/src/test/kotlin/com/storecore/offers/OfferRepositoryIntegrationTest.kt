package com.storecore.offers

import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.offers.application.OfferTransitionInvalid
import com.storecore.offers.application.OfferValidationFailed
import com.storecore.offers.infrastructure.JdbcOfferRepository
import com.storecore.offers.domain.DiscountKind
import com.storecore.offers.domain.OfferDraft
import com.storecore.offers.domain.OfferStatus
import com.storecore.offers.domain.OfferTransition
import org.flywaydb.core.Flyway
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DriverManagerDataSource
import org.testcontainers.containers.PostgreSQLContainer
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull

class OfferRepositoryIntegrationTest {
    private lateinit var jdbc: JdbcTemplate
    private lateinit var repository: JdbcOfferRepository
    private lateinit var actor: InternalUserPrincipal

    @BeforeEach
    fun seed() {
        jdbc = JdbcTemplate(DriverManagerDataSource(postgres.jdbcUrl, postgres.username, postgres.password))
        repository = JdbcOfferRepository(jdbc)
        jdbc.update("DELETE FROM offer_products")
        jdbc.update("DELETE FROM offers")
        jdbc.update("DELETE FROM product_variants")
        jdbc.update("DELETE FROM products")
        jdbc.update("DELETE FROM identity_session_csrf_tokens")
        jdbc.update("DELETE FROM identity_sessions")
        jdbc.update("DELETE FROM user_roles")
        jdbc.update("DELETE FROM users")
        val userId = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?,?,?) RETURNING id",
            Long::class.java, "offers-${UUID.randomUUID()}@example.invalid", "\$argon2id\$test", "Admin", "Offers",
        )!!
        actor = InternalUserPrincipal(UUID.randomUUID(), userId, setOf(InternalRole.ADMIN))
        product("SKU-A", "1000.00", "ACTIVE", true, "SKU-A-ALT")
        product("SKU-B", "500.00", "ACTIVE", true)
    }

    @Test
    fun `create resolves local product scope and transitions atomically`() {
        val created = repository.create(actor, draft(listOf("SKU-A"), DiscountKind.PERCENT, "15.00"))
        assertEquals(OfferStatus.DRAFT, created.status)
        assertEquals(listOf("SKU-A", "SKU-A-ALT"), created.skus)
        val active = repository.transition(actor, created.id, OfferTransition.Activate)
        assertEquals(OfferStatus.ACTIVE, active.status)
        assertNotNull(active.approvedAt)
        assertEquals(OfferStatus.PAUSED, repository.transition(actor, created.id, OfferTransition.Pause).status)
        assertEquals(OfferStatus.ACTIVE, repository.transition(actor, created.id, OfferTransition.Activate).status)
        assertEquals(OfferStatus.ENDED, repository.transition(actor, created.id, OfferTransition.End).status)
        assertFailsWith<OfferTransitionInvalid> { repository.transition(actor, created.id, OfferTransition.Activate) }
        assertEquals(5, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE aggregate_type='offers' AND aggregate_id=?", Int::class.java, created.id))
    }

    @Test
    fun `invalid scope and fixed discount roll back without partial offer`() {
        val before = countOffers()
        assertFailsWith<OfferValidationFailed> { repository.create(actor, draft(listOf("MISSING"), DiscountKind.PERCENT, "10.00")) }
        assertFailsWith<OfferValidationFailed> { repository.create(actor, draft(listOf("SKU-B"), DiscountKind.FIXED, "500.01")) }
        assertEquals(before, countOffers())
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM offer_products", Int::class.java))
    }

    @Test
    fun `list winner order is priority descending then id ascending`() {
        val first = repository.create(actor, draft(listOf("SKU-A"), priority = 8))
        val second = repository.create(actor, draft(listOf("SKU-B"), priority = 8))
        val lower = repository.create(actor, draft(listOf("SKU-B"), priority = 1))
        assertEquals(listOf(first.id, second.id, lower.id), repository.list().map { it.id })
    }

    private fun draft(
        skus: List<String>,
        kind: DiscountKind = DiscountKind.PERCENT,
        value: String = "10.00",
        priority: Int = 4,
    ) = OfferDraft("Oferta local", priority, Instant.now().plusSeconds(60), Instant.now().plusSeconds(3600), kind, BigDecimal(value), BigDecimal.ZERO, skus)

    private fun product(sku: String, price: String, status: String, active: Boolean, secondSku: String? = null) {
        val id = jdbc.queryForObject(
            "INSERT INTO products(name,slug,base_price,status) VALUES (?,?,?,?) RETURNING id",
            Long::class.java, sku, sku.lowercase() + "-" + UUID.randomUUID(), BigDecimal(price), status,
        )!!
        jdbc.update("INSERT INTO product_variants(product_id,sku,label,active) VALUES (?,?,?,?)", id, sku, sku, active)
        secondSku?.let { jdbc.update("INSERT INTO product_variants(product_id,sku,label,active) VALUES (?,?,?,true)", id, it, it) }
    }

    private fun countOffers() = jdbc.queryForObject("SELECT count(*) FROM offers", Int::class.java)

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic @BeforeAll fun start() {
            postgres.start()
            Flyway.configure().dataSource(postgres.jdbcUrl, postgres.username, postgres.password).locations("classpath:db/migration").load().migrate()
        }

        @JvmStatic @AfterAll fun stop() = postgres.stop()
    }
}
