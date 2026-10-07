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
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
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

    @Test
    fun `customer checkout returns allowlisted remote url`() {
        val sku = "SKU-URL-${UUID.randomUUID()}"
        val providerOrderId = "ORD-URL-${UUID.randomUUID()}"
        val checkoutUrl = "https://www.mercadopago.com.ar/checkout/$providerOrderId"
        Fakes.createResult.set(CreationObservation.VerifiedSuccess(providerOrderId, checkoutUrl))
        putProduct(sku, "Paid Item", available = 5)
        customer = addAddress(customer)
        val added = exchange("/api/v1/customer/cart/items", HttpMethod.PUT, """{"sku":"$sku","quantity":1}""", customer.cookie, customer.csrf)
        customer = customer.copy(csrf = added.headers.getFirst("X-CSRF-Token")!!)
        val checkout = exchange("/api/v1/customer/checkout", HttpMethod.POST, """{"idempotencyKey":"${UUID.randomUUID()}","addressId":"${customer.addressId}","currency":"ARS"}""", customer.cookie, customer.csrf)
        assertEquals(200, checkout.statusCode.value(), checkout.body)
        assertTrue(checkout.body!!.contains(checkoutUrl), checkout.body)
        val orderId = Regex(""""orderId"\s*:\s*"(\d+)"""").find(checkout.body!!)!!.groupValues[1].toLong()
        assertEquals("READY_FOR_REDIRECT", jdbc.queryForObject("SELECT state FROM mp_checkout_attempts WHERE order_id=?", String::class.java, orderId))
        assertEquals(providerOrderId, jdbc.queryForObject("SELECT provider_order_id FROM mp_checkout_attempts WHERE order_id=?", String::class.java, orderId))
    }

    @Test
    fun `refetched official order id different from claimed query is quarantined`() {
        val orderId = checkout("SKU-MIS-${UUID.randomUUID()}")
        val claimed = "ORD-CLAIM-${UUID.randomUUID()}"
        bindRemote(orderId, claimed)
        val official = Fakes.orders.getValue(claimed)
        Fakes.orders[claimed] = official.copy(providerOrderId = "ORD-OTHER-${UUID.randomUUID()}")
        notify(claimed, "evt-mis", "req-mis")
        assertEquals(0, worker.process())
        assertEquals("QUARANTINED", jdbc.queryForObject("SELECT status FROM mp_order_notification_processing p JOIN mp_order_notification_inbox i ON i.id=p.inbox_id WHERE i.query_data_id=?", String::class.java, claimed))
        assertEquals("REFETCHED_ORDER_ID_MISMATCH", jdbc.queryForObject("SELECT last_error FROM mp_order_notification_processing p JOIN mp_order_notification_inbox i ON i.id=p.inbox_id WHERE i.query_data_id=?", String::class.java, claimed))
        assertEquals("PENDING", jdbc.queryForObject("SELECT status FROM payments WHERE order_id=?", String::class.java, orderId))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM mp_order_commercial_applications WHERE order_id=?", Int::class.java, orderId))
    }

    @Test
    fun `two remotes and concurrent workers accredit once and record duplicate`() {
        val orderId = checkout("SKU-DUP-${UUID.randomUUID()}")
        val first = "ORD-DUP-A-${UUID.randomUUID()}"
        val second = "ORD-DUP-B-${UUID.randomUUID()}"
        bindRemote(orderId, first)
        jdbc.update("UPDATE mp_checkout_attempts SET state='SUPERSEDED' WHERE order_id=?", orderId)
        bindRemote(orderId, second)
        assertNotEquals(first, second)
        notify(first, "evt-dup-a", "req-dup-a")
        notify(second, "evt-dup-b", "req-dup-b")
        val start = CountDownLatch(1)
        val done = CountDownLatch(2)
        val pool = Executors.newFixedThreadPool(2)
        repeat(2) {
            pool.submit {
                start.await()
                runCatching { worker.process() }
                done.countDown()
            }
        }
        start.countDown()
        assertTrue(done.await(20, TimeUnit.SECONDS))
        pool.shutdownNow()
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mp_order_commercial_applications WHERE order_id=? AND transition='PAYMENT_ACCREDITED'", Int::class.java, orderId))
        assertEquals("APPROVED", jdbc.queryForObject("SELECT status FROM payments WHERE order_id=?", String::class.java, orderId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mp_order_incidents WHERE order_id=? AND kind='DUPLICATE_REMOTE_CREDIT'", Int::class.java, orderId))
    }

@Test
    fun `official worker proof permits ordered shipment and full reception without stock effects`() {
        val sku = "SKU-FULFILL-${UUID.randomUUID()}"
        val orderId = checkoutWithQuantity(sku, 2)
        val provider = "ORD-FULFILL-${UUID.randomUUID()}"
        bindRemote(orderId, provider)
        assertEquals(200, notify(provider, "fulfill", "fulfill").statusCode.value())
        assertEquals(1, worker.process())
        val read = exchange("/api/v1/user/orders/$orderId", HttpMethod.GET, null, admin.cookie)
        assertEquals(200, read.statusCode.value(), read.body)
        assertTrue(read.body!!.contains("\"fulfillmentEligibility\":\"ELIGIBLE\""))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger l JOIN inventory_reservations r ON r.id=l.reservation_id WHERE l.actor=? AND l.event_type='SALE' AND l.channel='WEB' AND l.quantity_delta=-2 AND r.quantity=2 AND r.status='CONSUMED'", Int::class.java, "MP_ORDERS:$orderId"))
        val stock = jdbc.queryForList("SELECT b.* FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id WHERE v.sku=?", sku)
        val ledger = jdbc.queryForList("SELECT l.* FROM inventory_ledger l JOIN product_variants v ON v.id=l.variant_id WHERE v.sku=? ORDER BY l.id", sku)
        val early = command(orderId, "rma", "RECEIVED")
        assertEquals(400, early.statusCode.value(), early.body)
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM returns WHERE order_id=?", Int::class.java, orderId))
        for ((wire, persisted) in listOf("PACKED" to "PREPARING", "SHIPPED" to "SHIPPED", "DELIVERED" to "DELIVERED")) {
            val response = command(orderId, "shipments", wire)
            assertEquals(200, response.statusCode.value(), response.body)
            assertTrue(response.body!!.contains("\"shipmentStatus\":\"$persisted\""))
            assertEquals(persisted, jdbc.queryForObject("SELECT status FROM shipments WHERE order_id=?", String::class.java, orderId))
            val replay = command(orderId, "shipments", wire)
            assertEquals(400, replay.statusCode.value(), replay.body)
        }
        assertEquals(3, jdbc.queryForObject("SELECT COUNT(*) FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id=?", Int::class.java, orderId))
        val dates = jdbc.queryForList("SELECT shipped_at,delivered_at FROM shipments WHERE order_id=?", orderId)
        val shippedAt = dates.single()["shipped_at"] as java.sql.Timestamp
        val deliveredAt = dates.single()["delivered_at"] as java.sql.Timestamp
        assertTrue(!deliveredAt.before(shippedAt), "delivery timestamp must follow shipment")
        val received = command(orderId, "rma", "RECEIVED")
        assertEquals(200, received.statusCode.value(), received.body)
        assertTrue(received.body!!.contains("\"rmaStatus\":\"RETURN_RECEIVED\""))
        assertEquals("RETURN_RECEIVED", jdbc.queryForObject("SELECT status FROM returns WHERE order_id=?", String::class.java, orderId))
        assertEquals(listOf(2), jdbc.query("SELECT ri.quantity FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE r.order_id=?", { rs, _ -> rs.getInt(1) }, orderId))
        for (wire in listOf("RECEIVED", "INSPECTED", "ADJUSTED")) assertEquals(400, command(orderId, "rma", wire).statusCode.value())
        assertEquals(stock, jdbc.queryForList("SELECT b.* FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id WHERE v.sku=?", sku))
        assertEquals(ledger, jdbc.queryForList("SELECT l.* FROM inventory_ledger l JOIN product_variants v ON v.id=l.variant_id WHERE v.sku=? ORDER BY l.id", sku))
        assertEquals(dates, jdbc.queryForList("SELECT shipped_at,delivered_at FROM shipments WHERE order_id=?", orderId))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE r.order_id=? AND ri.adjustment_ledger_id IS NOT NULL", Int::class.java, orderId))
        val reload = exchange("/api/v1/user/orders/$orderId", HttpMethod.GET, null, admin.cookie)
        assertTrue(reload.body!!.contains("\"shipmentStatus\":\"DELIVERED\""))
        assertTrue(reload.body!!.contains("\"rmaStatus\":\"RETURN_RECEIVED\""))
        jdbc.update("UPDATE returns SET status='INSPECTED',inspection_result='RESTOCK' WHERE order_id=?", orderId)
        for (wire in listOf("RECEIVED", "INSPECTED", "ADJUSTED")) assertEquals(400, command(orderId, "rma", wire).statusCode.value())
        assertEquals("INSPECTED", jdbc.queryForObject("SELECT status FROM returns WHERE order_id=?", String::class.java, orderId))
        assertEquals(ledger, jdbc.queryForList("SELECT l.* FROM inventory_ledger l JOIN product_variants v ON v.id=l.variant_id WHERE v.sku=? ORDER BY l.id", sku))
        assertEquals(stock, jdbc.queryForList("SELECT b.* FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id WHERE v.sku=?", sku))
    }

    @Test
    fun `re-reservation accreditation qualifies but reversed or unproved paid orders do not`() {
        val orderId = checkout("SKU-RERESERVE-${UUID.randomUUID()}")
        jdbc.update("UPDATE inventory_reservations SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE reservation_saga_key=(SELECT (checkout_snapshot->>'reservationSagaKey')::uuid FROM orders WHERE id=?)", orderId)
        val inventory = com.storecore.commerce.infrastructure.JdbcInventoryService(jdbc, org.springframework.transaction.support.TransactionTemplate(org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.dataSource!!)))
        inventory.expireOverdue()
        val provider = "ORD-RERESERVE-${UUID.randomUUID()}"
        bindRemote(orderId, provider)
        notify(provider, "rereserve", "rereserve")
        assertEquals(1, worker.process())
        assertEquals("EXPIRED", jdbc.queryForObject("SELECT status FROM inventory_reservations WHERE reservation_saga_key=(SELECT (checkout_snapshot->>'reservationSagaKey')::uuid FROM orders WHERE id=?)", String::class.java, orderId))
        assertEquals(200, command(orderId, "shipments", "PACKED").statusCode.value())
        val before = jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId)
        bindRemote(orderId, provider, "charged_back", "charged_back")
        notify(provider, "reverse", "reverse")
        assertEquals(1, worker.process())
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM mp_order_reversal_cases r JOIN mp_checkout_attempts a ON a.id=r.attempt_id WHERE a.order_id=?", Int::class.java, orderId))
        jdbc.update("UPDATE mp_order_reversal_cases SET review_status='RESOLVED' WHERE attempt_id IN (SELECT id FROM mp_checkout_attempts WHERE order_id=?)", orderId)
        assertEquals(400, command(orderId, "shipments", "SHIPPED").statusCode.value())
        assertEquals(before, jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId))
        val unpaid = checkout("SKU-FORGED-${UUID.randomUUID()}")
        jdbc.update("UPDATE orders SET status='PAID' WHERE id=?", unpaid)
        jdbc.update("UPDATE payments SET status='APPROVED' WHERE order_id=?", unpaid)
        assertEquals(400, command(unpaid, "shipments", "PACKED").statusCode.value())
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id=?", Int::class.java, unpaid))
    }

    @Test
    fun `two independent user sessions serialize shipment and reception with one effect`() {
        val sku = "SKU-RACE-${UUID.randomUUID()}"
        val orderId = checkout(sku)
        val provider = "ORD-RACE-${UUID.randomUUID()}"
        bindRemote(orderId, provider); notify(provider, "race", "race")
        assertEquals(1, worker.process())
        val stock = jdbc.queryForList("SELECT b.* FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id WHERE v.sku=?", sku)
        val ledger = jdbc.queryForList("SELECT l.* FROM inventory_ledger l JOIN product_variants v ON v.id=l.variant_id WHERE v.sku=? ORDER BY l.id", sku)
        assertClosedFulfillmentRejection(command(orderId, "shipments", com.storecore.commerce.domain.ShipmentCommand.DELIVERED.name))
        assertClosedFulfillmentRejection(command(orderId, "rma", com.storecore.commerce.domain.RmaCommand.RECEIVED.name))
        val other = provisionAdmin("admin-race-${UUID.randomUUID()}@example.com")
        val packed = raceCommand(orderId, "shipments", "PACKED", other)
        assertEquals(listOf(200, 400), packed.map { it.statusCode.value() }.sorted())
        packed.first().headers.getFirst("X-CSRF-Token")?.let { admin = admin.copy(csrf = it) }
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id=?", Int::class.java, orderId))
        assertEquals(200, command(orderId, "shipments", "SHIPPED").statusCode.value())
        assertEquals(200, command(orderId, "shipments", "DELIVERED").statusCode.value())
        val received = raceCommand(orderId, "rma", "RECEIVED", other.copy(csrf = packed.last().headers.getFirst("X-CSRF-Token") ?: other.csrf))
        assertEquals(listOf(200, 400), received.map { it.statusCode.value() }.sorted())
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM returns WHERE order_id=?", Int::class.java, orderId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE r.order_id=?", Int::class.java, orderId))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM return_items ri JOIN returns r ON r.id=ri.return_id WHERE r.order_id=? AND adjustment_ledger_id IS NOT NULL", Int::class.java, orderId))
        assertEquals(stock, jdbc.queryForList("SELECT b.* FROM inventory_balances b JOIN product_variants v ON v.id=b.variant_id WHERE v.sku=?", sku))
        assertEquals(ledger, jdbc.queryForList("SELECT l.* FROM inventory_ledger l JOIN product_variants v ON v.id=l.variant_id WHERE v.sku=? ORDER BY l.id", sku))
    }

    private fun command(orderId: Long, route: String, wire: String): org.springframework.http.ResponseEntity<String> {
        val response = exchange("/api/v1/user/orders/$orderId/$route", HttpMethod.POST, """{"status":"$wire","tracking":"fixture-tracking"}""", admin.cookie, admin.csrf)
        response.headers.getFirst("X-CSRF-Token")?.let { admin = admin.copy(csrf = it) }
        return response
    }

    @Test
    fun `eligible fulfillment rejects missing authority csrf origin and capability without writes`() {
        val orderId = checkout("SKU-SECURITY-${UUID.randomUUID()}")
        val provider = "ORD-SECURITY-${UUID.randomUUID()}"
        bindRemote(orderId, provider); notify(provider, "security", "security")
        assertEquals(1, worker.process())
        val actor = adminUserId()
        val other = provisionAdmin("admin-no-role-${UUID.randomUUID()}@example.com")
        val otherId = adminUserId()
        jdbc.update("DELETE FROM user_roles WHERE user_id=?", otherId)
        val shipments = jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId)
        val balances = jdbc.queryForList("SELECT * FROM inventory_balances ORDER BY variant_id")
        val ledger = jdbc.queryForList("SELECT * FROM inventory_ledger ORDER BY id")
        for ((route, wire) in listOf("shipments" to com.storecore.commerce.domain.ShipmentCommand.PACKED.name, "rma" to com.storecore.commerce.domain.RmaCommand.RECEIVED.name)) {
            val path = "/api/v1/user/orders/$orderId/$route"
            val body = """{"status":"$wire"}"""
            for (session in listOf(null, customer, other)) {
                val denied = exchange(path, HttpMethod.POST, body, session?.cookie, session?.csrf ?: "unused")
                assertEquals(401, denied.statusCode.value(), denied.body)
            }
            for (token in listOf(null, "stale-token")) assertEquals(403, exchange(path, HttpMethod.POST, body, admin.cookie, token).statusCode.value())
            assertEquals(403, exchange(path, HttpMethod.POST, body, admin.cookie, admin.csrf, mapOf(HttpHeaders.ORIGIN to "https://foreign.example.test")).statusCode.value())
        }
        // The only persisted roles are ADMIN/OPERATOR, both permitted. A USER with
        // no role is rejected as unauthenticated; there is no invented third role.
        for (state in listOf(com.storecore.configuration.domain.CapabilityState.DISABLED, com.storecore.configuration.domain.CapabilityState.READ_ONLY)) {
            val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MANUAL_FULFILLMENT'", Int::class.java)
            jdbc.query("SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)", { _, _ -> }, actor, adminSessionId(actor), "MANUAL_FULFILLMENT", version, state.wire, "{}", UUID.randomUUID(), "acceptance security matrix")
            for ((route, wire) in listOf("shipments" to com.storecore.commerce.domain.ShipmentCommand.PACKED.name, "rma" to com.storecore.commerce.domain.RmaCommand.RECEIVED.name)) {
                assertEquals(409, command(orderId, route, wire).statusCode.value())
            }
        }
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MANUAL_FULFILLMENT'", Int::class.java)
        jdbc.query("SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)", { _, _ -> }, actor, adminSessionId(actor), "MANUAL_FULFILLMENT", version, com.storecore.configuration.domain.CapabilityState.ACTIVE.wire, "{}", UUID.randomUUID(), "restore fixture")
        val stranger = registerCustomer("stranger-${UUID.randomUUID()}@example.com")
        assertEquals(404, exchange("/api/v1/customer/orders/$orderId", HttpMethod.GET, null, stranger.cookie).statusCode.value())
        assertEquals(shipments, jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM returns WHERE order_id=?", Int::class.java, orderId))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id=?", Int::class.java, orderId))
        assertEquals(balances, jdbc.queryForList("SELECT * FROM inventory_balances ORDER BY variant_id"))
        assertEquals(ledger, jdbc.queryForList("SELECT * FROM inventory_ledger ORDER BY id"))
    }

    @Test
    fun `re-reserved stock requires exact quantity variant and order actor`() {
        val orderId = checkoutWithQuantity("SKU-EXACT-${UUID.randomUUID()}", 2)
        val foreignId = checkout("SKU-FOREIGN-${UUID.randomUUID()}")
        jdbc.update("UPDATE inventory_reservations SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE reservation_saga_key=(SELECT (checkout_snapshot->>'reservationSagaKey')::uuid FROM orders WHERE id=?)", orderId)
        val inventory = com.storecore.commerce.infrastructure.JdbcInventoryService(jdbc, org.springframework.transaction.support.TransactionTemplate(org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.dataSource!!)))
        inventory.expireOverdue()
        val provider = "ORD-EXACT-${UUID.randomUUID()}"
        bindRemote(orderId, provider); notify(provider, "exact", "exact")
        assertEquals(1, worker.process())
        val reservation = jdbc.queryForObject("SELECT reservation_id FROM inventory_ledger WHERE actor=? AND event_type='SALE'", Long::class.java, "MP_ORDERS:$orderId")!!
        val variant = jdbc.queryForObject("SELECT variant_id FROM inventory_reservations WHERE id=?", Long::class.java, reservation)!!
        val foreignVariant = jdbc.queryForObject("SELECT variant_id FROM order_items WHERE order_id=?", Long::class.java, foreignId)!!
        val before = jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId)
        for (quantity in listOf(1, 3)) {
            jdbc.update("UPDATE inventory_reservations SET quantity=? WHERE id=?", quantity, reservation)
            assertClosedFulfillmentRejection(command(orderId, "shipments", com.storecore.commerce.domain.ShipmentCommand.PACKED.name))
        }
        jdbc.update("UPDATE inventory_reservations SET quantity=2,variant_id=? WHERE id=?", foreignVariant, reservation)
        assertClosedFulfillmentRejection(command(orderId, "shipments", com.storecore.commerce.domain.ShipmentCommand.PACKED.name))
        jdbc.update("UPDATE inventory_reservations SET variant_id=? WHERE id=?", variant, reservation)
        jdbc.update("UPDATE orders SET status=? WHERE id=?", com.storecore.commerce.domain.OrderStatus.PAID.name, foreignId)
        jdbc.update("UPDATE payments SET status=? WHERE order_id=?", com.storecore.commerce.domain.PaymentStatus.APPROVED.name, foreignId)
        assertClosedFulfillmentRejection(command(foreignId, "shipments", com.storecore.commerce.domain.ShipmentCommand.PACKED.name))
        assertEquals(before, jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id IN (?,?)", Int::class.java, orderId, foreignId))
        assertEquals(200, command(orderId, "shipments", com.storecore.commerce.domain.ShipmentCommand.PACKED.name).statusCode.value())
    }

    private fun raceCommand(orderId: Long, route: String, wire: String, other: Session): List<org.springframework.http.ResponseEntity<String>> {
        val start = CountDownLatch(1)
        val pool = Executors.newFixedThreadPool(2)
        try {
            val results = listOf(admin, other).map { session -> pool.submit<org.springframework.http.ResponseEntity<String>> {
                assertTrue(start.await(10, TimeUnit.SECONDS))
                exchange("/api/v1/user/orders/$orderId/$route", HttpMethod.POST, """{"status":"$wire"}""", session.cookie, session.csrf)
            } }
            start.countDown()
            return results.map { it.get(20, TimeUnit.SECONDS) }
        } finally { pool.shutdownNow(); assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS)) }
    }

    @Test
    fun `late checkout bind and recovery cannot regress accredited fulfillment evidence`() {
        val orderId = checkout("SKU-LATE-BIND-${UUID.randomUUID()}")
        val provider = "ORD-LATE-BIND-${UUID.randomUUID()}"
        bindRemote(orderId, provider)
        notify(provider, "late-bind", "late-bind")
        assertEquals(1, worker.process())
        val attemptId = jdbc.queryForObject("SELECT id FROM mp_checkout_attempts WHERE order_id=? AND state='ACCREDITED'", Long::class.java, orderId)!!
        Fakes.createResult.set(
            CreationObservation.VerifiedSuccess(provider, "https://www.mercadopago.com.ar/checkout/$provider"),
        )
        val bound = try {
            attempts.postAndBind(attemptId)
        } finally {
            Fakes.createResult.set(null)
        }
        assertEquals("ACCREDITED", bound["state"])
        attempts.recover(attemptId)
        assertEquals("ACCREDITED", jdbc.queryForObject("SELECT state FROM mp_checkout_attempts WHERE id=?", String::class.java, attemptId))
        assertEquals(200, command(orderId, "shipments", "PACKED").statusCode.value())
    }

