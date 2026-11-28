package com.storecore.commerce

import com.storecore.channelreporting.domain.ReportValue
import com.storecore.channelreporting.application.StoreCoreCreatedOrderReadResult
import com.storecore.channelreporting.infrastructure.JdbcStoreCoreCreatedOrderReportRepository
import com.storecore.channelreporting.infrastructure.Sha256ReportPeriodHasher
import com.storecore.commerce.application.CheckoutConflict
import com.storecore.commerce.application.CheckoutContextChanged
import com.storecore.commerce.application.port.output.OfficialOrderCommandPort
import com.storecore.commerce.application.port.output.OfficialOrderCreateRequest
import com.storecore.commerce.application.port.output.OfficialOrderQueryPort
import com.storecore.commerce.application.port.output.OfficialOrderSearchQuery
import com.storecore.commerce.application.port.output.OfficialOrderSearchResult
import com.storecore.commerce.application.port.output.OfficialWebhookSignaturePort
import com.storecore.commerce.application.port.output.WebhookSignatureDecision
import com.storecore.commerce.domain.CreationObservation
import com.storecore.commerce.domain.DeliveryMode
import com.storecore.commerce.domain.OfficialOrderResource
import com.storecore.commerce.domain.OrderStatus
import com.storecore.commerce.domain.PaymentCurrency
import com.storecore.commerce.domain.PaymentStatus
import com.storecore.commerce.infrastructure.JdbcCartService
import com.storecore.commerce.infrastructure.JdbcOrderService
import com.storecore.commerce.infrastructure.mporders.MpCheckoutAttemptService
import com.storecore.configuration.application.CapabilityDisabled
import com.storecore.configuration.application.CapabilityKillSwitchActive
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.application.AuthenticationFailed
import com.storecore.identity.domain.CustomerPrincipal
import com.storecore.loyalty.application.LoyaltyActionAdmissionPort
import com.storecore.loyalty.application.LoyaltyCheckoutConflict
import com.storecore.loyalty.application.LoyaltyEvidenceIneligible
import com.storecore.loyalty.application.LoyaltyReservationNotFound
import com.storecore.loyalty.domain.LoyaltyAction
import com.storecore.loyalty.domain.LoyaltyAdmissionDecision
import com.storecore.loyalty.domain.LoyaltyCartFingerprint
import com.storecore.loyalty.domain.LoyaltyCartLine
import com.storecore.loyalty.domain.LoyaltyCheckoutSelection
import com.storecore.loyalty.domain.LoyaltyDiscountState
import com.storecore.loyalty.domain.LoyaltyEvidenceAdmission
import com.storecore.loyalty.domain.LoyaltyEvidenceAdmissionStep
import com.storecore.loyalty.domain.LoyaltyEvidenceCurrency
import com.storecore.loyalty.domain.LoyaltyEvidenceKind
import com.storecore.loyalty.domain.LoyaltyEvidencePurpose
import com.storecore.loyalty.domain.LoyaltyEvidenceRevision
import com.storecore.loyalty.domain.LoyaltyItemClassification
import com.storecore.loyalty.domain.LoyaltyMinorUnits
import com.storecore.loyalty.domain.LoyaltyPoints
import com.storecore.loyalty.domain.LoyaltyPriceProfile
import com.storecore.loyalty.domain.LoyaltyQuoteEvidenceStep
import com.storecore.loyalty.infrastructure.JdbcLoyaltyActionAdmission
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.math.BigDecimal
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import javax.sql.DataSource

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.NONE,
    properties = [
        "storecore.installation-guard.enabled=false",
        "storecore.integrations.mp-orders.adapter=fake",
        "storecore.integrations.mp-orders.accepted-topic=order",
        "storecore.integrations.mp-orders.expected-user-id=user-1",
        "storecore.integrations.mp-orders.expected-application-id=app-1",
        "storecore.integrations.mp-orders.checkout-url-hosts[0]=www.mercadopago.com.ar",
    ],
)
@Import(LoyaltyCheckoutBindingIntegrationTest.Fakes::class)
class LoyaltyCheckoutBindingIntegrationTest(
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val dataSource: DataSource,
    @Autowired private val transactions: TransactionTemplate,
    @Autowired private val carts: JdbcCartService,
    @Autowired private val orders: JdbcOrderService,
    @Autowired private val mpAttempts: MpCheckoutAttemptService,
    @Autowired private val jdbcAdmission: JdbcLoyaltyActionAdmission,
) {
    private val reports = JdbcStoreCoreCreatedOrderReportRepository(dataSource, Sha256ReportPeriodHasher())

    @BeforeEach
    fun setupBaseFixtures() {
        Fakes.admitBindOverride.set(true)
        Fakes.lastCreateRequest.set(null)
        Fakes.nextCheckoutUrl.set("https://www.mercadopago.com.ar/checkout/test-ord")
        jdbc.update(
            """INSERT INTO installation_settings(installation_id,business_name,allowed_host,timezone)
               VALUES (1,'Loyalty Integration','localhost','America/Argentina/Buenos_Aires')
               ON CONFLICT (installation_id) DO UPDATE SET timezone=EXCLUDED.timezone""",
        )
        listOf("STOREFRONT", "CATALOG", "PAYMENTS_MP", "PROFILE_CONTENT").forEach { activateModule(it) }
        ensureDeliveryPolicy()
    }

    @Test
    fun `default loyalty action admission denies BIND_CHECKOUT while LOYALTY disabled or kill switched`() {
        Fakes.admitBindOverride.set(false)
        val (customer, _) = createCustomerAndSession()
        val (sku, _) = createSellableSku(BigDecimal("100.00"))
        carts.putItem(customer, sku, 1)
        val cart = carts.read(customer)
        val deliveryVer = currentDeliveryVersion()
        val addressId = createAddress(customer.customerId)
        val addressRev = addressRevision(addressId)

        assertThrows(CapabilityDisabled::class.java) {
            carts.checkout(
                customer = customer,
                idempotencyKey = UUID.randomUUID(),
                addressId = addressId,
                currency = PaymentCurrency.ARS,
                deliveryMode = DeliveryMode.LOCAL_DELIVERY,
                deliveryConfigurationVersion = deliveryVer,
                expectedCartRevision = cart.revision,
                expectedAddressRevision = addressRev,
                loyaltySelection = LoyaltyCheckoutSelection.Reservation.of(UUID.randomUUID(), 0L),
            )
        }
        assertEquals(1, carts.read(customer).lines.size)

        // Direct JdbcLoyaltyActionAdmission checks against real DB kill switches & DISABLED module state
        assertEquals(
            LoyaltyAdmissionDecision.Admitted,
            jdbcAdmission.admit(LoyaltyAction.CANCEL_HELD, CapabilityActor.Customer(customer)),
        )
        val adminId = createAdminUser()
        val adminSession = createAdminSession(adminId)
        val ksId = jdbc.queryForObject(
            "SELECT capability_session_create_kill_switch(?::bigint,?::uuid,?::varchar,?::varchar,?::varchar,?::varchar,?::timestamptz,?::varchar,?::uuid)",
            Long::class.java,
            adminId, adminSession, "LOYALTY", "POST_LEDGER", "ops", "kill switch test",
            Timestamp.from(Instant.now().plusSeconds(3600)), "TKT-LOYALTY-1", UUID.randomUUID(),
        )!!
        try {
            assertThrows(CapabilityKillSwitchActive::class.java) {
                jdbcAdmission.requireAdmitted(LoyaltyAction.BIND_CHECKOUT, CapabilityActor.Customer(customer))
            }
            assertThrows(CapabilityKillSwitchActive::class.java) {
                jdbcAdmission.requireAdmitted(LoyaltyAction.CANCEL_HELD, CapabilityActor.Customer(customer))
            }
        } finally {
            jdbc.query(
                "SELECT capability_session_remove_kill_switch(?::bigint,?::uuid,?::varchar,?::bigint,?::varchar,?::uuid)",
                { _, _ -> },
                adminId, adminSession, "LOYALTY", ksId, "cleanup", UUID.randomUUID(),
            )
        }
    }

    @Test
    fun `atomic checkout binding transitions QUOTED to PAYMENT_PENDING reconciles net total across order reads MP and reporting`() {
        val (customer, _) = createCustomerAndSession()
        val (sku1, v1) = createSellableSku(BigDecimal("100.00"))
        val (sku2, v2) = createSellableSku(BigDecimal("100.00"))
        val (sku3, v3) = createSellableSku(BigDecimal("100.00"))
        val p1 = insertProfile(v1, 1L, 10_000L, 8_264L, 1_736L)
        val p2 = insertProfile(v2, 1L, 10_000L, 8_264L, 1_736L)
        val p3 = insertProfile(v3, 1L, 10_000L, 8_264L, 1_736L)

        carts.putItem(customer, sku1, 1)
        carts.putItem(customer, sku2, 1)
        carts.putItem(customer, sku3, 1)
        val cart = carts.read(customer)
        val addressId = createAddress(customer.customerId)
        val addressRev = addressRevision(addressId)
        val deliveryVer = currentDeliveryVersion()

        val walletId = createWallet(customer.customerId)
        val lotId = issueLot(walletId, 500L)
        // Total eligible = 8264 * 3 = 24792 minor -> max 10% = 24 points. Select 11 points (1100 minor): 366 + 366 + 366 + remainder 2 -> 367, 367, 366
        val reservationId = createQuotedReservation(
            customerId = customer.customerId,
            walletId = walletId,
            lotId = lotId,
            points = 11L,
            profiles = mapOf(v1 to p1, v2 to p2, v3 to p3),
        )

        val idempotencyKey = UUID.randomUUID()
        val selection = LoyaltyCheckoutSelection.Reservation.of(reservationId, 0L)
        val receipt = carts.checkout(
            customer = customer,
            idempotencyKey = idempotencyKey,
            addressId = addressId,
            currency = PaymentCurrency.ARS,
            deliveryMode = DeliveryMode.LOCAL_DELIVERY,
            deliveryConfigurationVersion = deliveryVer,
            expectedCartRevision = cart.revision,
            expectedAddressRevision = addressRev,
            loyaltySelection = selection,
        )

        val orderId = receipt.orderId.toLong()
        assertEquals(OrderStatus.PENDING_PAYMENT, receipt.orderStatus)
        assertEquals(PaymentStatus.PENDING, receipt.paymentStatus)
        assertTrue(carts.read(customer).lines.isEmpty())

        // Gross = 300.00, discount = 11.00, shipping = 10.00 -> netSubtotal = 289.00, total = 299.00
        val orderRow = jdbc.queryForMap("SELECT subtotal, shipping_cost, total, status FROM orders WHERE id=?", orderId)
        assertEquals(0, BigDecimal("289.00").compareTo(orderRow["subtotal"] as BigDecimal))
        assertEquals(0, BigDecimal("10.00").compareTo(orderRow["shipping_cost"] as BigDecimal))
        assertEquals(0, BigDecimal("299.00").compareTo(orderRow["total"] as BigDecimal))
        val paymentAmount = jdbc.queryForObject("SELECT amount FROM payments WHERE order_id=?", BigDecimal::class.java, orderId)!!
        assertEquals(0, BigDecimal("299.00").compareTo(paymentAmount))

        // Order items retain original/effective gross unit prices without mutation
        val unitPrices = jdbc.queryForList("SELECT original_unit_price, effective_unit_price, subtotal FROM order_items WHERE order_id=? ORDER BY id", orderId)
        assertEquals(3, unitPrices.size)
        unitPrices.forEach { row ->
            assertEquals(0, BigDecimal("100.00").compareTo(row["original_unit_price"] as BigDecimal))
            assertEquals(0, BigDecimal("100.00").compareTo(row["effective_unit_price"] as BigDecimal))
            assertEquals(0, BigDecimal("100.00").compareTo(row["subtotal"] as BigDecimal))
        }

        // Exact 1-cent deterministic remainder allocation: 367, 367, 366
        val allocated = jdbc.queryForList(
            "SELECT allocated_discount_minor FROM loyalty_order_lines WHERE order_id=? ORDER BY order_item_id",
            Long::class.java,
            orderId,
        )
        assertEquals(listOf(367L, 367L, 366L), allocated)

        // State & binding durability
        assertEquals("PAYMENT_PENDING", jdbc.queryForObject("SELECT state FROM loyalty_reservation_states WHERE reservation_id=?", String::class.java, reservationId))
        assertEquals(1L, jdbc.queryForObject("SELECT revision FROM loyalty_reservation_states WHERE reservation_id=?", Long::class.java, reservationId))
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM loyalty_checkout_bindings WHERE reservation_id=? AND order_id=?", Int::class.java, reservationId, orderId))
        assertEquals(2L, jdbc.queryForObject("SELECT revision FROM loyalty_wallets WHERE id=?", Long::class.java, walletId))

        // Order read projection reconciles cleanly
        val customerView = orders.customerOrder(customer, orderId)
        assertEquals(0, BigDecimal("289.00").compareTo(customerView.subtotal))
        assertEquals(0, BigDecimal("10.00").compareTo(customerView.shippingCost))
        assertEquals(0, BigDecimal("299.00").compareTo(customerView.total))
        assertEquals(PaymentStatus.PENDING, customerView.payment.value)

        // MP checkout attempt sends exact net total 299.00
        val redirect = mpAttempts.startForLocalOrder(orderId)
        assertNotNull(redirect)
        val mpReq = Fakes.lastCreateRequest.get()!!
        assertEquals(0, BigDecimal("299.00").compareTo(mpReq.amount))
        assertEquals(0, BigDecimal("299.00").compareTo(jdbc.queryForObject("SELECT amount FROM mp_checkout_attempts WHERE order_id=?", BigDecimal::class.java, orderId)))

        // Reporting reconciles createdOrders, appliedAccreditations, and paymentDisposition on discounted order
        jdbc.update("UPDATE orders SET created_at='2025-05-15T12:00:00Z' WHERE id=?", orderId)
        val attemptId = jdbc.queryForObject("SELECT id FROM mp_checkout_attempts WHERE order_id=?", Long::class.java, orderId)!!
        jdbc.update("UPDATE mp_checkout_attempts SET state='ACCREDITED', provider_order_id='MP-REP-1' WHERE id=?", attemptId)
        jdbc.update("UPDATE payments SET status='APPROVED' WHERE order_id=?", orderId)
        jdbc.update("UPDATE orders SET status='PAID' WHERE id=?", orderId)
        val inboxId = jdbc.queryForObject(
            """INSERT INTO mp_order_notification_inbox(raw_topic,query_data_id,provider_order_id_candidate,x_request_id,
               signature_version,signature_result,envelope_redacted,disposition)
               VALUES ('order','MP-REP-1','MP-REP-1','req-rep-1','v1','ACCEPTED','{}','PROCESSABLE') RETURNING id""",
            Long::class.java,
        )!!
        jdbc.update(
            """INSERT INTO mp_order_commercial_applications(inbox_id,order_id,attempt_id,provider_order_id,transition,confirmed_amount,confirmed_currency,applied_at)
               VALUES (?,?,?,'MP-REP-1','PAYMENT_ACCREDITED',299.00,'ARS','2025-05-16T12:00:00Z')""",
            inboxId, orderId, attemptId,
        )
        val report = (reports.read("2025-05-01", "2025-06-01") as StoreCoreCreatedOrderReadResult.Found).report
        assertTrue(report.createdOrders is ReportValue.Available<*>)
        assertTrue(report.appliedAccreditations is ReportValue.Available<*>)
        assertTrue(report.paymentDisposition is ReportValue.Available<*>)
        assertEquals("299.00", report.createdOrdersValue()!!.nominalTotal.wire)
        assertEquals("1", report.appliedAccreditationsValue()!!.count.wire)
        assertEquals("299.00", report.appliedAccreditationsValue()!!.confirmedGross.wire)
    }

    @Test
    fun `zero redemption records available or unavailable earning evidence without blocking checkout`() {
        val (customer, _) = createCustomerAndSession()
        val addressId = createAddress(customer.customerId)
        val addressRev = addressRevision(addressId)
        val deliveryVer = currentDeliveryVersion()

        // 1. Without price profile -> UNAVAILABLE / MISSING_PROFILE, order succeeds
        val (skuNoProfile, _) = createSellableSku(BigDecimal("150.00"))
        carts.putItem(customer, skuNoProfile, 2)
        val cart1 = carts.read(customer)
        val orderNoProfile = carts.checkout(
            customer = customer,
            idempotencyKey = UUID.randomUUID(),
            addressId = addressId,
            currency = PaymentCurrency.ARS,
            deliveryMode = DeliveryMode.LOCAL_DELIVERY,
            deliveryConfigurationVersion = deliveryVer,
            expectedCartRevision = cart1.revision,
            expectedAddressRevision = addressRev,
            loyaltySelection = LoyaltyCheckoutSelection.None,
        ).orderId.toLong()
        val snap1 = jdbc.queryForMap("SELECT availability, unavailable_reason, reservation_id, discount_minor, final_earning_minor FROM loyalty_order_snapshots WHERE order_id=?", orderNoProfile)
        assertEquals("UNAVAILABLE", snap1["availability"])
        assertEquals("MISSING_PROFILE", snap1["unavailable_reason"])
        assertNull(snap1["reservation_id"])
        assertEquals(0L, snap1["discount_minor"])
        assertNull(snap1["final_earning_minor"])

        // 2. With price profile -> AVAILABLE with discount=0 and full eligible earning
        val (skuWithProfile, vWithProfile) = createSellableSku(BigDecimal("200.00"))
        insertProfile(vWithProfile, 1L, 20_000L, 16_529L, 3_471L)
        carts.putItem(customer, skuWithProfile, 1)
        val cart2 = carts.read(customer)
        val orderWithProfile = carts.checkout(
            customer = customer,
            idempotencyKey = UUID.randomUUID(),
            addressId = addressId,
            currency = PaymentCurrency.ARS,
            deliveryMode = DeliveryMode.LOCAL_DELIVERY,
            deliveryConfigurationVersion = deliveryVer,
            expectedCartRevision = cart2.revision,
            expectedAddressRevision = addressRev,
            loyaltySelection = LoyaltyCheckoutSelection.None,
        ).orderId.toLong()
        val snap2 = jdbc.queryForMap("SELECT availability, unavailable_reason, reservation_id, discount_minor, final_earning_minor, net_subtotal_minor, total_minor FROM loyalty_order_snapshots WHERE order_id=?", orderWithProfile)
        assertEquals("AVAILABLE", snap2["availability"])
        assertNull(snap2["unavailable_reason"])
        assertNull(snap2["reservation_id"])
        assertEquals(0L, snap2["discount_minor"])
        assertEquals(16_529L, snap2["final_earning_minor"])
        assertEquals(20_000L, snap2["net_subtotal_minor"])
        assertEquals(21_000L, snap2["total_minor"])
        assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM loyalty_order_lines WHERE order_id=?", Int::class.java, orderWithProfile))
    }

    @Test
    fun `exact replay succeeds even after loyalty disabled or reservation bound or TTL elapsed and conflicts on selection mismatch`() {
        val (customer, _) = createCustomerAndSession()
        val (sku, variantId) = createSellableSku(BigDecimal("200.00"))
        val profileId = insertProfile(variantId, 1L, 20_000L, 16_529L, 3_471L)
        carts.putItem(customer, sku, 1)
        val cart = carts.read(customer)
        val addressId = createAddress(customer.customerId)
        val addressRev = addressRevision(addressId)
        val deliveryVer = currentDeliveryVersion()

        val walletId = createWallet(customer.customerId)
        val lotId = issueLot(walletId, 500L)
        val reservationId = createQuotedReservation(customer.customerId, walletId, lotId, 10L, mapOf(variantId to profileId), createdAtSecondsAgo = 898L)
        val idempotencyKey = UUID.randomUUID()
        val selection = LoyaltyCheckoutSelection.Reservation.of(reservationId, 0L)

        val first = carts.checkout(
            customer = customer,
            idempotencyKey = idempotencyKey,
            addressId = addressId,
            currency = PaymentCurrency.ARS,
            deliveryMode = DeliveryMode.LOCAL_DELIVERY,
            deliveryConfigurationVersion = deliveryVer,
            expectedCartRevision = cart.revision,
            expectedAddressRevision = addressRev,
            loyaltySelection = selection,
        )

        // Now turn off admission override (LOYALTY disabled in DB), reservation is PAYMENT_PENDING (rev 1), and quote TTL has elapsed
        Fakes.admitBindOverride.set(false)
        Thread.sleep(2500)

        val replay = carts.checkout(
            customer = customer,
            idempotencyKey = idempotencyKey,
            addressId = addressId,
            currency = PaymentCurrency.ARS,
            deliveryMode = DeliveryMode.LOCAL_DELIVERY,
            deliveryConfigurationVersion = deliveryVer,
            expectedCartRevision = cart.revision,
            expectedAddressRevision = addressRev,
            loyaltySelection = selection,
        )
        assertEquals(first.orderId, replay.orderId)

        // Different loyalty selection with same idempotencyKey -> CheckoutConflict
        assertThrows(CheckoutConflict::class.java) {
            carts.checkout(
                customer = customer,
                idempotencyKey = idempotencyKey,
                addressId = addressId,
                currency = PaymentCurrency.ARS,
                deliveryMode = DeliveryMode.LOCAL_DELIVERY,
                deliveryConfigurationVersion = deliveryVer,
                expectedCartRevision = cart.revision,
                expectedAddressRevision = addressRev,
                loyaltySelection = LoyaltyCheckoutSelection.None,
            )
        }
        assertThrows(CheckoutConflict::class.java) {
            carts.checkout(
                customer = customer,
                idempotencyKey = idempotencyKey,
                addressId = addressId,
                currency = PaymentCurrency.ARS,
                deliveryMode = DeliveryMode.LOCAL_DELIVERY,
                deliveryConfigurationVersion = deliveryVer,
                expectedCartRevision = cart.revision,
                expectedAddressRevision = addressRev,
                loyaltySelection = LoyaltyCheckoutSelection.Reservation.of(reservationId, 1L),
            )
        }
    }

    @Test
    fun `negative validations and rollback atomicity leave zero partial writes`() {
        val (customer, _) = createCustomerAndSession()
        val (otherCustomer, _) = createCustomerAndSession()
        val (sku, variantId) = createSellableSku(BigDecimal("200.00"))
        val profileId = insertProfile(variantId, 1L, 20_000L, 16_529L, 3_471L)
        carts.putItem(customer, sku, 1)
        val cart = carts.read(customer)
        val addressId = createAddress(customer.customerId)
        val addressRev = addressRevision(addressId)
        val deliveryVer = currentDeliveryVersion()

        val otherWallet = createWallet(otherCustomer.customerId)
        val otherLot = issueLot(otherWallet, 500L)
        carts.putItem(otherCustomer, sku, 1)
        val otherReservation = createQuotedReservation(otherCustomer.customerId, otherWallet, otherLot, 10L, mapOf(variantId to profileId))

        // Wrong customer reservation -> 404
        assertThrows(LoyaltyReservationNotFound::class.java) {
            carts.checkout(customer, UUID.randomUUID(), addressId, PaymentCurrency.ARS, DeliveryMode.LOCAL_DELIVERY, deliveryVer, cart.revision, addressRev,
                LoyaltyCheckoutSelection.Reservation.of(otherReservation, 0L))
        }

        val walletId = createWallet(customer.customerId)
        val lotId = issueLot(walletId, 500L)
        val reservationId = createQuotedReservation(customer.customerId, walletId, lotId, 10L, mapOf(variantId to profileId))

        // Wrong revision -> conflict
        assertThrows(LoyaltyCheckoutConflict::class.java) {
            carts.checkout(customer, UUID.randomUUID(), addressId, PaymentCurrency.ARS, DeliveryMode.LOCAL_DELIVERY, deliveryVer, cart.revision, addressRev,
                LoyaltyCheckoutSelection.Reservation.of(reservationId, 1L))
        }

        // Revoked session -> AuthenticationFailed
        val revokedPrincipal = CustomerPrincipal(UUID.randomUUID(), customer.customerId)
        assertThrows(AuthenticationFailed::class.java) {
            carts.checkout(revokedPrincipal, UUID.randomUUID(), addressId, PaymentCurrency.ARS, DeliveryMode.LOCAL_DELIVERY, deliveryVer, cart.revision, addressRev,
                LoyaltyCheckoutSelection.Reservation.of(reservationId, 0L))
        }

        // Profile revised after quote -> conflict (LOYALTY_CART_OR_PROFILE_CHANGED)
        val profile2 = insertProfile(variantId, 2L, 20_000L, 16_000L, 4_000L)
        assertTrue(profile2 > profileId)
        assertThrows(LoyaltyCheckoutConflict::class.java) {
            carts.checkout(customer, UUID.randomUUID(), addressId, PaymentCurrency.ARS, DeliveryMode.LOCAL_DELIVERY, deliveryVer, cart.revision, addressRev,
                LoyaltyCheckoutSelection.Reservation.of(reservationId, 0L))
        }

        // New quote on rev 2, then test rollback atomicity on DB trigger failure
        val res2 = createQuotedReservation(customer.customerId, walletId, lotId, 10L, mapOf(variantId to profile2))
        val ordersBefore = jdbc.queryForObject("SELECT count(*) FROM orders", Int::class.java)!!
        jdbc.execute("CREATE FUNCTION test_fail_bind() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'boom'; END; $$")
        jdbc.execute("CREATE TRIGGER trg_test_fail_bind AFTER INSERT ON loyalty_checkout_bindings FOR EACH ROW EXECUTE FUNCTION test_fail_bind()")
        try {
            assertThrows(RuntimeException::class.java) {
                carts.checkout(customer, UUID.randomUUID(), addressId, PaymentCurrency.ARS, DeliveryMode.LOCAL_DELIVERY, deliveryVer, cart.revision, addressRev,
                    LoyaltyCheckoutSelection.Reservation.of(res2, 0L))
            }
        } finally {
            jdbc.execute("DROP TRIGGER trg_test_fail_bind ON loyalty_checkout_bindings")
            jdbc.execute("DROP FUNCTION test_fail_bind()")
        }
        assertEquals(ordersBefore, jdbc.queryForObject("SELECT count(*) FROM orders", Int::class.java)!!)
        assertEquals("QUOTED", jdbc.queryForObject("SELECT state FROM loyalty_reservation_states WHERE reservation_id=?", String::class.java, res2))
        assertEquals(0L, jdbc.queryForObject("SELECT revision FROM loyalty_reservation_states WHERE reservation_id=?", Long::class.java, res2))
        assertEquals(1, carts.read(customer).lines.size)

        // Expired TTL -> LOYALTY_RESERVATION_EXPIRED
        val expiredRes = createQuotedReservation(customer.customerId, walletId, lotId, 10L, mapOf(variantId to profile2), createdAtSecondsAgo = 905L)
        val expErr = assertThrows(LoyaltyCheckoutConflict::class.java) {
            carts.checkout(customer, UUID.randomUUID(), addressId, PaymentCurrency.ARS, DeliveryMode.LOCAL_DELIVERY, deliveryVer, cart.revision, addressRev,
                LoyaltyCheckoutSelection.Reservation.of(expiredRes, 0L))
        }
        assertEquals("LOYALTY_RESERVATION_EXPIRED", expErr.message)

        // Cart changed -> CheckoutContextChanged; if new cart revision passed with old quote -> LOYALTY_CART_FINGERPRINT_MISMATCH
        val res3 = createQuotedReservation(customer.customerId, walletId, lotId, 10L, mapOf(variantId to profile2))
        carts.putItem(customer, sku, 2)
        val cart2 = carts.read(customer)
        assertThrows(CheckoutContextChanged::class.java) {
            carts.checkout(customer, UUID.randomUUID(), addressId, PaymentCurrency.ARS, DeliveryMode.LOCAL_DELIVERY, deliveryVer, cart.revision, addressRev,
                LoyaltyCheckoutSelection.Reservation.of(res3, 0L))
        }
        assertThrows(LoyaltyCheckoutConflict::class.java) {
            carts.checkout(customer, UUID.randomUUID(), addressId, PaymentCurrency.ARS, DeliveryMode.LOCAL_DELIVERY, deliveryVer, cart2.revision, addressRev,
                LoyaltyCheckoutSelection.Reservation.of(res3, 0L))
        }

        // Existing offer/discount -> LoyaltyEvidenceIneligible
        jdbc.update("UPDATE cart_items SET discount_amount=10.00, effective_unit_price=190.00 WHERE cart_id=(SELECT id FROM carts WHERE customer_id=?)", customer.customerId)
        val discountedCart = carts.read(customer)
        assertThrows(LoyaltyEvidenceIneligible::class.java) {
            carts.checkout(customer, UUID.randomUUID(), addressId, PaymentCurrency.ARS, DeliveryMode.LOCAL_DELIVERY, deliveryVer, discountedCart.revision, addressRev,
                LoyaltyCheckoutSelection.Reservation.of(res3, 0L))
        }
    }

    @Test
    fun `concurrent bind attempts and cancel or expire races serialize without deadlock or double binding`() {
        // 1. Two concurrent checkout binds on same QUOTED reservation with distinct idempotency keys
        run {
            val (customer, _) = createCustomerAndSession()
            val (sku, variantId) = createSellableSku(BigDecimal("200.00"))
            val profileId = insertProfile(variantId, 1L, 20_000L, 16_529L, 3_471L)
            carts.putItem(customer, sku, 1)
            val cart = carts.read(customer)
            val addressId = createAddress(customer.customerId)
            val addressRev = addressRevision(addressId)
            val deliveryVer = currentDeliveryVersion()
            val walletId = createWallet(customer.customerId)
            val lotId = issueLot(walletId, 500L)
            val reservationId = createQuotedReservation(customer.customerId, walletId, lotId, 10L, mapOf(variantId to profileId))

            val pool = Executors.newFixedThreadPool(2)
            val gate = CountDownLatch(1)
            try {
                val f1 = pool.submit<Result<Long>> {
                    gate.await(5, TimeUnit.SECONDS)
                    runCatching {
                        carts.checkout(customer, UUID.randomUUID(), addressId, PaymentCurrency.ARS, DeliveryMode.LOCAL_DELIVERY, deliveryVer, cart.revision, addressRev,
                            LoyaltyCheckoutSelection.Reservation.of(reservationId, 0L)).orderId.toLong()
                    }
                }
                val f2 = pool.submit<Result<Long>> {
                    gate.await(5, TimeUnit.SECONDS)
                    runCatching {
                        carts.checkout(customer, UUID.randomUUID(), addressId, PaymentCurrency.ARS, DeliveryMode.LOCAL_DELIVERY, deliveryVer, cart.revision, addressRev,
                            LoyaltyCheckoutSelection.Reservation.of(reservationId, 0L)).orderId.toLong()
                    }
                }
                gate.countDown()
                val results = listOf(f1.get(15, TimeUnit.SECONDS), f2.get(15, TimeUnit.SECONDS))
                assertEquals(1, results.count { it.isSuccess }, "exactly one concurrent bind must succeed: $results")
                assertEquals(1, results.count { it.isFailure }, "second concurrent bind must fail cleanly: $results")
                assertEquals("PAYMENT_PENDING", jdbc.queryForObject("SELECT state FROM loyalty_reservation_states WHERE reservation_id=?", String::class.java, reservationId))
                assertEquals(1, jdbc.queryForObject("SELECT count(*) FROM loyalty_checkout_bindings WHERE reservation_id=?", Int::class.java, reservationId))
            } finally {
                pool.shutdownNow()
            }
        }

        // 2. Concurrent checkout bind vs loyalty_cancel_reservation
        run {
            val (customer, _) = createCustomerAndSession()
            val (sku, variantId) = createSellableSku(BigDecimal("200.00"))
            val profileId = insertProfile(variantId, 1L, 20_000L, 16_529L, 3_471L)
            carts.putItem(customer, sku, 1)
            val cart = carts.read(customer)
            val addressId = createAddress(customer.customerId)
            val addressRev = addressRevision(addressId)
            val deliveryVer = currentDeliveryVersion()
            val walletId = createWallet(customer.customerId)
            val lotId = issueLot(walletId, 500L)
            val reservationId = createQuotedReservation(customer.customerId, walletId, lotId, 10L, mapOf(variantId to profileId))

            val pool = Executors.newFixedThreadPool(2)
            val gate = CountDownLatch(1)
            try {
                val bindFuture = pool.submit<Result<Long>> {
                    gate.await(5, TimeUnit.SECONDS)
                    runCatching {
                        carts.checkout(customer, UUID.randomUUID(), addressId, PaymentCurrency.ARS, DeliveryMode.LOCAL_DELIVERY, deliveryVer, cart.revision, addressRev,
                            LoyaltyCheckoutSelection.Reservation.of(reservationId, 0L)).orderId.toLong()
                    }
                }
                val cancelFuture = pool.submit<String> {
                    gate.await(5, TimeUnit.SECONDS)
                    jdbc.queryForObject(
                        "SELECT loyalty_cancel_reservation(?,?,?,?,?,?)::text",
                        String::class.java,
                        customer.customerId, customer.sessionId, UUID.randomUUID(), reservationId, 0L, "c".repeat(64),
                    )!!
                }
                gate.countDown()
                val bindRes = bindFuture.get(15, TimeUnit.SECONDS)
                val cancelRes = cancelFuture.get(15, TimeUnit.SECONDS)
                val finalState = jdbc.queryForObject("SELECT state FROM loyalty_reservation_states WHERE reservation_id=?", String::class.java, reservationId)
                val bindings = jdbc.queryForObject("SELECT count(*) FROM loyalty_checkout_bindings WHERE reservation_id=?", Int::class.java, reservationId)!!
                if (bindRes.isSuccess) {
                    assertEquals("PAYMENT_PENDING", finalState)
                    assertEquals(1, bindings)
                    assertTrue(cancelRes.contains("CONFLICT") || cancelRes.contains("INVALID") || cancelRes.contains("NOT_QUOTED"), cancelRes)
                } else {
                    assertEquals("RELEASED", finalState)
                    assertEquals(0, bindings)
                }
            } finally {
                pool.shutdownNow()
            }
        }

        // 3. Concurrent checkout bind vs loyalty_expire_reservation
        run {
            val (customer, _) = createCustomerAndSession()
            val (sku, variantId) = createSellableSku(BigDecimal("200.00"))
            val profileId = insertProfile(variantId, 1L, 20_000L, 16_529L, 3_471L)
            carts.putItem(customer, sku, 1)
            val cart = carts.read(customer)
            val addressId = createAddress(customer.customerId)
            val addressRev = addressRevision(addressId)
            val deliveryVer = currentDeliveryVersion()
            val walletId = createWallet(customer.customerId)
            val lotId = issueLot(walletId, 500L)
            val reservationId = createQuotedReservation(
                customer.customerId, walletId, lotId, 10L, mapOf(variantId to profileId), createdAtSecondsAgo = 905L,
            )

            val pool = Executors.newFixedThreadPool(2)
            val gate = CountDownLatch(1)
            try {
                val bindFuture = pool.submit<Result<Long>> {
                    gate.await(5, TimeUnit.SECONDS)
                    runCatching {
                        carts.checkout(customer, UUID.randomUUID(), addressId, PaymentCurrency.ARS, DeliveryMode.LOCAL_DELIVERY, deliveryVer, cart.revision, addressRev,
                            LoyaltyCheckoutSelection.Reservation.of(reservationId, 0L)).orderId.toLong()
                    }
                }
                val expireFuture = pool.submit<String> {
                    gate.await(5, TimeUnit.SECONDS)
                    jdbc.queryForObject(
                        "SELECT loyalty_expire_reservation(?,?,?,?)::text",
                        String::class.java,
                        UUID.randomUUID(), reservationId, 0L, "d".repeat(64),
                    )!!
                }
                gate.countDown()
                val bindRes = bindFuture.get(15, TimeUnit.SECONDS)
                expireFuture.get(15, TimeUnit.SECONDS)
                assertTrue(bindRes.isFailure, "expired reservation must never bind")
                val finalState = jdbc.queryForObject("SELECT state FROM loyalty_reservation_states WHERE reservation_id=?", String::class.java, reservationId)
                assertTrue(finalState in setOf("QUOTED", "EXPIRED"), finalState)
                assertEquals(0, jdbc.queryForObject("SELECT count(*) FROM loyalty_checkout_bindings WHERE reservation_id=?", Int::class.java, reservationId))
            } finally {
                pool.shutdownNow()
            }
        }
    }

    private fun activateModule(module: String) {
        val state = jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code=?", String::class.java, module)
        if (state == "ACTIVE") return
        val adminId = createAdminUser()
        val adminSession = createAdminSession(adminId)
        val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code=?", Int::class.java, module)!!
        val cfg = jdbc.queryForObject("SELECT config::text FROM module_configurations WHERE module_code=?", String::class.java, module)!!
        jdbc.query(
            "SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)",
            { _, _ -> },
            adminId, adminSession, module, version, "ACTIVE", cfg, UUID.randomUUID(), "setup $module",
        )
    }

    private fun ensureDeliveryPolicy() {
        val existing = jdbc.queryForObject("SELECT state FROM module_configurations WHERE module_code='MANUAL_FULFILLMENT'", String::class.java)
        if (existing != "ACTIVE") {
            val adminId = createAdminUser()
            val adminSession = createAdminSession(adminId)
            val version = jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MANUAL_FULFILLMENT'", Int::class.java)!!
            val cfg = """{"pickup":{"enabled":true,"label":"Collect","cost":"0.00","minDays":0,"maxDays":1,"destination":"Store A","instructions":"Bring ref"},"localDelivery":{"enabled":true,"label":"Local","cost":"10.00","minDays":1,"maxDays":2}}"""
            jdbc.query(
                "SELECT capability_session_change_configuration(?,?,?,?,?,?::jsonb,?,?)",
                { _, _ -> },
                adminId, adminSession, "MANUAL_FULFILLMENT", version, "ACTIVE", cfg, UUID.randomUUID(), "setup delivery",
            )
        }
    }

    private fun currentDeliveryVersion(): Int =
        jdbc.queryForObject("SELECT config_version FROM module_configurations WHERE module_code='MANUAL_FULFILLMENT'", Int::class.java)!!

    private fun createCustomerAndSession(): Pair<CustomerPrincipal, Long> {
        val customerId = jdbc.queryForObject(
            "INSERT INTO customers(email,password_hash,first_name,last_name,active) VALUES (?,'\$argon2id\$fixture','Test','Shopper',TRUE) RETURNING id",
            Long::class.java,
            "shopper-${UUID.randomUUID()}@example.test",
        )!!
        val sessionId = UUID.randomUUID()
        jdbc.update(
            """INSERT INTO identity_sessions(id,subject_kind,customer_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
               VALUES (?,'CUSTOMER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')""",
            sessionId, customerId, UUID.randomUUID().toString().replace("-", "").repeat(2),
        )
        return CustomerPrincipal(sessionId, customerId) to customerId
    }

    private fun createAdminUser(): Long {
        val userId = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,'\$argon2id\$fixture','Admin','User') RETURNING id",
            Long::class.java,
            "admin-${UUID.randomUUID()}@example.test",
        )!!
        jdbc.update("INSERT INTO user_roles(user_id,role_id) SELECT ?, id FROM roles WHERE code='ADMIN'", userId)
        return userId
    }

    private fun createAdminSession(userId: Long): UUID {
        val sessionId = UUID.randomUUID()
        jdbc.update(
            """INSERT INTO identity_sessions(id,subject_kind,user_id,token_hash,issued_at,last_seen_at,idle_expires_at,absolute_expires_at)
               VALUES (?,'USER',?,?,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')""",
            sessionId, userId, UUID.randomUUID().toString().replace("-", "").repeat(2),
        )
        return sessionId
    }

    private fun createAddress(customerId: Long): Long =
        jdbc.queryForObject(
            "INSERT INTO customer_addresses(customer_id,street,number,city,province,postal_code,is_default) VALUES (?,'Main','100','CABA','CABA','1000',TRUE) RETURNING id",
            Long::class.java,
            customerId,
        )!!

    private fun addressRevision(addressId: Long): Instant =
        jdbc.queryForObject("SELECT updated_at FROM customer_addresses WHERE id=?", Timestamp::class.java, addressId)!!.toInstant()

    private fun createSellableSku(price: BigDecimal): Pair<String, Long> {
        val slug = "prod-${UUID.randomUUID()}"
        val productId = jdbc.queryForObject(
            "INSERT INTO products(name,slug,base_price,status) VALUES (?,?,?,'ACTIVE') RETURNING id",
            Long::class.java,
            "Product $slug", slug, price,
        )!!
        val sku = "SKU-${UUID.randomUUID()}"
        val variantId = jdbc.queryForObject(
            "INSERT INTO product_variants(product_id,sku,label,active) VALUES (?,?,'Default',TRUE) RETURNING id",
            Long::class.java,
            productId, sku,
        )!!
        jdbc.update(
            "INSERT INTO inventory_balances(variant_id,available_quantity,reserved_quantity) VALUES (?,50,0)",
            variantId,
        )
        return sku to variantId
    }

    private fun insertProfile(variantId: Long, revision: Long, grossMinor: Long, merchMinor: Long, taxMinor: Long): Long =
        jdbc.queryForObject(
            """INSERT INTO catalog_loyalty_price_profiles(
                 variant_id,revision,currency,gross_unit_minor,merchandise_unit_minor,excluded_tax_unit_minor,
                 classification,evidence_kind,source_reference,admin_command_id,recorded_at
               ) VALUES (?,?,'ARS',?,?,?,'STANDARD','MERCHANT_ACCOUNTANT_PROFILE','test-profile',?,'2026-11-28T01:00:00Z') RETURNING id""",
            Long::class.java,
            variantId, revision, grossMinor, merchMinor, taxMinor, UUID.randomUUID(),
        )!!

    private fun createWallet(customerId: Long): Long =
        jdbc.queryForObject("INSERT INTO loyalty_wallets(customer_id) VALUES (?) RETURNING id", Long::class.java, customerId)!!

    private fun issueLot(walletId: Long, points: Long): Long = transactions.execute {
        val sourceId = UUID.randomUUID()
        val now = Instant.parse("2026-10-01T00:00:00Z")
        jdbc.update(
            "INSERT INTO loyalty_source_applications(id,wallet_id,source_type,source_id,policy_version,points,accepted_at) VALUES (?,?,'ADMIN_ADJUSTMENT',?,'loyalty-policy-v1',?,?)",
            sourceId, walletId, sourceId.toString(), points, Timestamp.from(now),
        )
        val ledgerId = jdbc.queryForObject(
            "INSERT INTO loyalty_ledger(wallet_id,source_application_id,movement,direction,points,recorded_at) VALUES (?,?,'MANUAL_ADJUSTMENT','CREDIT',?,?) RETURNING id",
            Long::class.java,
            walletId, sourceId, points, Timestamp.from(now),
        )!!
        val lotId = jdbc.queryForObject(
            "INSERT INTO loyalty_lots(wallet_id,ledger_id,issued,accepted_at,expires_at) VALUES (?,?,?,?,?) RETURNING id",
            Long::class.java,
            walletId, ledgerId, points, Timestamp.from(now), Timestamp.from(now.plusSeconds(365L * 86_400)),
        )!!
        jdbc.update(
            "INSERT INTO loyalty_lot_partitions(lot_id,wallet_id,issued,free,held,redeemed,expired,reversed) VALUES (?,?,?,?,0,0,0,0)",
            lotId, walletId, points, points,
        )
        jdbc.update(
            "INSERT INTO loyalty_allocation_events(id,wallet_id,lot_id,ledger_id,kind,points,recorded_at) VALUES (?,?,?,?,'ISSUE',?,?)",
            UUID.randomUUID(), walletId, lotId, ledgerId, points, Timestamp.from(now),
        )
        lotId
    }!!

    private fun createQuotedReservation(
        customerId: Long,
        walletId: Long,
        lotId: Long,
        points: Long,
        profiles: Map<Long, Long>,
        createdAtSecondsAgo: Long = 0L,
        cartCustomerId: Long = customerId,
    ): UUID {
        val cartRows = jdbc.queryForList(
            """SELECT i.id cart_item_id, i.variant_id, i.quantity, i.original_unit_price, i.effective_unit_price, i.discount_amount, i.offer_id, i.campaign_reference
               FROM cart_items i JOIN carts c ON c.id=i.cart_id WHERE c.customer_id=? ORDER BY i.id""",
            cartCustomerId,
        )
        val cartLines = cartRows.map { r ->
            val orig = (r["original_unit_price"] as BigDecimal).movePointRight(2).longValueExact()
            val eff = (r["effective_unit_price"] as BigDecimal).movePointRight(2).longValueExact()
            val hasDisc = (r["discount_amount"] as BigDecimal).compareTo(BigDecimal.ZERO) > 0 || r["offer_id"] != null || r["campaign_reference"] != null || orig > eff
            LoyaltyCartLine(
                cartItemId = (r["cart_item_id"] as Number).toLong(),
                variantId = (r["variant_id"] as Number).toLong(),
                quantity = (r["quantity"] as Number).toLong(),
                originalUnitPrice = LoyaltyMinorUnits.of(orig)!!,
                effectiveUnitPrice = LoyaltyMinorUnits.of(eff)!!,
                discountState = if (hasDisc) LoyaltyDiscountState.PRESENT else LoyaltyDiscountState.NONE,
            )
        }
        val fp = LoyaltyCartFingerprint.compute(cartCustomerId, LoyaltyEvidenceCurrency.ARS, cartLines)!!
        val frozen = cartLines.map { line ->
            val profId = profiles.getValue(line.variantId)
            val pRow = jdbc.queryForMap("SELECT * FROM catalog_loyalty_price_profiles WHERE id=?", profId)
            val rev = LoyaltyEvidenceRevision.fromWire((pRow["revision"] as Number).toLong().toString())!!
            val prof = LoyaltyPriceProfile(
                id = profId,
                variantId = line.variantId,
                revision = rev,
                currency = LoyaltyEvidenceCurrency.ARS,
                grossUnit = LoyaltyMinorUnits.of((pRow["gross_unit_minor"] as Number).toLong())!!,
                merchandiseExcludingTaxUnit = LoyaltyMinorUnits.of((pRow["merchandise_unit_minor"] as Number).toLong())!!,
                excludedTaxUnit = LoyaltyMinorUnits.of((pRow["excluded_tax_unit_minor"] as Number).toLong())!!,
                classification = LoyaltyItemClassification.fromWire(pRow["classification"] as String),
                kind = LoyaltyEvidenceKind.fromWire(pRow["evidence_kind"] as String),
                sourceReference = pRow["source_reference"] as String,
                authorizingCommandId = pRow["admin_command_id"] as UUID,
                recordedAt = (pRow["recorded_at"] as Timestamp).toInstant(),
            )
            (LoyaltyEvidenceAdmissionStep.admit(line, prof, rev, LoyaltyEvidencePurpose.REDEMPTION) as LoyaltyEvidenceAdmission.Available).snapshot
        }
        val zeroRev = LoyaltyEvidenceRevision.fromWire("0")!!
        val quoteEvidence = (LoyaltyQuoteEvidenceStep.freeze(fp, zeroRev, frozen, LoyaltyPoints.of(500)!!, LoyaltyPoints.of(points)!!) as LoyaltyEvidenceAdmission.Available).snapshot

        val reservationId = UUID.randomUUID()
        transactions.execute {
            val now = jdbc.queryForObject("SELECT date_trunc('second', clock_timestamp())", Timestamp::class.java)!!.toInstant()
            val createdAt = now.minusSeconds(createdAtSecondsAgo)
            val expiresAt = createdAt.plusSeconds(900L)
            val walletRev = jdbc.queryForObject("SELECT revision FROM loyalty_wallets WHERE id=?", Long::class.java, walletId)!!
            jdbc.update(
                """INSERT INTO loyalty_reservations(id,wallet_id,cart_fingerprint,cart_revision,wallet_revision,policy_version,points,created_at,expires_at)
                   VALUES (?,?,?,0,?,'loyalty-policy-v1',?,?,?)""",
                reservationId, walletId, fp.value, walletRev, points, Timestamp.from(createdAt), Timestamp.from(expiresAt),
            )
            jdbc.update("INSERT INTO loyalty_reservation_allocations(reservation_id,wallet_id,lot_id,ordinal,points) VALUES (?,?,?,1,?)", reservationId, walletId, lotId, points)
            jdbc.update("UPDATE loyalty_lot_partitions SET free=free-?, held=held+? WHERE lot_id=?", points, points, lotId)
            jdbc.update("INSERT INTO loyalty_reservation_states(reservation_id,wallet_id,state,revision) VALUES (?,?,'QUOTED',0)", reservationId, walletId)
            jdbc.update("INSERT INTO loyalty_reservation_history(reservation_id,wallet_id,revision,from_state,to_state,recorded_at) VALUES (?,?,0,NULL,'QUOTED',?)", reservationId, walletId, Timestamp.from(createdAt))
            jdbc.update("UPDATE loyalty_wallets SET revision=revision+1 WHERE id=?", walletId)
            jdbc.update(
                "INSERT INTO loyalty_quote_snapshots(reservation_id,cart_fingerprint,snapshot_hash,policy_version,snapshot_revision,wallet_revision_before,wallet_revision_after,selected_points,discount_minor) VALUES (?,?,?,'loyalty-policy-v1',0,?,?,?,?)",
                reservationId, fp.value, quoteEvidence.hash.value, walletRev, walletRev + 1L, points, quoteEvidence.discount.value,
            )
            quoteEvidence.lines.forEach { fl ->
                jdbc.update(
                    """INSERT INTO loyalty_quote_lines(
                         reservation_id,cart_item_id,variant_id,profile_id,profile_revision,quantity,
                         original_unit_minor,effective_unit_minor,gross_minor,merchandise_minor,excluded_tax_minor,
                         eligible_minor,classification,existing_discount_state,snapshot_revision
                       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)""",
                    reservationId, fl.cart.cartItemId, fl.cart.variantId, fl.source.id, fl.source.revision.value,
                    fl.cart.quantity, fl.cart.originalUnitPrice.value, fl.cart.effectiveUnitPrice.value,
                    fl.grossLineBeforeLoyalty.value, fl.merchandiseExcludingTax.value, fl.excludedTax.value,
                    fl.eligiblePreRedemption.value, fl.source.classification.wire, fl.cart.discountState.wire,
                )
            }
        }
        return reservationId
    }

    @TestConfiguration
    open class Fakes {
        @Bean
        @Primary
        open fun testLoyaltyAdmission(delegate: JdbcLoyaltyActionAdmission): LoyaltyActionAdmissionPort =
            object : LoyaltyActionAdmissionPort {
                override fun admit(action: LoyaltyAction, actor: CapabilityActor): LoyaltyAdmissionDecision =
                    if (admitBindOverride.get() && action == LoyaltyAction.BIND_CHECKOUT) {
                        LoyaltyAdmissionDecision.Admitted
                    } else {
                        delegate.admit(action, actor)
                    }
            }

        @Bean
        @Primary
        open fun testWebhookSignatures(): OfficialWebhookSignaturePort = object : OfficialWebhookSignaturePort {
            override fun configured() = true
            override fun validate(xSignature: String?, xRequestId: String?, queryDataId: String?) = WebhookSignatureDecision.Accepted
        }

        @Bean
        @Primary
        open fun testOfficialOrders(): OfficialOrderPortFake = OfficialOrderPortFake()

        class OfficialOrderPortFake : OfficialOrderQueryPort, OfficialOrderCommandPort {
            override fun configured() = true
            override fun getByProviderOrderId(providerOrderId: String): OfficialOrderResource? = null
            override fun create(request: OfficialOrderCreateRequest): CreationObservation {
                lastCreateRequest.set(request)
                return CreationObservation.VerifiedSuccess("MP-${request.externalReference}", nextCheckoutUrl.get())
            }
            override fun search(query: OfficialOrderSearchQuery) = OfficialOrderSearchResult(emptyList(), 1, true)
        }

        companion object {
            val admitBindOverride = AtomicBoolean(true)
            val lastCreateRequest = AtomicReference<OfficialOrderCreateRequest?>(null)
            val nextCheckoutUrl = AtomicReference("https://www.mercadopago.com.ar/checkout/test-ord")
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
