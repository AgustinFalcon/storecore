package com.storecore.commerce

import com.storecore.commerce.infrastructure.InboxApplicationWorker
import com.storecore.commerce.infrastructure.JdbcInventoryService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.client.TestRestTemplate
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.PostgreSQLContainer
import java.net.URI
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
class CommerceHttpIntegrationTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val passwords: com.storecore.identity.infrastructure.security.Argon2PasswordHasher,
    @Autowired private val inventory: JdbcInventoryService,
    @Autowired private val inboxWorker: InboxApplicationWorker,
    @LocalServerPort private val port: Int,
) {
    private lateinit var admin: Session
    private lateinit var customer: Session

    @BeforeEach
    fun seed() {
        admin = provisionAdmin("admin-${UUID.randomUUID()}@example.com")
        customer = registerCustomer("shopper-${UUID.randomUUID()}@example.com")
        listOf("STOREFRONT", "CATALOG", "PAYMENTS_MP", "MANUAL_FULFILLMENT", "MANUAL_PROMOTIONS", "MARKETPLACE_ML", "PROFILE_CONTENT").forEach { activate(it) }
    }

    @Test
    fun `catalog search and admin home draft`() {
        val sku = "SKU-HOME-${UUID.randomUUID()}"
        putProduct(sku, "Home Drill")
        val search = exchange("/api/v1/catalog?query=Home", HttpMethod.GET, null)
        assertEquals(200, search.statusCode.value())
        assertTrue(search.body!!.contains(sku))
        val saved = exchange("/api/v1/user/content/home", HttpMethod.PUT, """{"title":"Vitrina","body":"Hero body"}""", admin.cookie, admin.csrf)
        assertEquals(200, saved.statusCode.value())
        admin = admin.copy(csrf = saved.headers.getFirst("X-CSRF-Token")!!)
        val draft = exchange("/api/v1/user/content/home", HttpMethod.GET, null, admin.cookie)
        assertEquals(200, draft.statusCode.value())
        assertTrue(draft.body!!.contains("\"title\":\"Vitrina\""))
        assertTrue(draft.body!!.contains("\"body\":\"Hero body\""))
        val catalog = exchange("/api/v1/user/catalog", HttpMethod.GET, null, admin.cookie)
        assertEquals(200, catalog.statusCode.value())
        assertTrue(catalog.body!!.contains(sku))
    }

    @Test
    fun `cart snapshots prices and checkout replays the same claim`() {
        val sku = "SKU-CART-${UUID.randomUUID()}"
        putProduct(sku, "Cart Item", available = 8, safety = 1)
        customer = addAddress(customer)
        val added = exchange("/api/v1/customer/cart/items", HttpMethod.PUT, """{"sku":"$sku","quantity":2}""", customer.cookie, customer.csrf)
        assertEquals(200, added.statusCode.value())
        assertTrue(added.body!!.contains("originalUnitPrice"))
        assertTrue(added.body!!.contains("effectiveUnitPrice"))
        customer = customer.copy(csrf = added.headers.getFirst("X-CSRF-Token")!!)
        val cart = exchange("/api/v1/customer/cart", HttpMethod.GET, null, customer.cookie)
        assertTrue(cart.body!!.contains(sku) && cart.body!!.contains("ARS"))
        val key = UUID.randomUUID()
        val body = """{"idempotencyKey":"$key","addressId":"${customer.addressId}","currency":"ARS"}"""
        val first = exchange("/api/v1/customer/checkout", HttpMethod.POST, body, customer.cookie, customer.csrf)
        assertEquals(200, first.statusCode.value(), first.body)
        val orderId = Regex(""""orderId"\s*:\s*"(\d+)"""").find(first.body!!)!!.groupValues[1]
        customer = customer.copy(csrf = first.headers.getFirst("X-CSRF-Token")!!)
        val replay = exchange("/api/v1/customer/checkout", HttpMethod.POST, body, customer.cookie, customer.csrf)
        assertEquals(200, replay.statusCode.value())
        assertTrue(replay.body!!.contains("\"orderId\":\"$orderId\""))
        customer = customer.copy(csrf = replay.headers.getFirst("X-CSRF-Token")!!)
        val conflict = exchange("/api/v1/customer/checkout", HttpMethod.POST, """{"idempotencyKey":"$key","addressId":"${customer.addressId}","currency":"USD"}""", customer.cookie, customer.csrf)
        assertTrue(conflict.statusCode.value() == 400 || conflict.statusCode.value() == 409, conflict.body)
        assertTrue(conflict.body!!.contains("CHECKOUT_IDEMPOTENCY_CONFLICT") || conflict.body!!.contains("UNSUPPORTED_CURRENCY"))
        customer = customer.copy(csrf = conflict.headers.getFirst("X-CSRF-Token") ?: customer.csrf)
        customer = addAddress(customer)
        val changedAddress = exchange("/api/v1/customer/checkout", HttpMethod.POST, """{"idempotencyKey":"$key","addressId":"${customer.addressId}","currency":"ARS"}""", customer.cookie, customer.csrf)
        assertEquals(409, changedAddress.statusCode.value())
        assertTrue(changedAddress.body!!.contains("CHECKOUT_IDEMPOTENCY_CONFLICT"))
        val addedAgain = exchange("/api/v1/customer/cart/items", HttpMethod.PUT, """{"sku":"$sku","quantity":1}""", customer.cookie, customer.csrf)
        customer = customer.copy(csrf = addedAgain.headers.getFirst("X-CSRF-Token")!!)
        val hashConflict = exchange("/api/v1/customer/checkout", HttpMethod.POST, """{"idempotencyKey":"$key","addressId":"${customer.addressId}","currency":"ARS"}""", customer.cookie, customer.csrf)
        assertEquals(409, hashConflict.statusCode.value())
        assertTrue(hashConflict.body!!.contains("CHECKOUT_IDEMPOTENCY_CONFLICT"))
        val reservations = jdbc.queryForList("SELECT reservation_saga_key,reservation_line_key FROM inventory_reservations WHERE variant_id=(SELECT id FROM product_variants WHERE sku=?)", sku)
        assertEquals(1, reservations.size)
        val saga = reservations[0]["reservation_saga_key"].toString()
        val line = reservations[0]["reservation_line_key"].toString()
        val events = jdbc.queryForList("SELECT event_idempotency_key,event_type FROM inventory_ledger WHERE reservation_id=(SELECT id FROM inventory_reservations WHERE reservation_line_key=?::uuid)", line)
        val keys = events.map { it["event_idempotency_key"].toString() } + listOf(saga, line)
        assertEquals(keys.size, keys.toSet().size)
        assertTrue(events.any { it["event_type"] == "RESERVATION" })
        jdbc.update("UPDATE inventory_reservations SET created_at=now()-interval '2 minutes', expires_at=now()-interval '1 minute' WHERE reservation_line_key=?::uuid", line)
        inventory.expireOverdue()
        assertEquals("EXPIRED", jdbc.queryForObject("SELECT status FROM inventory_reservations WHERE reservation_line_key=?::uuid", String::class.java, line))
        val after = jdbc.queryForList("SELECT event_idempotency_key,event_type FROM inventory_ledger WHERE reservation_id=(SELECT id FROM inventory_reservations WHERE reservation_line_key=?::uuid)", line)
        assertTrue(after.any { it["event_type"] == "RELEASE" })
        assertEquals(after.map { it["event_idempotency_key"].toString() }.size, after.map { it["event_idempotency_key"].toString() }.toSet().size)
        val stranger = registerCustomer("stranger-${UUID.randomUUID()}@example.com")
        val foreign = exchange("/api/v1/customer/orders/$orderId", HttpMethod.GET, null, stranger.cookie)
        assertEquals(404, foreign.statusCode.value())
        assertTrue(foreign.body!!.contains("RESOURCE_NOT_FOUND"))
    }

    @Test
    fun `legacy payment webhook is retired without inbox`() {
        val first = exchange("/api/v1/payments/mercadopago/notifications?topic=payment&id=mp-88", HttpMethod.POST, """{"type":"payment","data":{"id":"mp-88"}}""")
        assertEquals(410, first.statusCode.value())
        assertTrue(first.body!!.contains("LEGACY_MP_NOTIFICATION_RETIRED"))
        val replay = exchange("/api/v1/payments/mercadopago/notifications", HttpMethod.POST, """{"action":"payment.updated","data":{"id":"mp-88"}}""")
        assertEquals(410, replay.statusCode.value())
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM payment_event_inbox WHERE provider_event_id='mp-88'", Int::class.java))
        assertEquals(0, inboxWorker.processPayments())
    }

    @Test
    fun `admin order reads require fulfillment capability`() {
        val allowed = exchange("/api/v1/user/orders", HttpMethod.GET, null, admin.cookie)
        assertEquals(200, allowed.statusCode.value(), allowed.body)
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code=?", Int::class.java, "MANUAL_FULFILLMENT")
        val actorId = adminUserId()
        jdbc.query("SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)", { _, _ -> }, actorId, adminSessionId(actorId), "MANUAL_FULFILLMENT", version, "PAUSED", "{}", UUID.randomUUID(), "test")
        val denied = exchange("/api/v1/user/orders", HttpMethod.GET, null, admin.cookie)
        assertEquals(409, denied.statusCode.value(), denied.body)
        assertTrue(denied.body!!.contains("CAPABILITY_PAUSED"))
    }

    @Test
    fun `promo overlap conflicts and fulfillment rma stays ordered`() {
        val sku = "SKU-PROMO-${UUID.randomUUID()}"
        putProduct(sku, "Promo Item", available = 5, safety = 0)
        val from = Instant.now().plusSeconds(60).truncatedTo(ChronoUnit.SECONDS)
        val to = from.plus(2, ChronoUnit.DAYS)
        val promo = """{"listingSku":"$sku","currency":"ARS","validFrom":"$from","validTo":"$to","priority":10,"margin":15,"approvedBy":"${adminUserId()}","approvedAt":"${Instant.now()}","writer":"MANUAL"}"""
        val created = exchange("/api/v1/user/promos", HttpMethod.POST, promo, admin.cookie, admin.csrf)
        assertEquals(200, created.statusCode.value())
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM offers WHERE name=?", Int::class.java, "manual-$sku"))
        admin = admin.copy(csrf = created.headers.getFirst("X-CSRF-Token")!!)
        val overlap = exchange("/api/v1/user/promos", HttpMethod.POST, promo, admin.cookie, admin.csrf)
        assertEquals(409, overlap.statusCode.value())
        assertTrue(overlap.body!!.contains("PROMO_WINDOW_OVERLAP"))
        admin = admin.copy(csrf = overlap.headers.getFirst("X-CSRF-Token") ?: admin.csrf)
        customer = addAddress(customer)
        val added = exchange("/api/v1/customer/cart/items", HttpMethod.PUT, """{"sku":"$sku","quantity":1}""", customer.cookie, customer.csrf)
        customer = customer.copy(csrf = added.headers.getFirst("X-CSRF-Token")!!)
        val checkout = exchange("/api/v1/customer/checkout", HttpMethod.POST, """{"idempotencyKey":"${UUID.randomUUID()}","addressId":"${customer.addressId}","currency":"ARS"}""", customer.cookie, customer.csrf)
        val orderId = Regex(""""orderId"\s*:\s*"(\d+)"""").find(checkout.body!!)!!.groupValues[1]
        val skipped = exchange("/api/v1/user/orders/$orderId/shipments", HttpMethod.POST, """{"status":"DELIVERED","tracking":null}""", admin.cookie, admin.csrf)
        assertEquals(400, skipped.statusCode.value())
        val packed = exchange("/api/v1/user/orders/$orderId/shipments", HttpMethod.POST, """{"status":"PACKED","tracking":null}""", admin.cookie, admin.csrf)
        assertEquals(200, packed.statusCode.value())
        assertTrue(packed.body!!.contains("PREPARING"))
        admin = admin.copy(csrf = packed.headers.getFirst("X-CSRF-Token")!!)
        val shipped = exchange("/api/v1/user/orders/$orderId/shipments", HttpMethod.POST, """{"status":"SHIPPED","tracking":"TRK-1"}""", admin.cookie, admin.csrf)
        assertTrue(shipped.body!!.contains("SHIPPED"))
        admin = admin.copy(csrf = shipped.headers.getFirst("X-CSRF-Token")!!)
        val delivered = exchange("/api/v1/user/orders/$orderId/shipments", HttpMethod.POST, """{"status":"DELIVERED","tracking":"TRK-1"}""", admin.cookie, admin.csrf)
        assertTrue(delivered.body!!.contains("DELIVERED"))
        admin = admin.copy(csrf = delivered.headers.getFirst("X-CSRF-Token")!!)
        val regressed = exchange("/api/v1/user/orders/$orderId/shipments", HttpMethod.POST, """{"status":"PACKED","tracking":null}""", admin.cookie, admin.csrf)
        assertEquals(400, regressed.statusCode.value())
        val early = exchange("/api/v1/user/orders/$orderId/rma", HttpMethod.POST, """{"status":"ADJUSTED"}""", admin.cookie, admin.csrf)
        assertEquals(400, early.statusCode.value())
        admin = admin.copy(csrf = early.headers.getFirst("X-CSRF-Token") ?: admin.csrf)
        val received = exchange("/api/v1/user/orders/$orderId/rma", HttpMethod.POST, """{"status":"RECEIVED"}""", admin.cookie, admin.csrf)
        assertEquals(200, received.statusCode.value())
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE event_type='ADJUSTMENT' AND variant_id=(SELECT id FROM product_variants WHERE sku=?)", Int::class.java, sku))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE r.order_id=? AND ri.adjustment_ledger_id IS NOT NULL", Int::class.java, orderId.toLong()))
        admin = admin.copy(csrf = received.headers.getFirst("X-CSRF-Token")!!)
        val inspected = exchange("/api/v1/user/orders/$orderId/rma", HttpMethod.POST, """{"status":"INSPECTED"}""", admin.cookie, admin.csrf)
        admin = admin.copy(csrf = inspected.headers.getFirst("X-CSRF-Token")!!)
        val adjusted = exchange("/api/v1/user/orders/$orderId/rma", HttpMethod.POST, """{"status":"ADJUSTED"}""", admin.cookie, admin.csrf)
        assertEquals(200, adjusted.statusCode.value())
        assertTrue(adjusted.body!!.contains("CLOSED") || jdbc.queryForObject("SELECT status FROM returns WHERE order_id=?", String::class.java, orderId.toLong()) == "CLOSED")
        assertEquals(2, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE event_type='ADJUSTMENT' AND variant_id=(SELECT id FROM product_variants WHERE sku=?)", Int::class.java, sku))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE r.order_id=? AND ri.adjustment_ledger_id IS NOT NULL", Int::class.java, orderId.toLong()))
    }

    @Test
    fun `ml inbox persists before ack and profiles reject secrets`() {
        val missing = exchange("/api/v1/integrations/mercadolibre/notifications?topic=orders_v2&resource=/orders/555", HttpMethod.POST, """{"topic":"orders_v2","resource":"/orders/555"}""")
        assertEquals(409, missing.statusCode.value())
        assertTrue(missing.body!!.contains("ML_ACCOUNT_NOT_AUTHORIZED"))
        assertTrue(missing.body!!.contains("\"retryable\":true"))
        jdbc.update("INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state) VALUES ('ml-auth','MERCADO_LIBRE','ref:ml-auth','ACTIVE')")
        val first = exchange("/api/v1/integrations/mercadolibre/notifications?topic=orders_v2&resource=/orders/555", HttpMethod.POST, """{"topic":"orders_v2","resource":"/orders/555"}""")
        assertEquals(200, first.statusCode.value())
        val replay = exchange("/api/v1/integrations/mercadolibre/notifications", HttpMethod.POST, """{"topic":"orders_v2","resource":"/orders/555"}""")
        assertEquals(200, replay.statusCode.value())
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM ml_notification_inbox WHERE notification_id='orders_v2:/orders/555' OR resource='/orders/555'", Int::class.java))
        val secret = exchange("/api/v1/user/profiles/preview", HttpMethod.POST, """{"manifest":"{\"profile_name\":\"universal-tools-profile\",\"coreCompatibility\":\"1.x\",\"oauth_token\":\"nope\"}"}""", admin.cookie, admin.csrf)
        assertEquals(400, secret.statusCode.value())
        assertTrue(secret.body!!.contains("PROFILE_SECRET_REJECTED"))
        val preview = exchange("/api/v1/user/profiles/preview", HttpMethod.POST, """{"manifest":"{\"profile_name\":\"universal-tools-profile\",\"profile_version\":\"1.0.0\",\"coreCompatibility\":\"1.x\",\"fixtures\":true}"}""", admin.cookie, admin.csrf)
        assertEquals(200, preview.statusCode.value())
        assertTrue(preview.body!!.contains("\"compatible\":true"))
    }

    private fun putProduct(sku: String, name: String, available: Int = 10, safety: Int = 0) {
        val body = """{"sku":"$sku","name":"$name","description":"$name","brand":"Tools","category":"Hand","images":[],"variants":[{"sku":"$sku","name":"$name","availableQuantity":$available}],"price":{"base":100,"effective":100,"priceVersion":"v1"},"active":true}"""
        val saved = exchange("/api/v1/user/catalog/products/$sku", HttpMethod.PUT, body, admin.cookie, admin.csrf)
        assertEquals(200, saved.statusCode.value())
        admin = admin.copy(csrf = saved.headers.getFirst("X-CSRF-Token")!!)
        jdbc.update("INSERT INTO inventory_balances(variant_id,available_quantity,safety_stock) SELECT id,?,? FROM product_variants WHERE sku=? ON CONFLICT (variant_id) DO UPDATE SET available_quantity=excluded.available_quantity,safety_stock=excluded.safety_stock,updated_at=now()", available, safety, sku)
    }

    private fun activate(module: String) {
        val state = jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code=?", String::class.java, module)
        if (state == "ACTIVE") return
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code=?", Int::class.java, module)
        val actorId = adminUserId()
        jdbc.query("SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)", { _, _ -> }, actorId, adminSessionId(actorId), module, version, "ACTIVE", "{}", UUID.randomUUID(), "test")
    }

    private fun adminSessionId(actorId: Long): UUID = jdbc.queryForObject(
        "SELECT id FROM identity_sessions WHERE subject_kind='USER' AND user_id=? AND revoked_at IS NULL ORDER BY issued_at DESC LIMIT 1",
        UUID::class.java,
        actorId,
    )!!

    private fun provisionAdmin(email: String): Session {
        val hash = passwords.hash("a-very-long-password".toCharArray())
        val userId = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id", Long::class.java, email, hash)
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", userId)
        val login = exchange("/api/v1/internal/auth/login", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password"}""")
        val cookie = login.headers.getFirst(HttpHeaders.SET_COOKIE) ?: error("admin login ${login.statusCode} ${login.body}")
        val csrf = login.headers.getFirst("X-CSRF-Token") ?: error("admin login missing csrf ${login.statusCode} ${login.body}")
        return Session(cookie.substringBefore(';'), csrf)
    }

    private fun registerCustomer(email: String): Session {
        val registered = exchange("/api/v1/customer/auth/register", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password","firstName":"Person","lastName":"One"}""")
        return Session(registered.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'), registered.headers.getFirst("X-CSRF-Token")!!)
    }

    private fun addAddress(session: Session): Session {
        val created = exchange("/api/v1/customer/me/addresses", HttpMethod.POST, """{"street":"Main","number":"1","city":"City","province":"Province","postalCode":"1000","isDefault":true}""", session.cookie, session.csrf)
        return session.copy(csrf = created.headers.getFirst("X-CSRF-Token")!!, addressId = Regex(""""id"\s*:\s*(\d+)""").find(created.body!!)!!.groupValues[1])
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
