package com.storecore.commerce

import com.storecore.commerce.infrastructure.InboxApplicationWorker
import com.storecore.commerce.infrastructure.JdbcInventoryService
import com.storecore.configuration.domain.CapabilityState
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
    @Autowired private val mapper: com.fasterxml.jackson.databind.ObjectMapper,
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
        val beforeHome = exchange("/api/v1/user/content/home", HttpMethod.GET, null, admin.cookie)
        val revision = mapper.readTree(beforeHome.body!!).path("data").path("revision").asLong()
        val saved = exchange("/api/v1/user/content/home", HttpMethod.PUT, """{"expectedRevision":$revision,"sections":[{"key":"hero","kind":"HERO","active":true,"sortOrder":0,"content":{"title":"Vitrina","body":"Hero body"}}]}""", admin.cookie, admin.csrf)
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
    fun `manual policy approval and lifecycle are server owned and overlap is atomic`() {
        val sku = "SKU-PROMO-${UUID.randomUUID()}"
        putProduct(sku, "Promo Item", available = 5, safety = 0)
        val from = Instant.now().plusSeconds(60).truncatedTo(ChronoUnit.SECONDS)
        val to = from.plus(2, ChronoUnit.DAYS)
        val promo = """{"listingSku":"$sku","currency":"ARS","priceScope":"CAMPAIGN","desiredPrice":90,"effectivePromoPrice":80,"validFrom":"$from","validTo":"$to","writer":"MANUAL"}"""
        val before = jdbc.queryForObject("SELECT count(*) FROM channel_price_policies", Long::class.java)
        for (extra in listOf("\"priority\":10", "\"margin\":15", "\"approvedBy\":\"1\"", "\"approvedAt\":\"$from\"", "\"status\":\"ACTIVE\"")) {
            assertEquals(400, exchange("/api/v1/user/promos", HttpMethod.POST, promo.dropLast(1) + "," + extra + "}", admin.cookie, admin.csrf).statusCode.value())
        }
        assertEquals(before, jdbc.queryForObject("SELECT count(*) FROM channel_price_policies", Long::class.java))
        assertEquals(403, exchange("/api/v1/user/promos", HttpMethod.POST, promo, admin.cookie).statusCode.value())
        assertEquals(401, exchange("/api/v1/user/promos", HttpMethod.POST, promo, customer.cookie, customer.csrf).statusCode.value())
        val created = exchange("/api/v1/user/promos", HttpMethod.POST, promo, admin.cookie, admin.csrf)
        assertEquals(200, created.statusCode.value(), created.body)
        val draft = mapper.readTree(created.body).path("data")
        assertEquals("DRAFT", draft.path("status").asText())
        assertTrue(draft.path("approvedBy").isNull && draft.path("approvedAt").isNull)
        assertTrue(!draft.has("priority") && !draft.has("margin"))
        val id = draft.path("id").asLong()
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM offers WHERE name=?", Int::class.java, "manual-$sku"))
        admin = admin.copy(csrf = created.headers.getFirst("X-CSRF-Token")!!)
        val active = exchange("/api/v1/user/promos/$id/state", HttpMethod.POST, """{"transition":"ACTIVATE"}""", admin.cookie, admin.csrf)
        assertEquals(200, active.statusCode.value(), active.body)
        val approved = mapper.readTree(active.body).path("data")
        assertEquals(adminUserId().toString(), approved.path("approvedBy").asText())
        assertTrue(Instant.parse(approved.path("approvedAt").asText()).isBefore(Instant.now().plusSeconds(1)))
        admin = admin.copy(csrf = active.headers.getFirst("X-CSRF-Token")!!)
        val other = exchange("/api/v1/user/promos", HttpMethod.POST, promo, admin.cookie, admin.csrf)
        val otherId = mapper.readTree(other.body).path("data").path("id").asLong()
        admin = admin.copy(csrf = other.headers.getFirst("X-CSRF-Token")!!)
        val overlap = exchange("/api/v1/user/promos/$otherId/state", HttpMethod.POST, """{"transition":"ACTIVATE"}""", admin.cookie, admin.csrf)
        assertEquals(409, overlap.statusCode.value())
        assertTrue(overlap.body!!.contains("PROMO_WINDOW_OVERLAP"))
        assertEquals("DRAFT", jdbc.queryForObject("SELECT status FROM channel_price_policies WHERE id=?", String::class.java, otherId))
        assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE aggregate_type='channel_price_policies' AND aggregate_id=? AND event_type='PRICE_POLICY_ACTIVE'", Int::class.java, otherId))
        for (command in listOf("PAUSE", "ACTIVATE", "END")) {
            val response = exchange("/api/v1/user/promos/$id/state", HttpMethod.POST, """{"transition":"$command"}""", admin.cookie, admin.csrf)
            assertEquals(200, response.statusCode.value(), response.body)
            admin = admin.copy(csrf = response.headers.getFirst("X-CSRF-Token")!!)
        }
        assertEquals(400, exchange("/api/v1/user/promos/$id/state", HttpMethod.POST, """{"transition":"ACTIVATE"}""", admin.cookie, admin.csrf).statusCode.value())
        val listed = exchange("/api/v1/user/promos?size=50", HttpMethod.GET, null, admin.cookie)
        assertEquals(200, listed.statusCode.value(), listed.body)
        assertTrue(mapper.readTree(listed.body).path("data").path("items").isArray)
        assertEquals(400, exchange("/api/v1/user/promos?size=51", HttpMethod.GET, null, admin.cookie).statusCode.value())
    }

    @Test
    fun `concurrent manual activations serialize one effective authority and roll back the loser`() {
        val sku = "SKU-PRICE-RACE-${UUID.randomUUID()}"
        putProduct(sku, "Concurrent policy")
        val from = Instant.now().plusSeconds(60).truncatedTo(ChronoUnit.SECONDS)
        val to = from.plusSeconds(3600)
        val body = """{"listingSku":"$sku","currency":"ARS","priceScope":"DEFAULT","desiredPrice":90,"validFrom":"$from","validTo":"$to"}"""
        val ids = (1..2).map {
            val response = exchange("/api/v1/user/promos", HttpMethod.POST, body, admin.cookie, admin.csrf)
            assertEquals(200, response.statusCode.value(), response.body)
            admin = admin.copy(csrf = response.headers.getFirst("X-CSRF-Token")!!)
            mapper.readTree(response.body).path("data").path("id").asLong()
        }
        val competitor = provisionAdmin("admin-race-${UUID.randomUUID()}@example.com")
        val sessions = listOf(admin, competitor)
        val ready = java.util.concurrent.CountDownLatch(2)
        val start = java.util.concurrent.CountDownLatch(1)
        val executor = java.util.concurrent.Executors.newFixedThreadPool(2)
        val responses = try {
            val futures = ids.zip(sessions).map { (id, session) ->
                executor.submit<org.springframework.http.ResponseEntity<String>> {
                    ready.countDown()
                    check(start.await(10, java.util.concurrent.TimeUnit.SECONDS))
                    exchange("/api/v1/user/promos/$id/state", HttpMethod.POST, """{"transition":"ACTIVATE"}""", session.cookie, session.csrf)
                }
            }
            assertTrue(ready.await(10, java.util.concurrent.TimeUnit.SECONDS))
            start.countDown()
            futures.map { it.get(30, java.util.concurrent.TimeUnit.SECONDS) }
        } finally {
            start.countDown()
            executor.shutdownNow()
        }
        assertEquals(listOf(200, 409), responses.map { it.statusCode.value() }.sorted(), responses.map { it.body }.toString())
        val winner = responses.indexOfFirst { it.statusCode.value() == 200 }
        val loser = 1 - winner
        assertTrue(responses[loser].body!!.contains("PROMO_WINDOW_OVERLAP"))
        assertTrue(responses[loser].headers.getFirst("X-CSRF-Token") == null)
        assertNotNull(responses[winner].headers.getFirst("X-CSRF-Token"))
        assertEquals("ACTIVE", jdbc.queryForObject("SELECT status FROM channel_price_policies WHERE id=?", String::class.java, ids[winner]))
        assertEquals("DRAFT", jdbc.queryForObject("SELECT status FROM channel_price_policies WHERE id=?", String::class.java, ids[loser]))
        assertTrue(jdbc.queryForMap("SELECT approved_by,approved_at FROM channel_price_policies WHERE id=?", ids[loser]).values.all { it == null })
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM channel_price_policies WHERE id IN (?,?) AND status='ACTIVE'", Int::class.java, ids[0], ids[1]))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE aggregate_type='channel_price_policies' AND aggregate_id IN (?,?) AND event_type='PRICE_POLICY_ACTIVE'", Int::class.java, ids[0], ids[1]))
        // A failed transaction preserves the losing session's CSRF token.
        val retry = exchange("/api/v1/user/promos/${ids[loser]}/state", HttpMethod.POST, """{"transition":"ACTIVATE"}""", sessions[loser].cookie, sessions[loser].csrf)
        assertEquals(409, retry.statusCode.value(), retry.body)
    }

    @Test
    fun `ml local mapping enforces admin capability same origin csrf and atomic audit`() {
        val sku = "SKU-MAPPING-${UUID.randomUUID()}"
        putProduct(sku, "Local mapping")
        val accountKey = "mapping-${UUID.randomUUID()}"
        jdbc.update("INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state) VALUES (?,'MERCADO_LIBRE','ref:local-only','ACTIVE')", accountKey)
        try {
        val listingId = "mapping-${UUID.randomUUID()}"
        val path = "/api/v1/user/mercadolibre/listings/$listingId"
        val body = """{"sku":"$sku","variationId":"v"}"""
        val operator = provisionAdmin("operator-${UUID.randomUUID()}@example.com", "OPERATOR")
        val outboxBefore = jdbc.queryForObject("SELECT count(*) FROM channel_outbox", Long::class.java)
        assertEquals(401, exchange(path, HttpMethod.PUT, body, customer.cookie, customer.csrf).statusCode.value())
        assertEquals(403, exchange(path, HttpMethod.PUT, body, operator.cookie, operator.csrf).statusCode.value())
        assertEquals(403, exchange("/api/v1/user/mercadolibre/account", HttpMethod.GET, null, operator.cookie).statusCode.value())
        assertEquals(403, exchange("/api/v1/user/mercadolibre/listings", HttpMethod.GET, null, operator.cookie).statusCode.value())
        assertEquals(403, exchange(path, HttpMethod.PUT, body, admin.cookie).statusCode.value())
        assertEquals(403, exchange(path, HttpMethod.PUT, body, admin.cookie, "invalid").statusCode.value())
        assertEquals(403, exchange(path, HttpMethod.PUT, body, admin.cookie, admin.csrf, "https://foreign.invalid").statusCode.value())
        val actorId = jdbc.queryForObject("SELECT id FROM users WHERE email LIKE 'admin-%' ORDER BY id DESC LIMIT 1", Long::class.java)!!
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MARKETPLACE_ML'", Int::class.java)
        jdbc.query("SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)", { _, _ -> }, actorId, adminSessionId(actorId), "MARKETPLACE_ML", version, "PAUSED", "{}", UUID.randomUUID(), "test")
        try {
            val denied = exchange(path, HttpMethod.PUT, body, admin.cookie, admin.csrf)
            assertEquals(409, denied.statusCode.value(), denied.body)
            assertTrue(denied.body!!.contains("CAPABILITY_PAUSED"))
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM channel_listings WHERE external_listing_id=?", Int::class.java, listingId))
            assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='ML_LOCAL_MAPPING_SAVED' AND payload_redacted->>'reference'=?", Int::class.java, listingId))
        } finally { activate("MARKETPLACE_ML") }
        val staleCsrf = admin.csrf
        val saved = exchange(path, HttpMethod.PUT, body, admin.cookie, admin.csrf)
        assertEquals(200, saved.statusCode.value(), saved.body)
        admin = admin.copy(csrf = saved.headers.getFirst("X-CSRF-Token")!!)
        assertEquals("UNAVAILABLE", mapper.readTree(saved.body).path("data").path("observedQuantity").path("state").asText())
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM channel_listings WHERE external_listing_id=?", Int::class.java, listingId))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM audit_events WHERE event_type='ML_LOCAL_MAPPING_SAVED' AND payload_redacted->>'reference'=?", Int::class.java, listingId))
        assertEquals(403, exchange(path, HttpMethod.PUT, body, admin.cookie, staleCsrf).statusCode.value())
        assertEquals(outboxBefore, jdbc.queryForObject("SELECT count(*) FROM channel_outbox", Long::class.java))
        } finally {
            jdbc.update("UPDATE channel_accounts SET state='PAUSED' WHERE account_key=?", accountKey)
        }
    }

    @Test
    fun `expired policy cannot activate and invalid monetary scope inputs do not persist`() {
        val sku = "SKU-EXPIRED-${UUID.randomUUID()}"
        putProduct(sku, "Expired policy")
        val from = Instant.now().minusSeconds(120)
        val to = from.plusSeconds(60)
        val body = """{"listingSku":"$sku","currency":"ARS","desiredPrice":90,"validFrom":"$from","validTo":"$to"}"""
        val created = exchange("/api/v1/user/promos", HttpMethod.POST, body, admin.cookie, admin.csrf)
        assertEquals(200, created.statusCode.value(), created.body)
        admin = admin.copy(csrf = created.headers.getFirst("X-CSRF-Token")!!)
        val id = mapper.readTree(created.body).path("data").path("id").asLong()
        val rejected = exchange("/api/v1/user/promos/$id/state", HttpMethod.POST, """{"transition":"ACTIVATE"}""", admin.cookie, admin.csrf)
        assertEquals(400, rejected.statusCode.value())
        assertTrue(jdbc.queryForMap("SELECT approved_by,approved_at FROM channel_price_policies WHERE id=?", id).values.all { it == null })
        for (invalid in listOf(body.replace("\"ARS\"", "\"USD\""), body.replace("\"desiredPrice\":90", "\"desiredPrice\":-1"),
            body.replace("\"desiredPrice\":90", "\"desiredPrice\":1.123"), body.dropLast(1) + ",\"priceScope\":\"FUTURE\"}",
            body.dropLast(1) + ",\"effectivePromoPrice\":100}")) {
            assertEquals(400, exchange("/api/v1/user/promos", HttpMethod.POST, invalid, admin.cookie, admin.csrf).statusCode.value())
        }
    }

    @Test
    fun `channel projections distinguish historical observations from missing external evidence`() {
        val sku = "SKU-CHANNEL-${UUID.randomUUID()}"
        putProduct(sku, "Channel item")
        val account = jdbc.queryForObject("INSERT INTO channel_accounts(account_key,channel,oauth_secret_reference,state) VALUES (?,'MERCADO_LIBRE','ref:must-never-leak','PAUSED') RETURNING id", Long::class.java, "channel-${UUID.randomUUID()}")!!
        val variant = jdbc.queryForObject("SELECT id FROM product_variants WHERE sku=?", Long::class.java, sku)!!
        val listing = jdbc.queryForObject("""INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,desired_quantity,observed_quantity,manual_intervention_required,state,updated_at)
            VALUES (?,'historical','v',?,9,3,true,'ERROR',now()-interval '30 days') RETURNING id""", Long::class.java, account, variant)!!
        jdbc.update("""INSERT INTO channel_price_policies(listing_id,base_price,desired_price,observed_price,effective_from,effective_to) VALUES (?,100,90,85,now(),now()+interval '1 day')""", listing)
        jdbc.update("INSERT INTO channel_listings(account_id,external_listing_id,variation_id,variant_id,state) VALUES (?,'missing','v',?,'DISABLED')", account, variant)
        // Page through stable bounded reads; pre-existing data from other tests cannot conceal these rows.
        val all = mutableListOf<com.fasterxml.jackson.databind.JsonNode>()
        var page = 0
        do {
            val response = exchange("/api/v1/user/mercadolibre/listings?page=$page&size=50", HttpMethod.GET, null, admin.cookie)
            assertEquals(200, response.statusCode.value(), response.body)
            val data = mapper.readTree(response.body).path("data")
            all.addAll(data.path("items").toList())
            page++
        } while (all.size < data.path("total").asInt())
        val historical = all.first { it.path("sku").asText() == sku && it.path("listingId").asText() == "historical" }
        assertEquals("ERROR", historical.path("status").asText())
        assertEquals(9, historical.path("desiredQuantity").asInt())
        assertEquals(3, historical.path("observedQuantity").path("value").asInt())
        assertEquals("UNVERIFIED", historical.path("observedQuantity").path("freshness").asText())
        assertEquals(90, historical.path("desiredPrice").asInt())
        assertEquals(85, historical.path("observedPrice").path("value").asInt())
        assertEquals("UNVERIFIED", historical.path("observedPrice").path("freshness").asText())
        assertTrue(historical.path("manualInterventionRequired").asBoolean())
        assertTrue(!historical.has("observedAt") && !historical.path("observedPrice").has("observedAt"))
        val missing = all.first { it.path("sku").asText() == sku && it.path("listingId").asText() == "missing" }
        assertTrue(missing.path("observedQuantity").path("value").isNull)
        assertEquals("UNAVAILABLE", missing.path("observedPrice").path("state").asText())
        assertEquals("EXTERNAL_NOT_AVAILABLE", missing.path("observedPrice").path("reason").asText())
        assertEquals(400, exchange("/api/v1/user/mercadolibre/listings?size=51", HttpMethod.GET, null, admin.cookie).statusCode.value())
        val accountResponse = exchange("/api/v1/user/mercadolibre/account", HttpMethod.GET, null, admin.cookie)
        assertEquals(200, accountResponse.statusCode.value(), accountResponse.body)
        assertTrue(!accountResponse.body!!.contains("authorized") && !accountResponse.body!!.contains("secret"))
    }

    @Test
    fun `local offers require admin csrf and expose only committed transitions`() {
        val sku = "SKU-OFFER-${UUID.randomUUID()}"
        putProduct(sku, "Offer Item")
        val startsAt = Instant.now().plusSeconds(60).truncatedTo(ChronoUnit.SECONDS)
        val endsAt = startsAt.plus(2, ChronoUnit.DAYS)
        val body = """{"name":"Oferta web","priority":7,"startsAt":"$startsAt","endsAt":"$endsAt","discountKind":"PERCENT","discountValue":12.5,"minMarginPercent":0,"skus":["$sku"]}"""
        val before = jdbc.queryForObject("SELECT count(*) FROM offers", Int::class.java)
        val noCsrf = exchange("/api/v1/user/offers", HttpMethod.POST, body, admin.cookie)
        assertEquals(403, noCsrf.statusCode.value())
        val customerDenied = exchange("/api/v1/user/offers", HttpMethod.POST, body, customer.cookie, customer.csrf)
        assertEquals(401, customerDenied.statusCode.value())
        assertEquals(before, jdbc.queryForObject("SELECT count(*) FROM offers", Int::class.java))

        val created = exchange("/api/v1/user/offers", HttpMethod.POST, body, admin.cookie, admin.csrf)
        assertEquals(201, created.statusCode.value(), created.body)
        assertTrue(created.body!!.contains("\"status\":\"DRAFT\"") && created.body!!.contains(sku))
        admin = admin.copy(csrf = created.headers.getFirst("X-CSRF-Token")!!)
        val id = mapper.readTree(created.body!!).path("data").path("id").asLong()
        val active = exchange("/api/v1/user/offers/$id/state", HttpMethod.POST, """{"transition":"ACTIVATE"}""", admin.cookie, admin.csrf)
        assertEquals(200, active.statusCode.value(), active.body)
        assertTrue(active.body!!.contains("\"status\":\"ACTIVE\""))
        admin = admin.copy(csrf = active.headers.getFirst("X-CSRF-Token")!!)
        val listed = exchange("/api/v1/user/offers", HttpMethod.GET, null, admin.cookie)
        assertEquals(200, listed.statusCode.value())
        assertTrue(listed.headers.cacheControl.contains("no-store"))
        assertTrue(listed.body!!.contains("Oferta web") && listed.body!!.contains("\"approvedAt\":"))
    }

    @Test
    fun `checkout without official accreditation rejects every fulfillment command without effects`() {
        val sku = "SKU-UNPAID-${UUID.randomUUID()}"
        putProduct(sku, "Unpaid item", available = 5, safety = 0)
        customer = addAddress(customer)
        val added = exchange("/api/v1/customer/cart/items", HttpMethod.PUT, """{"sku":"$sku","quantity":1}""", customer.cookie, customer.csrf)
        customer = customer.copy(csrf = added.headers.getFirst("X-CSRF-Token")!!)
        val checkout = exchange("/api/v1/customer/checkout", HttpMethod.POST, """{"idempotencyKey":"${UUID.randomUUID()}","addressId":"${customer.addressId}","currency":"ARS"}""", customer.cookie, customer.csrf)
        assertEquals(200, checkout.statusCode.value(), checkout.body)
        val receipt = mapper.readTree(checkout.body!!).path("data")
        val orderId = receipt.path("orderId").asText().toLong()
        assertTrue(orderId > 0)
        assertEquals(com.storecore.commerce.domain.OrderStatus.PENDING_PAYMENT.name, receipt.path("orderStatus").asText())
        assertEquals(com.storecore.commerce.domain.PaymentStatus.PENDING.name, receipt.path("paymentStatus").asText())
        val before = jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId)
        val ledgerBefore = jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE variant_id=(SELECT id FROM product_variants WHERE sku=?)", Int::class.java, sku)
        for ((route, commands) in listOf("shipments" to listOf("PACKED", "SHIPPED", "DELIVERED"), "rma" to listOf("RECEIVED", "INSPECTED", "ADJUSTED"))) {
            for (command in commands) {
                val denied = exchange("/api/v1/user/orders/$orderId/$route", HttpMethod.POST, """{"status":"$command"}""", admin.cookie, admin.csrf)
                assertEquals(400, denied.statusCode.value(), denied.body)
                assertTrue(denied.body!!.contains("FULFILLMENT_TRANSITION_REJECTED"))
                val customerDenied = exchange("/api/v1/user/orders/$orderId/$route", HttpMethod.POST, """{"status":"$command"}""", customer.cookie, customer.csrf)
                assertEquals(401, customerDenied.statusCode.value(), customerDenied.body)
                assertEquals(before, jdbc.queryForList("SELECT * FROM shipments WHERE order_id=?", orderId))
                assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM returns WHERE order_id=?", Int::class.java, orderId))
                assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM fulfillment_events e JOIN shipments s ON s.id=e.shipment_id WHERE s.order_id=?", Int::class.java, orderId))
                assertEquals(ledgerBefore, jdbc.queryForObject("SELECT COUNT(*) FROM inventory_ledger WHERE variant_id=(SELECT id FROM product_variants WHERE sku=?)", Int::class.java, sku))
            }
        }
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

    @Test
    fun `favorite capability revocation while csrf verification waits prevents writes and rotation`() {
        val sku = "SKU-FAVORITE-RACE-${UUID.randomUUID()}"
        putProduct(sku, "Favorite race item")
        val email = "favorite-race-${UUID.randomUUID()}@example.com"
        var owner = registerCustomer(email)
        val ownerId = jdbc.queryForObject("SELECT id FROM customers WHERE email=?", Long::class.java, email)!!
        val sessionId = jdbc.queryForObject("SELECT id FROM identity_sessions WHERE customer_id=? AND revoked_at IS NULL", UUID::class.java, ownerId)!!
        val executor = java.util.concurrent.Executors.newSingleThreadExecutor()
        try {
            for (state in listOf(CapabilityState.DISABLED, CapabilityState.PAUSED)) {
                for (method in listOf(HttpMethod.PUT, HttpMethod.DELETE)) {
                    activate("FAVORITES")
                    jdbc.update("DELETE FROM customer_favorites WHERE customer_id=?", ownerId)
                    if (method == HttpMethod.DELETE) {
                        jdbc.update("INSERT INTO customer_favorites(customer_id,variant_id) SELECT ?,id FROM product_variants WHERE sku=?", ownerId, sku)
                    }
                    val beforeFavorites = jdbc.queryForList("SELECT * FROM customer_favorites WHERE customer_id=?", ownerId)
                    val beforeTokens = jdbc.queryForList("SELECT * FROM identity_session_csrf_tokens WHERE session_id=? ORDER BY id", sessionId)
                    jdbc.dataSource!!.connection.use { blocker ->
                        blocker.autoCommit = false
                        val blockerPid = blocker.createStatement().use { statement ->
                            statement.executeQuery("SELECT pg_backend_pid()").use { result -> result.next(); result.getInt(1) }
                        }
                        // Block only CSRF verification, allowing authentication and the old pre-transaction decision to finish.
                        blocker.prepareStatement("SELECT id FROM identity_session_csrf_tokens WHERE session_id=? AND retired_at IS NULL FOR UPDATE").use {
                            it.setObject(1, sessionId)
                            it.executeQuery().close()
                        }
                        val pending = executor.submit<org.springframework.http.ResponseEntity<String>> {
                            exchange("/api/v1/customer/favorites/$sku", method, null, owner.cookie, owner.csrf)
                        }
                        val deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(10)
                        var waiting = false
                        while (!waiting && System.nanoTime() < deadline) {
                            waiting = jdbc.queryForObject(
                                "SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE ?=ANY(pg_blocking_pids(pid)) AND query LIKE '%identity_session_csrf_tokens%')",
                                Boolean::class.java, blockerPid,
                            ) == true
                            if (!waiting) Thread.sleep(20)
                        }
                        assertTrue(waiting, "favorite request must reach the CSRF row lock before capability revocation")
                        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='FAVORITES'", Int::class.java)
                        val actorId = adminUserId()
                        jdbc.query("SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)", { _, _ -> }, actorId, adminSessionId(actorId), "FAVORITES", version, state.wire, "{}", UUID.randomUUID(), "test revoke while CSRF waits")
                        blocker.commit()
                        val denied = pending.get(10, java.util.concurrent.TimeUnit.SECONDS)
                        assertEquals(409, denied.statusCode.value(), denied.body)
                        assertTrue(denied.body!!.contains("CAPABILITY_${state.wire}"), denied.body)
                        assertEquals(null, denied.headers.getFirst("X-CSRF-Token"))
                    }
                    assertEquals(beforeFavorites, jdbc.queryForList("SELECT * FROM customer_favorites WHERE customer_id=?", ownerId))
                    assertEquals(beforeTokens, jdbc.queryForList("SELECT * FROM identity_session_csrf_tokens WHERE session_id=? ORDER BY id", sessionId))
                    activate("FAVORITES")
                    // The same token is still usable after rollback, and only a successful mutation rotates it.
                    val recovered = exchange("/api/v1/customer/favorites/$sku", method, null, owner.cookie, owner.csrf)
                    assertEquals(200, recovered.statusCode.value(), recovered.body)
                    assertNotNull(recovered.headers.getFirst("X-CSRF-Token"))
                    owner = owner.copy(csrf = recovered.headers.getFirst("X-CSRF-Token")!!)
                }
            }
        } finally {
            executor.shutdownNow()
            activate("FAVORITES")
        }
    }

    @Test
    fun `order projections are scoped paged correlated and keep post sale information safe`() {
        val email = "projection-${UUID.randomUUID()}@example.com"
        val owner = registerCustomer(email)
        val ownerId = jdbc.queryForObject("SELECT id FROM customers WHERE email=?", Long::class.java, email)!!
        val ids = (1..3).map { projectionOrder(ownerId) }
        for ((path, session) in listOf(
            "/api/v1/customer/orders" to owner,
            "/api/v1/customer/orders/${ids.first()}" to owner,
            "/api/v1/user/orders" to admin,
            "/api/v1/user/orders/${ids.first()}" to admin,
        )) {
            val response = exchange(path, HttpMethod.GET, null, session.cookie)
            assertEquals(200, response.statusCode.value(), response.body)
            assertEquals("no-store", response.headers.cacheControl, path)
        }
        jdbc.update("UPDATE orders SET created_at='2026-01-01T00:00:00Z' WHERE customer_id=?", ownerId)
        fun read(path: String, session: Session = owner) = exchange(path, HttpMethod.GET, null, session.cookie)
        val page = mapper.readTree(read("/api/v1/customer/orders?size=2").body!!).path("data")
        assertEquals(3, page.path("total").asInt())
        assertEquals(true, page.path("truncated").asBoolean())
        assertEquals(ids.reversed().take(2).map { it.toString() }, page.path("items").map { it.path("id").asText() })
        val second = mapper.readTree(read("/api/v1/customer/orders?size=2&page=1").body!!).path("data")
        assertEquals(ids.first().toString(), second.path("items").first().path("id").asText())
        assertEquals(true, second.path("truncated").asBoolean())
        assertEquals(401, read("/api/v1/customer/orders", admin).statusCode.value())
        assertEquals(401, read("/api/v1/user/orders", owner).statusCode.value())
        assertEquals(404, read("/api/v1/customer/orders/${ids.first()}", customer).statusCode.value())
        for (query in listOf("size=51", "size=0", "page=-1", "orderStatus=madeup", "paymentStatus=madeup", "shipmentStatus=madeup")) {
            assertEquals(400, read("/api/v1/customer/orders?$query").statusCode.value(), query)
        }
        val id = ids.first()
        jdbc.update("UPDATE orders SET status='PAID' WHERE id=?", id)
        val paymentId = jdbc.queryForObject("INSERT INTO payments(order_id,external_reference,status,amount) VALUES (?,?,'APPROVED',100) RETURNING id", Long::class.java, id, UUID.randomUUID().toString())!!
        fun detail() = mapper.readTree(read("/api/v1/customer/orders/$id").body!!).path("data")
        assertEquals("UNAVAILABLE", detail().path("payment").path("state").asText())
        assertEquals("UNKNOWN", detail().path("orderStatus").asText())
        assertEquals("PAYMENT_NOT_VERIFIED", detail().path("fulfillmentEligibility").asText())
        val orphanPaidFilter = mapper.readTree(read("/api/v1/customer/orders?orderStatus=PAID").body!!).path("data")
        assertEquals(0, orphanPaidFilter.path("total").asInt(), "an orphan payment cannot match paid projections")
        assertEquals("PAYMENT_UNVERIFIED", detail().path("returnEligibility").asText())
        val attempt = projectionAccredit(id, paymentId)
        assertEquals("APPROVED", detail().path("payment").path("value").asText())
        val paidFilter = mapper.readTree(read("/api/v1/customer/orders?orderStatus=PAID").body!!).path("data")
        assertEquals(1, paidFilter.path("total").asInt())
        assertEquals("NOT_DELIVERED", detail().path("returnEligibility").asText())
        jdbc.update("INSERT INTO shipments(order_id,status,shipped_at,delivered_at) VALUES (?,'DELIVERED',now(),now())", id)
        assertEquals("ELIGIBLE", detail().path("returnEligibility").asText())
        jdbc.update("INSERT INTO fulfillment_events(shipment_id,event_type,actor,details) SELECT id,'DELIVERED','PRIVATE_ACTOR','{\"secret\":\"private-audit\"}'::jsonb FROM shipments WHERE order_id=?", id)
        val safe = detail()
        assertEquals("UNAVAILABLE", safe.path("buyerName").path("state").asText())
        assertEquals("KNOWN", safe.path("delivery").path("state").asText())
        assertTrue(!safe.toString().contains("PRIVATE_ACTOR") && !safe.toString().contains("private-audit"))
        val kinds = safe.path("timeline").path("value").map { it.path("kind").asText() }
        assertTrue(kinds.contains("PAYMENT_ACCREDITED") && kinds.contains("SHIPMENT_DELIVERED"), safe.toString())
        jdbc.update("INSERT INTO returns(rma_number,order_id,status) VALUES (?,?,'CLOSED')", UUID.randomUUID().toString(), id)
        assertEquals("ALREADY_OPEN", detail().path("returnEligibility").asText())
        assertEquals("NONE", detail().path("rmaStatus").asText())
        jdbc.update("INSERT INTO returns(rma_number,order_id,status) VALUES (?,?,'REQUESTED')", UUID.randomUUID().toString(), id)
        assertEquals("ALREADY_OPEN", detail().path("returnEligibility").asText(), "multiple known return rows are definitive persisted returns")
        val reversal = jdbc.queryForObject("INSERT INTO mp_order_reversal_cases(attempt_id,provider_order_id,kind,review_status,evidence_redacted) SELECT id,provider_order_id,'CHARGEBACK','UNDER_REVIEW','{}' FROM mp_checkout_attempts WHERE id=? RETURNING id", Long::class.java, attempt)!!
        assertEquals("UNAVAILABLE", detail().path("payment").path("state").asText())
        assertEquals("PAYMENT_UNVERIFIED", detail().path("returnEligibility").asText())
        assertEquals("REVERSAL_OR_INCIDENT", detail().path("fulfillmentEligibility").asText())
        jdbc.update("UPDATE mp_order_reversal_cases SET review_status='REJECTED' WHERE id=?", reversal)
        assertEquals("APPROVED", detail().path("payment").path("value").asText())
        jdbc.update("UPDATE mp_order_reversal_cases SET review_status='RESOLVED' WHERE id=?", reversal)
        assertEquals("CHARGED_BACK", detail().path("payment").path("value").asText())
        assertEquals("PAYMENT_UNVERIFIED", detail().path("returnEligibility").asText())
        val filtered = mapper.readTree(read("/api/v1/customer/orders?paymentStatus=CHARGED_BACK&shipmentStatus=DELIVERED").body!!).path("data")
        assertEquals(1, filtered.path("total").asInt())
        assertEquals(id.toString(), filtered.path("items").first().path("id").asText())
    }

    private fun projectionOrder(customerId: Long): Long {
        val key = UUID.randomUUID()
        val hash = "a".repeat(64)
        val claim = jdbc.queryForObject("INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot) VALUES (?,?,?,'{}') RETURNING id", Long::class.java, customerId, key, hash)!!
        return jdbc.queryForObject("INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,status,buyer_snapshot,checkout_snapshot,subtotal,shipping_cost,total) VALUES (?,?,?,?,?,'PENDING_PAYMENT','{\"street\":\"Main\",\"number\":\"1\",\"city\":\"City\",\"province\":\"Province\",\"postalCode\":\"1000\"}','{}',100,0,100) RETURNING id", Long::class.java, UUID.randomUUID().toString(), claim, key, hash, customerId)!!
    }

    private fun projectionAccredit(orderId: Long, paymentId: Long): Long {
        val provider = UUID.randomUUID().toString()
        val attempt = jdbc.queryForObject("INSERT INTO mp_checkout_attempts(order_id,payment_id,attempt_no,external_reference,idempotency_key,request_hash,amount,currency,snapshot,provider_order_id,state) VALUES (?,?,1,?,?,?,100,'ARS','{}',?,'ACCREDITED') RETURNING id", Long::class.java, orderId, paymentId, UUID.randomUUID().toString(), UUID.randomUUID(), "a".repeat(64), provider)!!
        val inbox = jdbc.queryForObject("INSERT INTO mp_order_notification_inbox(raw_topic,query_data_id,provider_order_id_candidate,x_request_id,signature_version,signature_result,envelope_redacted,disposition) VALUES ('merchant_order',?,?,?,'v1','ACCEPTED','{}','PROCESSABLE') RETURNING id", Long::class.java, provider, provider, UUID.randomUUID().toString())!!
        jdbc.update("INSERT INTO mp_order_commercial_applications(inbox_id,attempt_id,order_id,provider_order_id,transition,confirmed_amount,confirmed_currency) VALUES (?,?,?,?,'PAYMENT_ACCREDITED',100,'ARS')", inbox, attempt, orderId, provider)
        return attempt
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

    private fun provisionAdmin(email: String, role: String = "ADMIN"): Session {
        val hash = passwords.hash("a-very-long-password".toCharArray())
        val userId = jdbc.queryForObject("INSERT INTO users(email,password_hash,first_name,last_name) VALUES(?,?, 'Admin','User') RETURNING id", Long::class.java, email, hash)
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code=?", userId, role)
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

    private fun exchange(path: String, method: HttpMethod, body: String?, cookie: String? = null, csrf: String? = null, origin: String = "http://localhost:4200") = http.exchange(
        URI("http://localhost:$port$path"), method,
        HttpEntity(body, HttpHeaders().apply {
            contentType = MediaType.APPLICATION_JSON
            set(HttpHeaders.ORIGIN, origin)
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