@Test
    fun `blocked commercial states and corrupted exact stock proof produce no writes`() {
        val orderId = checkout("SKU-MATRIX-${UUID.randomUUID()}")
        val provider = "ORD-MATRIX-${UUID.randomUUID()}"
        bindRemote(orderId, provider); notify(provider, "matrix", "matrix")
        assertEquals(1, worker.process())
        val before = jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId)
        for (status in com.storecore.commerce.domain.OrderStatus.entries.filter { it != com.storecore.commerce.domain.OrderStatus.PAID && it != com.storecore.commerce.domain.OrderStatus.UNKNOWN }) {
            jdbc.update("UPDATE orders SET status=? WHERE id=?", status.name, orderId)
            assertEquals(400, command(orderId, "shipments", "PACKED").statusCode.value())
        }
        jdbc.update("UPDATE orders SET status='PAID' WHERE id=?", orderId)
        for (status in com.storecore.commerce.domain.PaymentStatus.entries.filter { it != com.storecore.commerce.domain.PaymentStatus.APPROVED && it != com.storecore.commerce.domain.PaymentStatus.UNKNOWN }) {
            jdbc.update("UPDATE payments SET status=? WHERE order_id=?", status.name, orderId)
            assertEquals(400, command(orderId, "shipments", "PACKED").statusCode.value())
        }
        jdbc.update("UPDATE payments SET status='APPROVED' WHERE order_id=?", orderId)
        jdbc.update("UPDATE payments SET amount=amount+1 WHERE order_id=?", orderId)
        assertEquals(400, command(orderId, "shipments", "PACKED").statusCode.value())
        jdbc.update("UPDATE payments SET amount=amount-1 WHERE order_id=?", orderId)
        val reservationId = jdbc.queryForObject("SELECT reservation_id FROM inventory_ledger WHERE actor=? AND event_type='SALE' AND channel='WEB'", Long::class.java, "MP_ORDERS:$orderId")!!
        jdbc.update("UPDATE inventory_reservations SET quantity=quantity+1 WHERE id=?", reservationId)
        assertEquals(400, command(orderId, "shipments", "PACKED").statusCode.value())
        jdbc.update("UPDATE inventory_reservations SET quantity=quantity-1 WHERE id=?", reservationId)
        jdbc.update("INSERT INTO inventory_ledger(variant_id,reservation_id,event_idempotency_key,event_type,channel,quantity_delta,actor) SELECT variant_id,reservation_id,?,'SALE','WEB',quantity_delta,actor FROM inventory_ledger WHERE actor=? AND event_type='SALE' AND channel='WEB'", UUID.randomUUID(), "MP_ORDERS:$orderId")
        assertEquals(400, command(orderId, "shipments", "PACKED").statusCode.value())
        assertEquals(before, jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id=?", Int::class.java, orderId))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM returns WHERE order_id=?", Int::class.java, orderId))
    }

    @Test
    fun `failure after shipment writes rolls back children events and csrf rotation`() {
        val orderId = checkout("SKU-ROLLBACK-${UUID.randomUUID()}")
        val provider = "ORD-ROLLBACK-${UUID.randomUUID()}"
        bindRemote(orderId, provider); notify(provider, "rollback", "rollback")
        assertEquals(1, worker.process())
        jdbc.update("DELETE FROM shipments WHERE order_id=?", orderId)
        val csrf = admin.csrf
        val function = "cfe_fixture_failure_$orderId"
        jdbc.execute("CREATE FUNCTION $function() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'CFE fixture failure'; END; \$\$")
        jdbc.execute("CREATE TRIGGER $function AFTER INSERT ON fulfillment_events FOR EACH ROW WHEN (NEW.actor='USER:${adminUserId()}') EXECUTE FUNCTION $function()")
        try {
            val failed = command(orderId, "shipments", "PACKED")
            assertEquals(500, failed.statusCode.value(), failed.body)
            assertEquals(csrf, admin.csrf)
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM shipments WHERE order_id=?", Int::class.java, orderId))
            assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM returns WHERE order_id=?", Int::class.java, orderId))
        } finally {
            jdbc.execute("DROP TRIGGER $function ON fulfillment_events")
            jdbc.execute("DROP FUNCTION $function()")
        }
        assertEquals(200, command(orderId, "shipments", "PACKED").statusCode.value())
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM shipments WHERE order_id=?", Int::class.java, orderId))
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id=?", Int::class.java, orderId))
    }

    private enum class WriterOrdering { PAYMENT_FIRST, FULFILLMENT_FIRST }

    @Test
    fun `ambiguous historical returns suppress advertised actions and all fulfillment writes`() {
        val orderId = checkout("SKU-AMBIGUOUS-RMA-${UUID.randomUUID()}")
        val provider = "ORD-AMBIGUOUS-RMA-${UUID.randomUUID()}"
        bindRemote(orderId, provider)
        notify(provider, "ambiguous-rma", "ambiguous-rma")
        assertEquals(1, worker.process())
        for (suffix in listOf("FIRST", "SECOND")) jdbc.update("INSERT INTO returns(rma_number,order_id,status) VALUES (?,?,'REQUESTED')", "RMA-$orderId-$suffix", orderId)
        val before = jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId)
        val returns = jdbc.queryForList("SELECT * FROM returns WHERE order_id=? ORDER BY id", orderId)
        val ledger = jdbc.queryForList("SELECT l.* FROM inventory_ledger l JOIN order_items oi ON oi.variant_id=l.variant_id WHERE oi.order_id=? ORDER BY l.id", orderId)
        val read = exchange("/api/v1/user/orders/$orderId", HttpMethod.GET, null, admin.cookie)
        assertEquals(200, read.statusCode.value(), read.body)
        val data = com.fasterxml.jackson.module.kotlin.jacksonObjectMapper().readTree(read.body!!).path("data")
        assertEquals(com.storecore.commerce.domain.RmaStatus.UNKNOWN.name, data.path("rmaStatus").asText())
        assertTrue(data.path("shipmentAction").isNull)
        assertTrue(data.path("rmaAction").isNull)
        for (command in com.storecore.commerce.domain.ShipmentCommand.entries) assertClosedFulfillmentRejection(command(orderId, "shipments", command.name))
        for (command in com.storecore.commerce.domain.RmaCommand.entries) assertClosedFulfillmentRejection(command(orderId, "rma", command.name))
        assertEquals(before, jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId))
        assertEquals(returns, jdbc.queryForList("SELECT * FROM returns WHERE order_id=? ORDER BY id", orderId))
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id=?", Int::class.java, orderId))
        assertEquals(ledger, jdbc.queryForList("SELECT l.* FROM inventory_ledger l JOIN order_items oi ON oi.variant_id=l.variant_id WHERE oi.order_id=? ORDER BY l.id", orderId))
    }

    @Test
    fun `controlled order-lock queues prove both payment and fulfillment orderings`() {
        for (effect in listOf(com.storecore.commerce.domain.CommercialEffect.ACCREDIT, com.storecore.commerce.domain.CommercialEffect.CHARGEBACK, com.storecore.commerce.domain.CommercialEffect.REJECT)) {
            for (ordering in WriterOrdering.entries) {
                val orderId = checkout("SKU-WRITER-RACE-${UUID.randomUUID()}")
                val provider = "ORD-WRITER-RACE-${UUID.randomUUID()}"
                bindRemote(orderId, provider)
                if (effect == com.storecore.commerce.domain.CommercialEffect.CHARGEBACK) {
                    notify(provider, "writer-initial", "writer-initial")
                    assertEquals(1, worker.process())
                    bindRemote(orderId, provider, "processed", "charged_back")
                } else if (effect == com.storecore.commerce.domain.CommercialEffect.REJECT) {
                    bindRemote(orderId, provider, "failed", "rejected", BigDecimal.ZERO)
                }
                notify(provider, "writer-race", "writer-race")
                jdbc.dataSource!!.connection.use { barrier ->
                    val pool = Executors.newFixedThreadPool(2)
                    barrier.autoCommit = false
                    try {
                        val barrierPid = barrier.createStatement().use { statement -> statement.executeQuery("SELECT pg_backend_pid()").use { rs -> check(rs.next()); rs.getInt(1) } }
                        barrier.prepareStatement("SELECT id FROM orders WHERE id=? FOR UPDATE").use { statement ->
                            statement.setLong(1, orderId)
                            statement.executeQuery().use { rs -> assertTrue(rs.next()) }
                        }
                        lateinit var apply: java.util.concurrent.Future<Int>
                        lateinit var fulfill: java.util.concurrent.Future<org.springframework.http.ResponseEntity<String>>
                        val firstPid = if (ordering == WriterOrdering.PAYMENT_FIRST) {
                            apply = pool.submit<Int> { worker.process() }
                            awaitOrderLockWaiter(barrierPid)
                        } else {
                            fulfill = pool.submit<org.springframework.http.ResponseEntity<String>> { command(orderId, "shipments", com.storecore.commerce.domain.ShipmentCommand.PACKED.name) }
                            awaitOrderLockWaiter(barrierPid)
                        }
                        if (ordering == WriterOrdering.PAYMENT_FIRST) {
                            fulfill = pool.submit<org.springframework.http.ResponseEntity<String>> { command(orderId, "shipments", com.storecore.commerce.domain.ShipmentCommand.PACKED.name) }
                        } else {
                            apply = pool.submit<Int> { worker.process() }
                        }
                        val secondPid = awaitOrderLockWaiter(barrierPid, firstPid, firstPid)
                        assertNotEquals(firstPid, secondPid)
                        // Both writers are observed blocked on this owned barrier in the chosen queue order.
                        barrier.commit()
                        assertEquals(1, apply.get(20, TimeUnit.SECONDS))
                        val result = fulfill.get(20, TimeUnit.SECONDS)
                        val packed = (effect == com.storecore.commerce.domain.CommercialEffect.ACCREDIT && ordering == WriterOrdering.PAYMENT_FIRST) ||
                            (effect == com.storecore.commerce.domain.CommercialEffect.CHARGEBACK && ordering == WriterOrdering.FULFILLMENT_FIRST)
                        assertEquals(if (packed) 200 else 400, result.statusCode.value(), "$effect/$ordering: ${result.body}")
                        if (!packed) assertClosedFulfillmentRejection(result)
                        val events = jdbc.queryForList("SELECT e.* FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id=? ORDER BY e.id", orderId)
                        assertEquals(if (packed) 1 else 0, events.size)
                        if (effect != com.storecore.commerce.domain.CommercialEffect.ACCREDIT) {
                            val before = jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId)
                            val stock = jdbc.queryForList("SELECT b.* FROM inventory_balances b JOIN order_items oi ON oi.variant_id=b.variant_id WHERE oi.order_id=?", orderId)
                            val ledger = jdbc.queryForList("SELECT l.* FROM inventory_ledger l JOIN order_items oi ON oi.variant_id=l.variant_id WHERE oi.order_id=? ORDER BY l.id", orderId)
                            // After PACKED won, SHIPPED is otherwise valid: only the verified payment reversal may reject it.
                            val next = if (packed) com.storecore.commerce.domain.ShipmentCommand.SHIPPED else com.storecore.commerce.domain.ShipmentCommand.PACKED
                            assertClosedFulfillmentRejection(command(orderId, "shipments", next.name))
                            assertEquals(before, jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId))
                            assertEquals(events, jdbc.queryForList("SELECT e.* FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id=? ORDER BY e.id", orderId))
                            assertEquals(stock, jdbc.queryForList("SELECT b.* FROM inventory_balances b JOIN order_items oi ON oi.variant_id=b.variant_id WHERE oi.order_id=?", orderId))
                            assertEquals(ledger, jdbc.queryForList("SELECT l.* FROM inventory_ledger l JOIN order_items oi ON oi.variant_id=l.variant_id WHERE oi.order_id=? ORDER BY l.id", orderId))
                            val read = exchange("/api/v1/user/orders/$orderId", HttpMethod.GET, null, admin.cookie)
                            val data = com.fasterxml.jackson.module.kotlin.jacksonObjectMapper().readTree(read.body!!).path("data")
                            val reason = if (effect == com.storecore.commerce.domain.CommercialEffect.CHARGEBACK) com.storecore.commerce.domain.FulfillmentEligibility.REVERSAL_OR_INCIDENT else com.storecore.commerce.domain.FulfillmentEligibility.ORDER_NOT_PAID
                            assertEquals(reason.name, data.path("fulfillmentEligibility").asText())
                            assertTrue(data.path("shipmentAction").isNull)
                        } else {
                            val authoritative = exchange("/api/v1/user/orders/$orderId", HttpMethod.GET, null, admin.cookie)
                            assertTrue(authoritative.body!!.contains("\"fulfillmentEligibility\":\"ELIGIBLE\""))
                        }
                    } finally {
                        barrier.rollback()
                        pool.shutdownNow()
                        assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS))
                    }
                }
            }
        }
    }

    private fun awaitOrderLockWaiter(barrierPid: Int, firstWriterPid: Int = 0, excludePid: Int = 0): Int {
        val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(10)
        while (System.nanoTime() < deadline) {
            val pids = jdbc.query(
                """SELECT pid FROM pg_stat_activity
                   WHERE datname=current_database() AND pid<>? AND wait_event_type='Lock'
                     AND query LIKE 'SELECT id FROM orders WHERE id=% FOR UPDATE%'
                     AND (? = ANY(pg_blocking_pids(pid)) OR ? = ANY(pg_blocking_pids(pid)))""",
                { rs, _ -> rs.getInt("pid") }, excludePid, barrierPid, firstWriterPid,
            )
            if (pids.size == 1) return pids.single()
            Thread.sleep(20)
        }
        error("Order-lock writer did not reach the controlled PostgreSQL barrier")
    }

    private fun assertClosedFulfillmentRejection(response: org.springframework.http.ResponseEntity<String>) {
        assertEquals(400, response.statusCode.value(), response.body)
        val envelope = com.fasterxml.jackson.module.kotlin.jacksonObjectMapper().readTree(response.body!!)
        assertEquals(com.storecore.commerce.application.FulfillmentRejected().message, envelope.path("errorCode").asText())
    }

    private fun checkout(sku: String): Long {
        return checkoutWithQuantity(sku, 1)
    }

    private fun checkoutWithQuantity(sku: String, quantity: Int): Long {
        putProduct(sku, "Paid Item", available = 5)
        customer = addAddress(customer)
        val added = exchange("/api/v1/customer/cart/items", HttpMethod.PUT, """{"sku":"$sku","quantity":$quantity}""", customer.cookie, customer.csrf)
        assertEquals(200, added.statusCode.value(), added.body)
        customer = customer.copy(csrf = requireNotNull(added.headers.getFirst("X-CSRF-Token")) { "cart mutation must rotate CSRF" })
        val checkout = exchange("/api/v1/customer/checkout", HttpMethod.POST, """{"idempotencyKey":"${UUID.randomUUID()}","addressId":"${customer.addressId}","currency":"ARS"}""", customer.cookie, customer.csrf)
        assertEquals(200, checkout.statusCode.value(), checkout.body)
        customer = customer.copy(csrf = requireNotNull(checkout.headers.getFirst("X-CSRF-Token")) { "checkout must rotate CSRF" })
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
        val existing = jdbc.query(
            "SELECT id,external_reference,provider_order_id FROM mp_checkout_attempts WHERE order_id=? ORDER BY attempt_no DESC LIMIT 1",
            { rs, _ -> Triple(rs.getLong(1), rs.getString(2), rs.getString(3)) },
            orderId,
        ).firstOrNull()
        val reference = if (existing == null || existing.third.isNullOrBlank() || existing.third != providerOrderId) {
            Fakes.createResult.set(
                CreationObservation.VerifiedSuccess(providerOrderId, "https://www.mercadopago.com.ar/checkout/$providerOrderId"),
            )
            try {
                val attemptId = if (existing != null && existing.third.isNullOrBlank()) existing.first else attempts.prepare(orderId, UUID.randomUUID())
                val bound = attempts.postAndBind(attemptId)
                assertEquals("READY_FOR_REDIRECT", bound["state"], bound.toString())
                jdbc.queryForObject("SELECT external_reference FROM mp_checkout_attempts WHERE id=?", String::class.java, attemptId)!!
            } finally {
                Fakes.createResult.set(null)
            }
        } else {
            existing.second
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
        return Session(login.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'), login.headers.getFirst("X-CSRF-Token")!!)
    }

    private fun registerCustomer(email: String): Session {
        val registered = exchange("/api/v1/customer/auth/register", HttpMethod.POST, """{"email":"$email","password":"a-very-long-password","firstName":"Person","lastName":"One"}""")
        return Session(registered.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';'), registered.headers.getFirst("X-CSRF-Token")!!)
    }

    private fun addAddress(session: Session): Session {
        val customerId = jdbc.queryForObject("SELECT id FROM customers ORDER BY id DESC LIMIT 1", Long::class.java)!!
        val addressId = jdbc.query(
            "SELECT id FROM customer_addresses WHERE customer_id=? AND is_default=TRUE ORDER BY id LIMIT 1",
            { rs, _ -> rs.getLong("id") },
            customerId,
        ).firstOrNull() ?: jdbc.queryForObject(
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
