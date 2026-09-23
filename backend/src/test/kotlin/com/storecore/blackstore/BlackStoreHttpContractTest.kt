package com.storecore.blackstore

import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import java.util.UUID

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
class BlackStoreHttpContractTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val capabilities: JdbcCapabilityService,
) {
    private val client = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")

    @Test
    fun `cas temporary active proves catalog 200 then disabled returns 403`() {
        assertEquals(403, catalog().statusCode.value())
        seedCatalog()
        activate(CapabilityState.ACTIVE, "testcontainers temporary active")
        val enabled = catalog()
        assertEquals(200, enabled.statusCode.value(), enabled.body)
        assertTrue(enabled.body!!.contains("SKU-HTTP-1"), enabled.body)
        assertTrue(enabled.headers.eTag != null || enabled.body!!.contains("catalogVersion"), enabled.body)
        val stock = http.exchange(
            "/blackstore-integration/v1/stock/variants/${variantId()}",
            HttpMethod.GET,
            HttpEntity<Void>(clientHeaders()),
            String::class.java,
        )
        assertEquals(200, stock.statusCode.value(), stock.body)
        activate(CapabilityState.DISABLED, "restore disabled baseline")
        assertEquals(403, catalog().statusCode.value())
        assertEquals("DISABLED", jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", String::class.java))
    }

    private fun catalog() = http.exchange(
        "/blackstore-integration/v1/catalog",
        HttpMethod.GET,
        HttpEntity<Void>(clientHeaders()),
        String::class.java,
    )

    private fun clientHeaders() = HttpHeaders().apply {
        contentType = MediaType.APPLICATION_JSON
        set("X-Client-Instance-Id", client.toString())
    }

    private fun activate(state: CapabilityState, reason: String) {
        val adminId = jdbc.queryForObject(
            "INSERT INTO users(email, password_hash, first_name, last_name) VALUES ('bs-http@example.com', '\$argon2id\$fixture', 'Bs', 'Http') ON CONFLICT (email) DO UPDATE SET email=EXCLUDED.email RETURNING id",
            Long::class.java,
        )!!
        jdbc.update("INSERT INTO user_roles(user_id, role_id) SELECT ?, id FROM roles WHERE code='ADMIN' ON CONFLICT DO NOTHING", adminId)
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='BLACKSTORE_INTEGRATION'", Int::class.java)!!
        capabilities.changeState(
            InternalUserPrincipal(UUID.randomUUID(), adminId, setOf(InternalRole.ADMIN)),
            "BLACKSTORE_INTEGRATION",
            state,
            version,
            reason,
            UUID.randomUUID(),
        )
    }

    private fun seedCatalog() {
        jdbc.update("INSERT INTO installation_settings(installation_id, business_name, allowed_host, currency) VALUES (1, 'Test', 'localhost', 'ARS') ON CONFLICT DO NOTHING")
        jdbc.update("INSERT INTO blackstore_companions(client_instance_id, status) VALUES (?, 'DISABLED') ON CONFLICT (client_instance_id) DO NOTHING", client)
        if (jdbc.queryForObject("SELECT COUNT(*) FROM brands WHERE slug='http-brand'", Int::class.java) == 0) {
            jdbc.update("INSERT INTO brands(name, slug) VALUES ('Http', 'http-brand')")
            jdbc.update("INSERT INTO categories(name, slug) VALUES ('HttpCat', 'http-cat')")
        }
        if (jdbc.queryForObject("SELECT COUNT(*) FROM product_variants WHERE sku='SKU-HTTP-1'", Int::class.java) == 0) {
            val productId = jdbc.queryForObject(
                "INSERT INTO products(brand_id, category_id, name, slug, base_price, status) VALUES (1, 1, 'Http', 'http-sku', 10, 'ACTIVE') RETURNING id",
                Long::class.java,
            )!!
            val variant = jdbc.queryForObject(
                "INSERT INTO product_variants(product_id, sku, label) VALUES (?, 'SKU-HTTP-1', 'Default') RETURNING id",
                Long::class.java,
                productId,
            )!!
            jdbc.update("INSERT INTO inventory_balances(variant_id, available_quantity, safety_stock) VALUES (?, 8, 2)", variant)
        }
    }

    private fun variantId() =
        jdbc.queryForObject("SELECT id FROM product_variants WHERE sku='SKU-HTTP-1'", Long::class.java)!!

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @DynamicPropertySource
        fun database(registry: DynamicPropertyRegistry) {
            postgres.start()
            registry.add("spring.datasource.url") { postgres.jdbcUrl }
            registry.add("spring.datasource.username") { postgres.username }
            registry.add("spring.datasource.password") { postgres.password }
        }
    }
}
