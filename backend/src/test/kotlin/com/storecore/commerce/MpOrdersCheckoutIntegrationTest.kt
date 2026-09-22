package com.storecore.commerce

import com.storecore.commerce.application.port.output.OfficialOrderCommandPort
import com.storecore.commerce.application.port.output.OfficialOrderCreateRequest
import com.storecore.commerce.application.port.output.OfficialOrderQueryPort
import com.storecore.commerce.application.port.output.OfficialOrderSearchQuery
import com.storecore.commerce.application.port.output.OfficialOrderSearchResult
import com.storecore.commerce.application.port.output.OfficialWebhookSignaturePort
import com.storecore.commerce.application.port.output.WebhookSignatureDecision
import com.storecore.commerce.domain.CreationObservation
import com.storecore.commerce.domain.OfficialOrderResource
import com.storecore.commerce.domain.OfficialOrderTransaction
import com.storecore.commerce.domain.RemoteOrderCandidate
import com.storecore.commerce.infrastructure.mporders.MpCheckoutAttemptService
import com.storecore.commerce.infrastructure.mporders.MpOrderApplicationWorker
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
import java.math.BigDecimal
import java.net.URI
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = [
        "storecore.installation-guard.enabled=false",
        "storecore.integrations.refetch-delay-ms=3600000",
        "storecore.integrations.mp-orders.adapter=fake",
        "storecore.integrations.mp-orders.accepted-topic=order",
        "storecore.integrations.mp-orders.expected-user-id=user-1",
        "storecore.integrations.mp-orders.expected-application-id=app-1",
        "storecore.integrations.mp-orders.checkout-url-hosts[0]=www.mercadopago.com.ar",
    ],
)
@Import(MpOrdersCheckoutIntegrationTest.Fakes::class)
class MpOrdersCheckoutIntegrationTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val passwords: com.storecore.identity.infrastructure.security.Argon2PasswordHasher,
    @Autowired private val attempts: MpCheckoutAttemptService,
    @Autowired private val worker: MpOrderApplicationWorker,
    @LocalServerPort private val port: Int,
) {
    private lateinit var admin: Session
    private lateinit var customer: Session

    @BeforeEach
    fun seed() {
        Fakes.orders.clear()
        Fakes.createResult.set(null)
        Fakes.searchResult.set(OfficialOrderSearchResult(emptyList(), 1, true))
        admin = provisionAdmin("admin-${UUID.randomUUID()}@example.com")
        customer = registerCustomer("shopper-${UUID.randomUUID()}@example.com")
        listOf("STOREFRONT", "CATALOG", "PAYMENTS_MP", "MANUAL_FULFILLMENT", "PROFILE_CONTENT").forEach { activate(it) }
    }

    @Test
    fun `signed order notification persists before ack and accredits once`() {
        val orderId = checkout("SKU-MP-${UUID.randomUUID()}")
        val providerOrderId = "ORD-HAPPY-${UUID.randomUUID()}"
        bindRemote(orderId, providerOrderId)
        val first = notify(providerOrderId, "evt-1", "req-1")
        assertEquals(200, first.statusCode.value(), first.body)
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mp_order_notification_inbox WHERE query_data_id=?", Int::class.java, providerOrderId))
        val replay = notify(providerOrderId, "evt-1", "req-1")
        assertEquals(200, replay.statusCode.value())
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mp_order_notification_inbox WHERE query_data_id=?", Int::class.java, providerOrderId))
        assertEquals(1, worker.process())
        assertEquals("APPROVED", jdbc.queryForObject("SELECT status FROM payments WHERE order_id=?", String::class.java, orderId))
        assertEquals("PAID", jdbc.queryForObject("SELECT status FROM orders WHERE id=?", String::class.java, orderId))
        assertEquals("CONSUMED", jdbc.queryForObject("SELECT status FROM inventory_reservations WHERE reservation_saga_key=(SELECT (checkout_snapshot->>'reservationSagaKey')::uuid FROM orders WHERE id=?)", String::class.java, orderId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mp_order_commercial_applications WHERE order_id=? AND transition='PAYMENT_ACCREDITED'", Int::class.java, orderId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mp_verified_business_events e JOIN mp_order_commercial_applications a ON a.id=e.application_id WHERE a.order_id=?", Int::class.java, orderId))
        assertEquals(0, worker.process())
        notify(providerOrderId, "evt-2", "req-2")
        assertEquals(1, worker.process())
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mp_order_commercial_applications WHERE order_id=? AND transition='PAYMENT_ACCREDITED'", Int::class.java, orderId))
    }

    @Test
    fun `invalid signature and unknown topic never persist processable inbox`() {
        val unsignedId = "ORD-X-${UUID.randomUUID()}"
        val unsigned = notify(unsignedId, "evt-x", "req-x", signature = "NOPE")
        assertEquals(401, unsigned.statusCode.value())
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM mp_order_notification_inbox WHERE query_data_id=?", Int::class.java, unsignedId))
        val aliasId = "ORD-Y-${UUID.randomUUID()}"
        val alias = notify(aliasId, "evt-y", "req-y", topic = "orders_v2")
        assertEquals(200, alias.statusCode.value())
        assertEquals("QUARANTINED", jdbc.queryForObject("SELECT disposition FROM mp_order_notification_inbox WHERE query_data_id=?", String::class.java, aliasId))
        val discordId = "ORD-Z-${UUID.randomUUID()}"
        val discord = notify(discordId, "evt-z", "req-z", bodyDataId = "OTHER")
        assertEquals(200, discord.statusCode.value())
        assertEquals("QUARANTINED", jdbc.queryForObject("SELECT disposition FROM mp_order_notification_inbox WHERE query_data_id=?", String::class.java, discordId))
        assertEquals(0, worker.process())
    }

    @Test
    fun `expired reservation without stock confirms review without consume or fulfillment`() {
        val sku = "SKU-REVIEW-${UUID.randomUUID()}"
        val orderId = checkout(sku)
        jdbc.update("UPDATE inventory_reservations SET status='EXPIRED',expires_at=created_at+interval '1 second' WHERE reservation_saga_key=(SELECT (checkout_snapshot->>'reservationSagaKey')::uuid FROM orders WHERE id=?)", orderId)
        jdbc.update("UPDATE inventory_balances SET available_quantity=0,reserved_quantity=0 WHERE variant_id=(SELECT id FROM product_variants WHERE sku=?)", sku)
        val providerOrderId = "ORD-REVIEW-${UUID.randomUUID()}"
        bindRemote(orderId, providerOrderId)
        notify(providerOrderId, "evt-rev", "req-rev")
        assertEquals(1, worker.process())
        assertEquals("APPROVED", jdbc.queryForObject("SELECT status FROM payments WHERE order_id=?", String::class.java, orderId))
        assertEquals("PAID_STOCK_REVIEW", jdbc.queryForObject("SELECT status FROM orders WHERE id=?", String::class.java, orderId))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_reservations WHERE status='CONSUMED' AND reservation_saga_key=(SELECT (checkout_snapshot->>'reservationSagaKey')::uuid FROM orders WHERE id=?)", Int::class.java, orderId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mp_order_incidents WHERE order_id=? AND kind='PAID_WITHOUT_STOCK'", Int::class.java, orderId))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM mp_verified_business_events e JOIN mp_order_commercial_applications a ON a.id=e.application_id WHERE a.order_id=?", Int::class.java, orderId))
        val ship = exchange("/api/v1/user/orders/$orderId/shipments", HttpMethod.POST, """{"status":"PACKED","tracking":null}""", admin.cookie, admin.csrf)
        assertEquals(400, ship.statusCode.value())
    }

    @Test
    fun `refund opens under review without restock and recovery stays conservative`() {
        val orderId = checkout("SKU-REF-${UUID.randomUUID()}")
        val providerOrderId = "ORD-REF-${UUID.randomUUID()}"
        bindRemote(orderId, providerOrderId, status = "processed", detail = "refunded", paid = BigDecimal.ZERO)
        notify(providerOrderId, "evt-ref", "req-ref")
        assertEquals(1, worker.process())
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mp_order_reversal_cases WHERE provider_order_id=? AND kind='REFUND_TOTAL' AND review_status='UNDER_REVIEW'", Int::class.java, providerOrderId))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE event_type='RELEASE' AND actor='MP_ORDERS:$orderId'", Int::class.java))
        Fakes.searchResult.set(OfficialOrderSearchResult(emptyList(), 1, true))
        val recovered = attempts.recover(jdbc.queryForObject("SELECT id FROM mp_checkout_attempts WHERE provider_order_id=?", Long::class.java, providerOrderId)!!)
        assertEquals("RECOVERY_REQUIRED", recovered["state"])
        Fakes.searchResult.set(
            OfficialOrderSearchResult(
                listOf(
                    candidate(providerOrderId, "SC-mismatch"),
                    candidate("ORD-OTHER", "SC-mismatch-2"),
                ),
                1,
                true,
            ),
        )
        val multi = attempts.recover(jdbc.queryForObject("SELECT id FROM mp_checkout_attempts WHERE provider_order_id=?", Long::class.java, providerOrderId)!!)
        assertEquals("RECOVERY_REQUIRED", multi["state"])
    }

    private fun checkout(sku: String): Long {
        putProduct(sku, "Paid Item", available = 5)
        customer = addAddress(customer)
        val added = exchange("/api/v1/customer/cart/items", HttpMethod.PUT, """{"sku":"$sku","quantity":1}""", customer.cookie, customer.csrf)
        customer = customer.copy(csrf = added.headers.getFirst("X-CSRF-Token")!!)
        val checkout = exchange("/api/v1/customer/checkout", HttpMethod.POST, """{"idempotencyKey":"${UUID.randomUUID()}","addressId":"${customer.addressId}","currency":"ARS"}""", customer.cookie, customer.csrf)
        return Regex(""""orderId"\s*:\s*"(\d+)"""").find(checkout.body!!)!!.groupValues[1].toLong()
    }

    private fun bindRemote(
        orderId: Long,
        providerOrderId: String,
        status: String = "processed",
        detail: String = "accredited",
        paid: BigDecimal? = null,
    ) {
        val amount = jdbc.queryForObject("SELECT total FROM orders WHERE id=?", BigDecimal::class.java, orderId)!!
        val paidAmount = paid ?: amount
        val reference = jdbc.query(
            "SELECT external_reference FROM mp_checkout_attempts WHERE order_id=?",
            { rs, _ -> rs.getString(1) },
            orderId,
        ).firstOrNull() ?: run {
            Fakes.createResult.set(
                CreationObservation.VerifiedSuccess(providerOrderId, "https://www.mercadopago.com.ar/checkout/$providerOrderId"),
            )
            val attemptId = attempts.prepare(orderId, UUID.randomUUID())
            val bound = attempts.postAndBind(attemptId)
            assertEquals("READY_FOR_REDIRECT", bound["state"], bound.toString())
            jdbc.queryForObject("SELECT external_reference FROM mp_checkout_attempts WHERE id=?", String::class.java, attemptId)!!
        }
        Fakes.orders[providerOrderId] = OfficialOrderResource(
            providerOrderId = providerOrderId,
            externalReference = reference,
            merchantId = "user-1",
            applicationId = "app-1",
            totalAmount = amount,
            paidAmount = paidAmount,
            currency = "ARS",
            status = status,
            statusDetail = detail,
            transactions = listOf(OfficialOrderTransaction(providerOrderId + "-pay", status, detail, paidAmount, "account_money")),
        )
    }

    private fun notify(
        providerOrderId: String,
        eventId: String,
        requestId: String,
        topic: String = "order",
        bodyDataId: String = providerOrderId,
        signature: String = "VALID",
    ) = exchange(
        "/api/v1/payments/mercadopago/orders/notifications?data.id=$providerOrderId&type=$topic",
        HttpMethod.POST,
        """{"id":"$eventId","type":"$topic","action":"order.processed","user_id":"user-1","application_id":"app-1","data":{"id":"$bodyDataId"}}""",
        headers = mapOf("x-signature" to signature, "x-request-id" to requestId),
    )

    private fun candidate(id: String, reference: String) = RemoteOrderCandidate(
        id, reference, "user-1", "app-1", BigDecimal("100.00"), "ARS",
    )

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

    private fun exchange(
        path: String,
        method: HttpMethod,
        body: String?,
        cookie: String? = null,
        csrf: String? = null,
        headers: Map<String, String> = emptyMap(),
    ) = http.exchange(
        URI("http://localhost:$port$path"),
        method,
        HttpEntity(
            body,
            HttpHeaders().apply {
                contentType = MediaType.APPLICATION_JSON
                set(HttpHeaders.ORIGIN, "http://localhost:4200")
                cookie?.let { set(HttpHeaders.COOKIE, it) }
                csrf?.let { set("X-CSRF-Token", it) }
                headers.forEach { (key, value) -> set(key, value) }
            },
        ),
        String::class.java,
    )

    private data class Session(val cookie: String, val csrf: String, val addressId: String = "")

    @TestConfiguration
    open class Fakes {
        @Bean
        @Primary
        open fun signatures(): OfficialWebhookSignaturePort = object : OfficialWebhookSignaturePort {
            override fun configured() = true
            override fun validate(xSignature: String?, xRequestId: String?, queryDataId: String?) =
                if (xSignature == "VALID" && !xRequestId.isNullOrBlank() && !queryDataId.isNullOrBlank()) {
                    WebhookSignatureDecision.Accepted
                } else {
                    WebhookSignatureDecision.Rejected("INVALID")
                }
        }

        @Bean
        @Primary
        open fun officialOrders(): Lane = Lane

        object Lane : OfficialOrderQueryPort, OfficialOrderCommandPort {
            override fun configured() = true
            override fun getByProviderOrderId(providerOrderId: String) = orders[providerOrderId]
            override fun create(request: OfficialOrderCreateRequest) =
                createResult.get() ?: CreationObservation.Timeout
            override fun search(query: OfficialOrderSearchQuery) = searchResult.get()
        }

        companion object {
            val orders = ConcurrentHashMap<String, OfficialOrderResource>()
            val createResult = AtomicReference<CreationObservation?>(null)
            val searchResult = AtomicReference(OfficialOrderSearchResult(emptyList(), 1, true))
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
