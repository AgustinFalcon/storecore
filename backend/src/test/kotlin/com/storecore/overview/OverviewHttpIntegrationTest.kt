package com.storecore.overview

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.MethodOrderer
import org.junit.jupiter.api.Order
import org.junit.jupiter.api.TestMethodOrder
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
import java.util.UUID

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = ["storecore.installation-guard.enabled=false"])
@TestMethodOrder(MethodOrderer.OrderAnnotation::class)
class OverviewHttpIntegrationTest(
    @Autowired private val http: TestRestTemplate,
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val passwords: Argon2PasswordHasher,
    @Autowired private val json: ObjectMapper,
    @LocalServerPort private val port: Int,
) {
    @Test
    @Order(1)
    fun `operator reads correlated authoritative facts and work queues without pii`() {
        installation()
        val operator = internalSession("overview-operator-${UUID.randomUUID()}@example.com", "OPERATOR")
        val customerId = customer("overview-customer-${UUID.randomUUID()}@example.com")
        val pendingId = order(customerId, "PENDING_PAYMENT", "50.00")
        val paidId = order(customerId, "PAID", "100.00")
        accredit(paidId, "100.00")
        jdbc.update("INSERT INTO shipments(order_id,status) VALUES (?,'PREPARING')", paidId)
        val oldPendingId = order(customerId, "PENDING_PAYMENT", "40.00")
        val oldPaidId = order(customerId, "PAID", "60.00")
        jdbc.update("UPDATE orders SET created_at=now()-interval '2 days' WHERE id IN (?,?)", oldPendingId, oldPaidId)
        accredit(oldPaidId, "60.00")
        val productId = jdbc.queryForObject("INSERT INTO products(name,slug,base_price,status) VALUES ('Taladro','overview-${UUID.randomUUID()}',100,'ACTIVE') RETURNING id", Long::class.java)!!
        val variantId = jdbc.queryForObject("INSERT INTO product_variants(product_id,sku,label) VALUES (?,?, 'Estándar') RETURNING id", Long::class.java, productId, "OV-${UUID.randomUUID()}")!!
        jdbc.update("INSERT INTO inventory_balances(variant_id,available_quantity,safety_stock) VALUES (?,2,5)", variantId)

        val response = exchange("/api/v1/user/overview?period=TODAY", operator)
        assertEquals(200, response.statusCode.value(), response.body)
        val body = response.body!!
        assertTrue(body.contains("\"period\":\"TODAY\"") && body.contains("\"timezone\":\"America/Argentina/Buenos_Aires\""))
        assertTrue(body.contains("\"accreditedRevenue\":{\"state\":\"KNOWN\",\"value\":100.00"), body)
        assertTrue(body.contains("\"orderCount\":{\"state\":\"KNOWN\",\"value\":2"), body)
        assertTrue(body.contains("\"orderId\":$pendingId") && body.contains("\"reason\":\"NO_PAYMENT\""), body)
        assertTrue(body.contains("\"orderId\":$oldPendingId"), "current queue must include work created before TODAY: $body")
        assertTrue(body.contains("\"orderId\":$paidId") && body.contains("\"shipmentState\":\"PREPARING\""), body)
        assertTrue(body.contains("\"orderId\":$oldPaidId") && body.contains("\"shipmentState\":\"MISSING\""), "current fulfillment must include work created before TODAY: $body")
        assertTrue(body.contains("\"variantId\":$variantId") && body.contains("\"availableQuantity\":2") && body.contains("\"safetyStock\":5"), body)
        assertFalse(body.contains("overview-customer") || body.contains("password", true) || body.contains("buyerSnapshot", true))
        assertAdditionalOrphanFailsClosed(paidId, operator)
        assertEquals(401, exchange("/api/v1/user/overview?period=TODAY", null).statusCode.value())
        assertEquals(400, exchange("/api/v1/user/overview?period=LAST_90_DAYS", operator).statusCode.value())
        jdbc.update("UPDATE installation_settings SET timezone='Not/A_Real_Zone' WHERE installation_id=1")
        try {
            assertEquals(503, exchange("/api/v1/user/overview?period=TODAY", operator).statusCode.value())
        } finally {
            jdbc.update("UPDATE installation_settings SET timezone='America/Argentina/Buenos_Aires' WHERE installation_id=1")
        }
    }

    @Test
    @Order(2)
    fun `contradictory paid evidence is unavailable rather than fabricated zero`() {
        installation()
        val admin = internalSession("overview-admin-${UUID.randomUUID()}@example.com", "ADMIN")
        val customerId = customer("overview-contradiction-${UUID.randomUUID()}@example.com")
        val orphanId = order(customerId, "PAID", "75.00")
        val orphanPayment = jdbc.queryForObject("INSERT INTO payments(order_id,external_reference,status,amount) VALUES (?,?, 'APPROVED',75.00) RETURNING id", Long::class.java, orphanId, "overview-payment-${UUID.randomUUID()}")!!
        var response = exchange("/api/v1/user/overview?period=TODAY", admin)
        assertEquals(200, response.statusCode.value(), response.body)
        assertTrue(response.body!!.contains("\"accreditedRevenue\":{\"state\":\"UNAVAILABLE\",\"value\":null,\"reason\":\"PAYMENT_FACTS_INCOMPLETE\"}"), response.body)
        assertTrue(response.body!!.contains("\"fulfillment\":{\"state\":\"UNAVAILABLE\",\"items\":[],\"totalCount\":null,\"truncated\":false,\"reason\":\"PAYMENT_FACTS_INCOMPLETE\"}"), response.body)

        durableAuthority(orphanId, orphanPayment, "75.00")
        val reversedId = order(customerId, "PAID", "80.00")
        val reversalAttempt = accredit(reversedId, "80.00")
        reversal(reversalAttempt, "RESOLVED")
        val rejectedId = order(customerId, "PAID", "30.00")
        val rejectedAttempt = accredit(rejectedId, "30.00")
        reversal(rejectedAttempt, "REJECTED")
        val refundedId = order(customerId, "PAID", "25.00")
        val refundedAttempt = accredit(refundedId, "25.00")
        jdbc.update("UPDATE payments SET status='REFUNDED' WHERE id=(SELECT payment_id FROM mp_checkout_attempts WHERE id=?)", refundedAttempt)
        response = exchange("/api/v1/user/overview?period=TODAY", admin)
        assertEquals(200, response.statusCode.value(), response.body)
        assertTrue(response.body!!.contains("\"accreditedRevenue\":{\"state\":\"KNOWN\",\"value\":205.00"), "resolved reversal must be excluded and rejected review retained: ${response.body}")
        assertFalse(response.body!!.contains("\"orderId\":$reversedId"), "reversed order must not enter fulfillment")
        assertFalse(response.body!!.contains("\"orderId\":$refundedId"), "refunded order must not enter fulfillment")
        assertTrue(response.body!!.contains("\"orderId\":$rejectedId"), "rejected reversal review must retain fulfillment")

        val reviewId = order(customerId, "PAID", "20.00")
        val reviewAttempt = accredit(reviewId, "20.00")
        val reviewCase = reversal(reviewAttempt, "UNDER_REVIEW")
        response = exchange("/api/v1/user/overview?period=TODAY", admin)
        assertTrue(response.body!!.contains("\"accreditedRevenue\":{\"state\":\"UNAVAILABLE\""), response.body)
        assertTrue(response.body!!.contains("\"fulfillment\":{\"state\":\"UNAVAILABLE\""), response.body)
        jdbc.update("UPDATE mp_order_incidents SET review_status='RESOLVED' WHERE order_id=?", orphanId)
        jdbc.update("UPDATE mp_order_reversal_cases SET review_status='REJECTED' WHERE id=?", reviewCase)
        response = exchange("/api/v1/user/overview?period=TODAY", admin)
        assertTrue(response.body!!.contains("\"accreditedRevenue\":{\"state\":\"KNOWN\",\"value\":225.00"), response.body)

        jdbc.update("INSERT INTO mp_order_incidents(order_id,kind,review_status,evidence_redacted) VALUES (?,'DUPLICATE_REMOTE_CREDIT','OPEN','{}')", orphanId)
        response = exchange("/api/v1/user/overview?period=TODAY", admin)
        assertTrue(response.body!!.contains("\"accreditedRevenue\":{\"state\":\"UNAVAILABLE\""), response.body)
        assertTrue(response.body!!.contains("\"fulfillment\":{\"state\":\"UNAVAILABLE\""), response.body)
    }

    @Test
    @Order(3)
    fun `work queues expose bounded deterministic slices and exact totals`() {
        installation()
        val operator = internalSession("overview-scale-${UUID.randomUUID()}@example.com", "OPERATOR")
        repeat(60) { index ->
            val productId = jdbc.queryForObject("INSERT INTO products(name,slug,base_price,status) VALUES (?,?,100,'ACTIVE') RETURNING id", Long::class.java, "Scale $index", "scale-${UUID.randomUUID()}")!!
            val variantId = jdbc.queryForObject("INSERT INTO product_variants(product_id,sku,label) VALUES (?,?, 'Scale') RETURNING id", Long::class.java, productId, "SCALE-${index.toString().padStart(3, '0')}-${UUID.randomUUID()}")!!
            jdbc.update("INSERT INTO inventory_balances(variant_id,available_quantity,safety_stock) VALUES (?,?,5)", variantId, index % 3)
        }
        val response = exchange("/api/v1/user/overview?period=TODAY", operator)
        assertEquals(200, response.statusCode.value(), response.body)
        val queue = json.readTree(response.body).path("data").path("lowStock")
        assertEquals("KNOWN", queue.path("state").asText())
        assertEquals(50, queue.path("items").size())
        assertTrue(queue.path("totalCount").asLong() >= 61)
        assertTrue(queue.path("truncated").asBoolean())
    }

    @Test
    @Order(4)
    fun `mismatched terminal and reversal evidence fail closed`() {
        installation()
        val admin = internalSession("overview-evidence-${UUID.randomUUID()}@example.com", "ADMIN")
        val customerId = customer("overview-evidence-customer-${UUID.randomUUID()}@example.com")
        jdbc.update("UPDATE mp_order_incidents SET review_status='RESOLVED' WHERE review_status IN ('OPEN','UNDER_REVIEW')")
        jdbc.update("UPDATE mp_order_reversal_cases SET review_status='REJECTED' WHERE review_status IN ('OPEN','UNDER_REVIEW')")
        var response = exchange("/api/v1/user/overview?period=TODAY", admin)
        assertTrue(response.body!!.contains("\"accreditedRevenue\":{\"state\":\"KNOWN\""), "baseline revenue must be known: ${response.body}")
        assertTrue(response.body!!.contains("\"fulfillment\":{\"state\":\"KNOWN\""), "baseline fulfillment must be known: ${response.body}")
        val reversalOrder = order(customerId, "PAID", "15.00")
        val reversalAttempt = accredit(reversalOrder, "15.00")
        val mismatchedReversal = jdbc.queryForObject(
            """INSERT INTO mp_order_reversal_cases(attempt_id,provider_order_id,provider_chargeback_id,kind,review_status,evidence_redacted)
               VALUES (?,?,?,'CHARGEBACK','RESOLVED','{}') RETURNING id""",
            Long::class.java, reversalAttempt, "wrong-provider-${UUID.randomUUID()}", "wrong-chargeback-${UUID.randomUUID()}",
        )!!
        response = exchange("/api/v1/user/overview?period=TODAY", admin)
        assertTrue(response.body!!.contains("\"accreditedRevenue\":{\"state\":\"UNAVAILABLE\""), response.body)
        assertTrue(response.body!!.contains("\"fulfillment\":{\"state\":\"UNAVAILABLE\""), response.body)
        jdbc.update("UPDATE mp_order_reversal_cases SET review_status='REJECTED' WHERE id=?", mismatchedReversal)
        response = exchange("/api/v1/user/overview?period=TODAY", admin)
        assertTrue(response.body!!.contains("\"accreditedRevenue\":{\"state\":\"KNOWN\""), "rejecting mismatched reversal must restore revenue: ${response.body}")
        assertTrue(response.body!!.contains("\"fulfillment\":{\"state\":\"KNOWN\""), "rejecting mismatched reversal must restore fulfillment: ${response.body}")

        val uncreditedOrder = order(customerId, "PAID", "12.00")
        val uncreditedPayment = jdbc.queryForObject(
            "INSERT INTO payments(order_id,external_reference,status,amount) VALUES (?,?,'CANCELLED',12.00) RETURNING id",
            Long::class.java, uncreditedOrder, "overview-uncredited-${UUID.randomUUID()}",
        )!!
        val uncreditedAttempt = attempt(uncreditedOrder, uncreditedPayment, "12.00")
        reversal(uncreditedAttempt.id, "RESOLVED")
        response = exchange("/api/v1/user/overview?period=TODAY", admin)
        assertTrue(response.body!!.contains("\"accreditedRevenue\":{\"state\":\"UNAVAILABLE\""), "a resolved reversal without a correlated credit cannot exclude contradictory authority: ${response.body}")
        assertTrue(response.body!!.contains("\"fulfillment\":{\"state\":\"UNAVAILABLE\""), response.body)
        application(uncreditedOrder, uncreditedAttempt, "12.00")
        response = exchange("/api/v1/user/overview?period=TODAY", admin)
        assertTrue(response.body!!.contains("\"accreditedRevenue\":{\"state\":\"KNOWN\""), response.body)
        assertTrue(response.body!!.contains("\"fulfillment\":{\"state\":\"KNOWN\""), response.body)
        assertFalse(response.body!!.contains("\"orderId\":$uncreditedOrder"), "a correlated cancelled credit must stay excluded")

        val targetOrder = order(customerId, "PAID", "10.00")
        val sourceOrder = order(customerId, "CANCELLED", "10.00")
        val sourcePayment = jdbc.queryForObject(
            "INSERT INTO payments(order_id,external_reference,status,amount) VALUES (?,?, 'REFUNDED',10.00) RETURNING id",
            Long::class.java, sourceOrder, "overview-payment-${UUID.randomUUID()}",
        )!!
        val crossedAttempt = attempt(sourceOrder, sourcePayment, "10.00")
        application(targetOrder, crossedAttempt, "10.00")
        response = exchange("/api/v1/user/overview?period=TODAY", admin)
        assertTrue(response.body!!.contains("\"accreditedRevenue\":{\"state\":\"UNAVAILABLE\",\"value\":null,\"reason\":\"PAYMENT_FACTS_INCOMPLETE\"}"), response.body)
        assertTrue(response.body!!.contains("\"fulfillment\":{\"state\":\"UNAVAILABLE\""), response.body)
    }

    private fun assertAdditionalOrphanFailsClosed(paidId: Long, operator: String) {
        val orphanPayment = jdbc.queryForObject(
            "INSERT INTO payments(order_id,external_reference,status,amount) VALUES (?,?,'PENDING',100.00) RETURNING id",
            Long::class.java, paidId, "overview-extra-payment-${UUID.randomUUID()}",
        )!!
        try {
            for (status in listOf("APPROVED", "REFUNDED", "CHARGED_BACK")) {
                jdbc.update("UPDATE payments SET status=? WHERE id=?", status, orphanPayment)
                val response = exchange("/api/v1/user/overview?period=TODAY", operator)
                assertEquals(200, response.statusCode.value(), response.body)
                val data = json.readTree(response.body).path("data")
                for (fact in listOf("accreditedRevenue", "fulfillment")) {
                    assertEquals("UNAVAILABLE", data.path(fact).path("state").asText(), "$status: ${response.body}")
                    assertEquals("PAYMENT_FACTS_INCOMPLETE", data.path(fact).path("reason").asText())
                }
                assertTrue(data.path("accreditedRevenue").path("value").isNull)
                assertEquals(0, data.path("fulfillment").path("items").size())
            }
        } finally {
            jdbc.update("DELETE FROM payments WHERE id=?", orphanPayment)
        }
        val restored = json.readTree(exchange("/api/v1/user/overview?period=TODAY", operator).body).path("data")
        assertEquals("KNOWN", restored.path("accreditedRevenue").path("state").asText())
        assertEquals(0, restored.path("accreditedRevenue").path("value").decimalValue().compareTo(java.math.BigDecimal("100.00")))
        assertEquals("KNOWN", restored.path("fulfillment").path("state").asText())
        assertEquals(2, restored.path("fulfillment").path("totalCount").asInt())
        assertEquals(1, restored.path("fulfillment").path("items").count { it.path("orderId").asLong() == paidId })
    }

    private fun customer(email: String): Long = jdbc.queryForObject(
        "INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Overview','Customer') RETURNING id",
        Long::class.java, email, passwords.hash("a-very-long-password".toCharArray()),
    )!!

    private fun installation() {
        jdbc.update(
            """INSERT INTO installation_settings(installation_id,business_name,allowed_host,timezone)
               VALUES (1,'Overview Test','localhost','America/Argentina/Buenos_Aires')
               ON CONFLICT (installation_id) DO UPDATE SET timezone=EXCLUDED.timezone""",
        )
    }

    private fun accredit(orderId: Long, total: String): Long {
        val paymentId = jdbc.queryForObject(
            "INSERT INTO payments(order_id,external_reference,status,amount) VALUES (?,?, 'APPROVED',?::numeric) RETURNING id",
            Long::class.java, orderId, "overview-payment-${UUID.randomUUID()}", total,
        )!!
        return durableAuthority(orderId, paymentId, total)
    }

    private fun durableAuthority(orderId: Long, paymentId: Long, total: String): Long {
        val attempt = attempt(orderId, paymentId, total)
        application(orderId, attempt, total)
        return attempt.id
    }

    private fun attempt(orderId: Long, paymentId: Long, total: String): AttemptFixture {
        val providerOrderId = "overview-provider-${UUID.randomUUID()}"
        val externalReference = "overview-${UUID.randomUUID()}"
        val attemptId = jdbc.queryForObject(
            """INSERT INTO mp_checkout_attempts(order_id,payment_id,attempt_no,external_reference,idempotency_key,request_hash,
               amount,currency,snapshot,provider_order_id,state)
               VALUES (?,?,1,?,?,?,?::numeric,'ARS','{}',?,'ACCREDITED') RETURNING id""",
            Long::class.java, orderId, paymentId, externalReference, UUID.randomUUID(),
            UUID.randomUUID().toString().replace("-", "").padEnd(64, '0'), total, providerOrderId,
        )!!
        return AttemptFixture(attemptId, providerOrderId)
    }

    private fun application(orderId: Long, attempt: AttemptFixture, total: String) {
        val inboxId = jdbc.queryForObject(
            """INSERT INTO mp_order_notification_inbox(raw_topic,query_data_id,provider_order_id_candidate,x_request_id,
               signature_version,signature_result,envelope_redacted,disposition)
               VALUES ('merchant_order',?,?,?,'v1','ACCEPTED','{}','PROCESSABLE') RETURNING id""",
            Long::class.java, attempt.providerOrderId, attempt.providerOrderId, "request-${UUID.randomUUID()}",
        )!!
        jdbc.update(
            """INSERT INTO mp_order_commercial_applications(inbox_id,attempt_id,order_id,provider_order_id,transition,confirmed_amount,confirmed_currency)
               VALUES (?,?,?,?,'PAYMENT_ACCREDITED',?::numeric,'ARS')""",
            inboxId, attempt.id, orderId, attempt.providerOrderId, total,
        )
    }

    private fun reversal(attemptId: Long, reviewStatus: String): Long {
        val provider = jdbc.queryForObject("SELECT provider_order_id FROM mp_checkout_attempts WHERE id=?", String::class.java, attemptId)!!
        return jdbc.queryForObject(
            """INSERT INTO mp_order_reversal_cases(attempt_id,provider_order_id,provider_chargeback_id,kind,review_status,evidence_redacted)
               VALUES (?,?,?,'CHARGEBACK',?,'{}') RETURNING id""",
            Long::class.java, attemptId, provider, "chargeback-$attemptId", reviewStatus,
        )!!
    }

    private fun order(customerId: Long, status: String, total: String): Long {
        val key = UUID.randomUUID()
        val hash = UUID.randomUUID().toString().replace("-", "").padEnd(64, '0')
        val claim = jdbc.queryForObject(
            "INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot) VALUES (?,?,?,'{}') RETURNING id",
            Long::class.java, customerId, key, hash,
        )!!
        return jdbc.queryForObject(
            """INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,status,
               buyer_snapshot,checkout_snapshot,subtotal,shipping_cost,total)
               VALUES (?,?,?,?,?,?,'{}','{}',?::numeric,0,?::numeric) RETURNING id""",
            Long::class.java, "OV-${UUID.randomUUID()}", claim, key, hash, customerId, status, total, total,
        )!!
    }

    private fun internalSession(email: String, role: String): String {
        val userId = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Internal','User') RETURNING id", Long::class.java, email, passwords.hash("a-very-long-password".toCharArray()))!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?,id FROM roles WHERE code=?", userId, role)
        val response = http.exchange(
            URI("http://localhost:$port/api/v1/internal/auth/login"), HttpMethod.POST,
            HttpEntity("""{"email":"$email","password":"a-very-long-password"}""", headers()), String::class.java,
        )
        return response.headers.getFirst(HttpHeaders.SET_COOKIE)!!.substringBefore(';')
    }

    private fun exchange(path: String, cookie: String?) = http.exchange(
        URI("http://localhost:$port$path"), HttpMethod.GET,
        HttpEntity<String>(null, headers().apply { cookie?.let { set(HttpHeaders.COOKIE, it) } }), String::class.java,
    )

    private fun headers() = HttpHeaders().apply {
        contentType = MediaType.APPLICATION_JSON
        set(HttpHeaders.ORIGIN, "http://localhost:4200")
    }

    private data class AttemptFixture(val id: Long, val providerOrderId: String)

    companion object {
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")
        @JvmStatic @DynamicPropertySource fun database(registry: DynamicPropertyRegistry) {
            postgres.start()
            registry.add("spring.datasource.url") { postgres.jdbcUrl }
            registry.add("spring.datasource.username") { postgres.username }
            registry.add("spring.datasource.password") { postgres.password }
        }
    }
}
