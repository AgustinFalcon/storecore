package com.storecore.commerce

import com.storecore.commerce.application.port.output.OfficialResourceQueryPort
import com.storecore.commerce.domain.OfficialMlItem
import com.storecore.commerce.domain.OfficialMlResource
import com.storecore.commerce.domain.OfficialPaymentResource
import com.storecore.commerce.infrastructure.InboxApplicationWorker
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import java.net.URI
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["storecore.installation-guard.enabled=false", "storecore.integrations.refetch-delay-ms=3600000", "storecore.integrations.official-resource-adapter=fake"],
)
@Import(InboxApplicationWorkerTest.FakeOfficialResources::class)
class InboxApplicationWorkerTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val passwords: com.storecore.identity.infrastructure.security.Argon2PasswordHasher,
    @Autowired private val worker: InboxApplicationWorker,
    @LocalServerPort private val port: Int,
) {
    private lateinit var admin: Session
    private lateinit var customer: Session

    @BeforeEach
    fun seed() {
        FakeOfficialResources.payments.clear()
        FakeOfficialResources.ml.clear()
        admin = provisionAdmin("admin-${UUID.randomUUID()}@example.com")
        customer = registerCustomer("shopper-${UUID.randomUUID()}@example.com")
        listOf("STOREFRONT", "CATALOG", "PAYMENTS_MP", "MARKETPLACE_ML", "PROFILE_CONTENT").forEach { activate(it) }
    }

    @Test
    fun `legacy unsigned payment notify is retired and v1 worker does not apply`() {
        val retired = exchange("/api/v1/payments/mercadopago/notifications?topic=payment&id=mp-apply", HttpMethod.POST, """{"type":"payment","data":{"id":"mp-apply"}}""")
        assertEquals(410, retired.statusCode.value())
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM payment_event_inbox WHERE provider_event_id='mp-apply'", Int::class.java))
        assertEquals(0, worker.processPayments())
    }

    @Test
    fun `official ml refetch records one channel sale and does not double apply`() {
        val sku = "SKU-ML-${UUID.randomUUID()}"
        putProduct(sku, "ML Item", available = 4)
        jdbc.update("INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state) VALUES ('ml-apply','MERCADO_LIBRE','ref:ml-apply','ACTIVE')")
        jdbc.update(
            """INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state)
               SELECT a.id,'MLA-1','VAR-1',v.id,'ACTIVE' FROM channel_accounts a, product_variants v
               WHERE a.account_key='ml-apply' AND v.sku=?""",
            sku,
        )
        FakeOfficialResources.ml["orders_v2:/orders/900"] = OfficialMlResource(
            "900",
            listOf(OfficialMlItem("MLA-1", "VAR-1", "900-1", 1, 3)),
        )
        val notify = exchange("/api/v1/integrations/mercadolibre/notifications?topic=orders_v2&resource=/orders/900", HttpMethod.POST, """{"id":"ml-900","topic":"orders_v2","resource":"/orders/900"}""")
        assertEquals(200, notify.statusCode.value(), notify.body)
        assertEquals(1, worker.processMercadoLibre())
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM channel_sales WHERE external_order_id='900'", Int::class.java))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE event_type='SALE' AND channel='MERCADO_LIBRE' AND external_order_id='900'", Int::class.java))
        assertEquals(3, jdbc.queryForObject("SELECT observed_quantity FROM channel_listings WHERE external_listing_id='MLA-1'", Int::class.java))
        jdbc.update("UPDATE ml_notification_processing SET status='RECEIVED' WHERE inbox_id=(SELECT id FROM ml_notification_inbox WHERE resource='/orders/900')")
        assertEquals(1, worker.processMercadoLibre())
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM channel_sales WHERE external_order_id='900'", Int::class.java))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE event_type='SALE' AND channel='MERCADO_LIBRE' AND external_order_id='900'", Int::class.java))
    }

    @Test
    fun `legacy payment inbox rows are never applied by the v1 worker`() {
        jdbc.update(
            "INSERT INTO payment_event_inbox(provider_event_id,resource_reference,envelope_redacted) VALUES ('mp-legacy','payment','{}')",
        )
        jdbc.update(
            "INSERT INTO payment_event_processing(inbox_id,status) SELECT id,'RECEIVED' FROM payment_event_inbox WHERE provider_event_id='mp-legacy'",
        )
        FakeOfficialResources.payments["mp-legacy"] = OfficialPaymentResource("mp-legacy", "SC-legacy", "approved")
        assertEquals(0, worker.processPayments())
        assertEquals("RECEIVED", jdbc.queryForObject("SELECT status FROM payment_event_processing WHERE inbox_id=(SELECT id FROM payment_event_inbox WHERE provider_event_id='mp-legacy')", String::class.java))
    }

    @Test
    fun `ml inventory failure isolates the other inbox row`() {
        val tight = "SKU-ML-TIGHT-${UUID.randomUUID()}"
        val ok = "SKU-ML-OK-${UUID.randomUUID()}"
        putProduct(tight, "Tight Item", available = 1)
        putProduct(ok, "Ok Item", available = 4)
        jdbc.update("INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state) VALUES ('ml-iso','MERCADO_LIBRE','ref:ml-iso','ACTIVE') ON CONFLICT (account_key) DO NOTHING")
        val accountId = jdbc.queryForObject(
            "SELECT id FROM channel_accounts WHERE channel='MERCADO_LIBRE' AND state='ACTIVE' AND account_key<>'manual-price-writer' ORDER BY id LIMIT 1",
            Long::class.java,
        )!!
        jdbc.update(
            """INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state)
               SELECT ?, 'MLA-TIGHT','VAR-T',v.id,'ACTIVE' FROM product_variants v WHERE v.sku=?""",
            accountId, tight,
        )
        jdbc.update(
            """INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state)
               SELECT ?, 'MLA-OK','VAR-O',v.id,'ACTIVE' FROM product_variants v WHERE v.sku=?""",
            accountId, ok,
        )
        FakeOfficialResources.ml["orders_v2:/orders/901"] = OfficialMlResource("901", listOf(OfficialMlItem("MLA-TIGHT", "VAR-T", "901-1", 5, 0)))
        FakeOfficialResources.ml["orders_v2:/orders/902"] = OfficialMlResource("902", listOf(OfficialMlItem("MLA-OK", "VAR-O", "902-1", 1, 2)))
        exchange("/api/v1/integrations/mercadolibre/notifications?topic=orders_v2&resource=/orders/901", HttpMethod.POST, """{"id":"ml-901","topic":"orders_v2","resource":"/orders/901"}""")
        exchange("/api/v1/integrations/mercadolibre/notifications?topic=orders_v2&resource=/orders/902", HttpMethod.POST, """{"id":"ml-902","topic":"orders_v2","resource":"/orders/902"}""")
        assertEquals(1, worker.processMercadoLibre())
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM channel_sales WHERE external_order_id='901'", Int::class.java))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM channel_sales WHERE external_order_id='902'", Int::class.java))
        assertEquals("RECEIVED", jdbc.queryForObject("SELECT status FROM ml_notification_processing WHERE inbox_id=(SELECT id FROM ml_notification_inbox WHERE resource='/orders/901')", String::class.java))
        assertEquals("PROCESSED", jdbc.queryForObject("SELECT status FROM ml_notification_processing WHERE inbox_id=(SELECT id FROM ml_notification_inbox WHERE resource='/orders/902')", String::class.java))
    }

    private fun putProduct(sku: String, name: String, available: Int) {
        val body = """{"sku":"$sku","name":"$name","description":"$name","brand":"Casa","category":"Luz","images":[],"variants":[{"sku":"$sku","name":"$name","availableQuantity":$available}],"price":{"base":100,"effective":100,"priceVersion":"v1"},"active":true}"""
        val saved = exchange("/api/v1/user/catalog/products/$sku", HttpMethod.PUT, body, admin.cookie, admin.csrf)
        assertEquals(200, saved.statusCode.value(), saved.body)
        admin = admin.copy(csrf = saved.headers.getFirst("X-CSRF-Token")!!)
        jdbc.update("INSERT INTO inventory_balances(variant_id,available_quantity,safety_stock) SELECT id,?,0 FROM product_variants WHERE sku=? ON CONFLICT (variant_id) DO UPDATE SET available_quantity=excluded.available_quantity,updated_at=now()", available, sku)
    }

    private fun activate(module: String) {
        val state = jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code=?", String::class.java, module)
        if (state == "ACTIVE") return
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code=?", Int::class.java, module)
        jdbc.query("SELECT capability_admin_change_configuration(?,?,?,?,?::jsonb,?,?)", { _, _ -> }, adminUserId(), module, version, "ACTIVE", "{}", UUID.randomUUID(), "test")
    }

    private fun provisionAdmin(email: String): Session {
        val hash = passwords.hash("a-very-long-password".toCharArray())
        val userId = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id", Long::class.java, email, hash)
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", userId)
        val login = exchange("/api/v1/internal/auth/login", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password"}""")
        return Session(login.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'), login.headers.getFirst("X-CSRF-Token")!!)
    }

    private fun registerCustomer(email: String): Session {
        val registered = exchange("/api/v1/customer/auth/register", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password","firstName":"Person","lastName":"One"}""")
        return Session(registered.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'), registered.headers.getFirst("X-CSRF-Token")!!)
    }

    private fun addAddress(session: Session): Session {
        val customerId = jdbc.queryForObject("SELECT id FROM customers ORDER BY id DESC LIMIT 1", Long::class.java)!!
        val addressId = jdbc.queryForObject(
            "INSERT INTO customer_addresses(customer_id,street,number,city,province,postal_code,is_default) VALUES (?,'Main','1','City','Province','1000',TRUE) RETURNING id",
            Long::class.java,
            customerId,
        )!!
        return session.copy(addressId = addressId.toString())
    }

    private fun adminUserId() = jdbc.queryForObject("SELECT id FROM users WHERE email LIKE 'admin-%' ORDER BY id DESC LIMIT 1", Long::class.java)!!

    private fun exchange(path: String, method: HttpMethod, body: String?, cookie: String? = null, csrf: String? = null) = http.exchange(
        URI("http://localhost:$port$path"), method,
        HttpEntity(body, HttpHeaders().apply {
            contentType = MediaType.APPLICATION_JSON
            set(HttpHeaders.ORIGIN, "http://localhost:4200")
            cookie?.let { set(HttpHeaders.COOKIE, it) }
            csrf?.let { set("X-CSRF-Token", it) }
        }), String::class.java,
    )

    private data class Session(val cookie: String, val csrf: String, val addressId: String = "")

    @TestConfiguration
    open class FakeOfficialResources {
        @Bean
        @Primary
        open fun officialResourceQueryPort(): OfficialResourceQueryPort = object : OfficialResourceQueryPort {
            override fun configured() = true
            override fun payment(providerEventId: String) = payments[providerEventId]
            override fun mercadoLibre(topic: String, resource: String) = ml["$topic:$resource"]
        }

        companion object {
            val payments = ConcurrentHashMap<String, OfficialPaymentResource>()
            val ml = ConcurrentHashMap<String, OfficialMlResource>()
        }
    }

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
