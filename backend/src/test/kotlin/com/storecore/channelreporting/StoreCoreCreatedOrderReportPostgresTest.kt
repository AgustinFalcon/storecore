package com.storecore.channelreporting

import com.storecore.channelreporting.application.StoreCoreCreatedOrderReadResult
import com.storecore.channelreporting.application.ReportPaymentDisposition
import com.storecore.channelreporting.application.ReportInventoryChannel
import com.storecore.channelreporting.application.ReportInventoryEventType
import com.storecore.channelreporting.domain.ReportEvidence
import com.storecore.channelreporting.domain.ReportValue
import com.storecore.channelreporting.infrastructure.JdbcStoreCoreCreatedOrderReportRepository
import com.storecore.channelreporting.infrastructure.Sha256ReportPeriodHasher
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.datasource.DataSourceTransactionManager
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import org.testcontainers.containers.PostgreSQLContainer
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource
import kotlin.test.assertEquals
import kotlin.test.assertIs

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = ["storecore.installation-guard.enabled=false"])
class StoreCoreCreatedOrderReportPostgresTest(
    @Autowired private val jdbc: JdbcTemplate,
    @Autowired private val source: DataSource,
) {
    private val repository = JdbcStoreCoreCreatedOrderReportRepository(source, Sha256ReportPeriodHasher())

    @BeforeEach fun configureMerchant() {
        jdbc.update("""INSERT INTO installation_settings(installation_id,business_name,allowed_host,timezone)
            VALUES (1,'Reporting Test','localhost','America/Argentina/Buenos_Aires')
            ON CONFLICT (installation_id) DO UPDATE SET timezone=EXCLUDED.timezone""")
    }

    @Test fun `created order cohort is nominal and uses exact exclusive merchant boundaries`() {
        order("2026-11-01T03:00:00Z", "100.00")
        order("2026-11-30T23:59:59Z", "60.50")
        order("2026-12-01T03:00:00Z", "999.00")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2026-11-01", "2026-12-01"))
        val available = assertIs<ReportValue.Available<*>>(found.report.createdOrders)
        assertEquals("2", found.report.createdOrdersValue()!!.count.wire)
        assertEquals("160.50", found.report.createdOrdersValue()!!.nominalTotal.wire)
        assertEquals(Instant.parse("2026-11-01T03:00:00Z"), found.report.period.fromInclusive)
        assertEquals(Instant.parse("2026-12-01T03:00:00Z"), found.report.period.toExclusive)
        assertEquals(found.report.period.token, (available.evidence as ReportEvidence.Period).period.token)
    }

    @Test fun `empty authoritative cohort is available zero while invalid period and timezone fail closed`() {
        val empty = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2025-01-01", "2025-01-02"))
        assertEquals("0", empty.report.createdOrdersValue()!!.count.wire)
        assertEquals("0.00", empty.report.createdOrdersValue()!!.nominalTotal.wire)
        assertIs<StoreCoreCreatedOrderReadResult.InvalidPeriod>(repository.read("2025-01-01", "2025-01-01"))
        jdbc.update("UPDATE installation_settings SET timezone='+03:00' WHERE installation_id=1")
        assertIs<StoreCoreCreatedOrderReadResult.TimezoneUnavailable>(repository.read("2025-01-01", "2025-01-02"))
    }

    @Test fun `report owns a repeatable read read only snapshot even inside a weaker transaction`() {
        val outer = TransactionTemplate(DataSourceTransactionManager(source)).apply {
            isolationLevel = TransactionDefinition.ISOLATION_READ_COMMITTED
            isReadOnly = false
        }

        val result = outer.execute {
            repository.read("2025-01-01", "2025-01-02")
        }

        assertIs<StoreCoreCreatedOrderReadResult.Found>(result)
    }

    @Test fun `late valid accreditation uses applied time and feeds bounded gross best sellers`() {
        val order = order("2024-10-15T12:00:00Z", "310.00", "300.00", "10.00")
        val variant = soldItem(order, 3, "Historic Drill", "DRILL-HIST")
        accreditation(order, "310.00", "2024-11-01T03:00:00Z", "APPROVED")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2024-11-01", "2024-12-01"))
        val payments = found.report.appliedAccreditationsValue()!!
        assertEquals("1", payments.count.wire)
        assertEquals("310.00", payments.confirmedGross.wire)
        assertEquals("300.00", payments.merchandiseSubtotal.wire)
        assertEquals("10.00", payments.shippingAmount.wire)
        val sellers = found.report.bestSellersValue()!!
        assertEquals("1", sellers.total.wire)
        assertEquals(false, sellers.truncated)
        assertEquals(variant.toString(), sellers.items.single().variantId.wire)
        assertEquals("3", sellers.items.single().grossUnits.wire)
        assertEquals("Historic Drill", sellers.items.single().name)
        assertEquals("DRILL-HIST", sellers.items.single().sku)
    }

    @Test fun `contradictory applied accreditation fails the aggregate closed`() {
        val order = order("2023-10-15T12:00:00Z", "110.00", "100.00", "10.00")
        soldItem(order, 1, "Contradictory Drill", "DRILL-BAD")
        accreditation(order, "110.00", "2023-11-01T03:00:00Z", "PENDING")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2023-11-01", "2023-12-01"))
        assertIs<ReportValue.Unavailable>(found.report.appliedAccreditations)
        assertIs<ReportValue.Unavailable>(found.report.bestSellers)
    }

    @Test fun `nullable provider identity cannot disappear as an available zero`() {
        val order = order("2022-10-15T12:00:00Z", "100.00")
        soldItem(order, 1, "Null Provider Drill", "DRILL-NULL")
        accreditation(order, "100.00", "2022-11-01T03:00:00Z", "APPROVED", attemptProviderPresent = false)

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2022-11-01", "2022-12-01"))
        assertIs<ReportValue.Unavailable>(found.report.appliedAccreditations)
    }

    @Test fun `legitimate cancelled prior attempt does not poison later accreditation`() {
        val order = order("2020-10-15T12:00:00Z", "100.00")
        soldItem(order, 1, "Retry Drill", "DRILL-RETRY")
        cancelledAttempt(order, "100.00")
        accreditation(order, "100.00", "2020-11-01T03:00:00Z", "APPROVED")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2020-11-01", "2020-12-01"))
        assertEquals("1", found.report.appliedAccreditationsValue()!!.count.wire)
    }

    @Test fun `best seller keeps latest immutable historical tuple across ordinary rename`() {
        val firstOrder = order("2019-10-01T12:00:00Z", "100.00")
        val variant = soldItem(firstOrder, 1, "Drill Original", "DRILL-RENAMED")
        accreditation(firstOrder, "100.00", "2019-11-01T03:00:00Z", "APPROVED")
        val secondOrder = order("2019-10-02T12:00:00Z", "200.00")
        soldItem(secondOrder, 2, "Drill Renamed", "DRILL-RENAMED", variant)
        accreditation(secondOrder, "200.00", "2019-11-02T03:00:00Z", "APPROVED")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2019-11-01", "2019-12-01"))
        val item = found.report.bestSellersValue()!!.items.single()
        assertEquals("3", item.grossUnits.wire)
        assertEquals("Drill Renamed", item.name)
    }

    @Test fun `non textual historical snapshot fails only best seller projection closed`() {
        val order = order("2018-10-15T12:00:00Z", "100.00")
        soldItem(order, 1, "Typed Drill", "DRILL-TYPED", snapshotOverride = "{\"sku\":123,\"name\":true}")
        accreditation(order, "100.00", "2018-11-01T03:00:00Z", "APPROVED")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2018-11-01", "2018-12-01"))
        assertIs<ReportValue.Available<*>>(found.report.appliedAccreditations)
        assertIs<ReportValue.Unavailable>(found.report.bestSellers)
    }

    @Test fun `accreditation without item evidence keeps gross but not best sellers`() {
        val order = order("2017-10-15T12:00:00Z", "100.00")
        accreditation(order, "100.00", "2017-11-01T03:00:00Z", "APPROVED")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2017-11-01", "2017-12-01"))
        assertIs<ReportValue.Available<*>>(found.report.appliedAccreditations)
        assertIs<ReportValue.Unavailable>(found.report.bestSellers)
    }

    @Test fun `best sellers expose exact total truncate at twenty and break unit ties by variant id`() {
        val order = order("2016-10-15T12:00:00Z", "2100.00")
        val variants = (1..21).map { index -> soldItem(order, 1, "Tool $index", "TOOL-$index") }
        accreditation(order, "2100.00", "2016-11-01T03:00:00Z", "APPROVED")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2016-11-01", "2016-12-01"))
        val sellers = found.report.bestSellersValue()!!
        assertEquals("21", sellers.total.wire)
        assertEquals(true, sellers.truncated)
        assertEquals(20, sellers.items.size)
        assertEquals(variants.sorted().take(20).map(Long::toString), sellers.items.map { it.variantId.wire })
    }

    @Test fun `invalid historical text outside top twenty still fails complete ranking closed`() {
        val order = order("2015-10-15T12:00:00Z", "2100.00")
        (1..20).forEach { index -> soldItem(order, 1, "Valid Tool $index", "VALID-$index") }
        soldItem(order, 1, "\tInvalid Tail", "INVALID-TAIL")
        accreditation(order, "2100.00", "2015-11-01T03:00:00Z", "APPROVED")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2015-11-01", "2015-12-01"))
        assertIs<ReportValue.Unavailable>(found.report.bestSellers)
    }

    @Test fun `open stock incident preserves proven historical gross accreditation`() {
        val order = order("2014-10-15T12:00:00Z", "100.00")
        soldItem(order, 1, "Out Of Stock Drill", "DRILL-STOCK")
        val attempt = accreditation(order, "100.00", "2014-11-01T03:00:00Z", "APPROVED")
        jdbc.update(
            """INSERT INTO mp_order_incidents(attempt_id,order_id,kind,review_status,evidence_redacted)
               VALUES (?,?,'PAID_WITHOUT_STOCK','OPEN','{}')""",
            attempt, order,
        )

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2014-11-01", "2014-12-01"))
        assertEquals("1", found.report.appliedAccreditationsValue()!!.count.wire)
        assertEquals("100.00", found.report.appliedAccreditationsValue()!!.confirmedGross.wire)
        val createdCohort = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2014-10-01", "2014-11-01"))
        assertIs<ReportValue.Unavailable>(createdCohort.report.paymentDisposition)
    }

    @Test fun `payment disposition classifies the created order cohort with strict authority`() {
        val pending = order("2013-11-05T12:00:00Z", "100.00")
        rawPayment(pending, "100.00", "PENDING")
        val approved = order("2013-11-06T12:00:00Z", "100.00")
        soldItem(approved, 1, "Approved Drill", "DRILL-APPROVED")
        accreditation(approved, "100.00", "2013-11-07T12:00:00Z", "APPROVED")
        jdbc.update("UPDATE orders SET status='PAID' WHERE id=?", approved)

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2013-11-01", "2013-12-01"))
        val disposition = found.report.paymentDispositionValue()!!
        assertEquals("1", disposition.count(ReportPaymentDisposition.PENDING).wire)
        assertEquals("1", disposition.count(ReportPaymentDisposition.APPROVED).wire)
        assertEquals("0", disposition.count(ReportPaymentDisposition.REJECTED).wire)
    }

    @Test fun `orphan approved payment makes complete disposition unavailable`() {
        val order = order("2012-11-05T12:00:00Z", "100.00")
        rawPayment(order, "100.00", "APPROVED")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2012-11-01", "2012-12-01"))
        assertIs<ReportValue.Unavailable>(found.report.paymentDisposition)
    }

    @Test fun `current terminal credited status is retained when order projection becomes inconsistent`() {
        val order = order("2011-11-05T12:00:00Z", "100.00")
        soldItem(order, 1, "Refunded Drill", "DRILL-REFUNDED")
        accreditation(order, "100.00", "2011-11-06T12:00:00Z", "REFUNDED")
        jdbc.update("UPDATE orders SET status='PAID' WHERE id=?", order)

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2011-11-01", "2011-12-01"))
        val disposition = found.report.paymentDispositionValue()!!
        assertEquals("1", disposition.count(ReportPaymentDisposition.REFUNDED).wire)
    }

    @Test fun `pending credited row cannot be promoted by resolved reversal evidence`() {
        val order = order("2010-11-05T12:00:00Z", "100.00")
        soldItem(order, 1, "Pending Drill", "DRILL-PENDING")
        val attempt = accreditation(order, "100.00", "2010-11-06T12:00:00Z", "PENDING")
        val provider = jdbc.queryForObject("SELECT provider_order_id FROM mp_checkout_attempts WHERE id=?", String::class.java, attempt)!!
        jdbc.update(
            """INSERT INTO mp_order_reversal_cases(attempt_id,provider_order_id,provider_refund_id,kind,review_status,evidence_redacted)
               VALUES (?,?,?,'REFUND_TOTAL','RESOLVED','{}')""",
            attempt, provider, "report-refund-${UUID.randomUUID()}",
        )

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2010-11-01", "2010-12-01"))
        assertIs<ReportValue.Unavailable>(found.report.paymentDisposition)
    }

    @Test fun `inventory movements stay grouped by event semantics and low stock is a current bounded snapshot`() {
        val variant = inventoryVariant("LOW-STOCK", "Low Stock Drill")
        jdbc.update("INSERT INTO inventory_balances(variant_id,available_quantity,reserved_quantity,safety_stock) SELECT id,10,0,0 FROM product_variants ON CONFLICT(variant_id) DO NOTHING")
        jdbc.update("UPDATE inventory_balances SET available_quantity=0,safety_stock=5 WHERE variant_id=?", variant)
        ledger(variant, "RESERVATION", "WEB", -2, "2009-11-02T12:00:00Z")
        ledger(variant, "RELEASE", "WEB", 1, "2009-11-03T12:00:00Z")
        ledger(variant, "RMA_RESTOCK", "INTERNAL", 4, "2009-11-04T12:00:00Z")
        ledger(variant, "STOCK_COMMIT_EXTERNAL", "EXTERNAL_BLACKSTORE", -3, "2009-11-05T12:00:00Z")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2009-11-01", "2009-12-01"))
        val movement = found.report.inventoryMovementsValue()!!
        assertEquals("-2", movement.quantity(ReportInventoryEventType.RESERVATION, ReportInventoryChannel.WEB).wire)
        assertEquals("1", movement.quantity(ReportInventoryEventType.RELEASE, ReportInventoryChannel.WEB).wire)
        assertEquals("4", movement.quantity(ReportInventoryEventType.RMA_RESTOCK, ReportInventoryChannel.INTERNAL).wire)
        assertEquals("-3", movement.quantity(ReportInventoryEventType.STOCK_COMMIT_EXTERNAL, ReportInventoryChannel.EXTERNAL_BLACKSTORE).wire)
        val low = found.report.lowStockValue()!!
        assertEquals(variant.toString(), low.items.first { it.variantId.wire == variant.toString() }.variantId.wire)
        assertEquals("0", low.items.first { it.variantId.wire == variant.toString() }.availableQuantity.wire)
    }

    @Test fun `low stock validates the full cohort and truncates fifty by durable identity`() {
        val variants = (1..51).map { inventoryVariant("BOUND-$it", "Bound Tool $it") }
        jdbc.update("INSERT INTO inventory_balances(variant_id,available_quantity,reserved_quantity,safety_stock) SELECT id,10,0,0 FROM product_variants ON CONFLICT(variant_id) DO NOTHING")
        jdbc.update("UPDATE inventory_balances SET available_quantity=10,safety_stock=0")
        variants.forEach { jdbc.update("UPDATE inventory_balances SET available_quantity=1,safety_stock=1 WHERE variant_id=?", it) }

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2007-11-01", "2007-12-01"))
        val low = found.report.lowStockValue()!!
        assertEquals("51", low.total.wire)
        assertEquals(true, low.truncated)
        assertEquals(variants.sorted().take(50).map(Long::toString), low.items.map { it.variantId.wire })

        val tailProduct = jdbc.queryForObject(
            "SELECT product_id FROM product_variants WHERE id=?",
            Long::class.java,
            variants.max(),
        )!!
        jdbc.update("UPDATE products SET name=? WHERE id=?", "\tInvalid tail", tailProduct)
        val invalid = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2007-11-01", "2007-12-01"))
        assertIs<ReportValue.Unavailable>(invalid.report.lowStock)
        jdbc.update("UPDATE products SET name=? WHERE id=?", "Bound Tool 51", tailProduct)
    }

    @Test fun `missing active inventory balance makes low stock unavailable instead of zero`() {
        inventoryVariant("MISSING-BALANCE", "Missing Balance Drill")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2008-11-01", "2008-12-01"))
        assertIs<ReportValue.Unavailable>(found.report.lowStock)
    }

    @Test fun `return receipt is reread after restatement while confirmed disposition uses immutable confirmation time`() {
        val order = order("2026-02-01T12:00:00Z", "200.00")
        val variant = soldItem(order, 2, "Return Drill", "RETURN-DRILL")
        val orderItem = jdbc.queryForObject("SELECT id FROM order_items WHERE order_id=?", Long::class.java, order)!!
        val returned = jdbc.queryForObject(
            """INSERT INTO returns(rma_number,order_id,status,received_at,created_at,updated_at)
               VALUES (?,?,'RETURN_RECEIVED','2026-03-10T12:00:00Z','2026-03-09T12:00:00Z','2026-03-10T12:00:00Z') RETURNING id""",
            Long::class.java,
            "RMA-${UUID.randomUUID()}",
            order,
        )!!
        val returnItem = jdbc.queryForObject(
            "INSERT INTO return_items(return_id,order_item_id,quantity) VALUES (?,?,1) RETURNING id",
            Long::class.java,
            returned,
            orderItem,
        )!!

        val first = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2026-03-01", "2026-04-01"))
        assertEquals("1", first.report.returnReceiptsValue()!!.returnCount.wire)
        assertEquals("1", first.report.returnReceiptsValue()!!.returnedUnits.wire)
        assertEquals("0", first.report.confirmedReturnDispositionValue()!!.restockUnits.wire)

        jdbc.update("UPDATE return_items SET quantity=2 WHERE id=?", returnItem)
        val restated = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2026-03-01", "2026-04-01"))
        assertEquals("2", restated.report.returnReceiptsValue()!!.returnedUnits.wire)

        val actor = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?, 'Report','Admin') RETURNING id",
            Long::class.java,
            "return-report-${UUID.randomUUID()}@example.com",
            "\$argon2id\$fixture",
        )!!
        val command = jdbc.queryForObject(
            """INSERT INTO rma_disposition_commands(return_id,idempotency_key,request_hash,actor_id,confirmed_at,result)
               VALUES (?,?,?,?,'2026-04-05T12:00:00Z','{}') RETURNING id""",
            Long::class.java,
            returned,
            UUID.randomUUID(),
            UUID.randomUUID().toString().replace("-", "").padEnd(64, '0'),
            actor,
        )!!
        val ledger = jdbc.queryForObject(
            """INSERT INTO inventory_ledger(variant_id,event_idempotency_key,event_type,channel,quantity_delta,actor,created_at)
               VALUES (?,?,'RMA_RESTOCK','INTERNAL',1,'REPORT_TEST','2026-04-05T12:00:00Z') RETURNING id""",
            Long::class.java,
            variant,
            UUID.randomUUID(),
        )!!
        jdbc.update(
            """UPDATE return_items SET disposition_command_id=?,restock_quantity=1,damaged_quantity=1,rejected_quantity=0,
               damage_reason='COSMETIC',rejection_reason=NULL,adjustment_ledger_id=? WHERE id=?""",
            command,
            ledger,
            returnItem,
        )
        jdbc.update("UPDATE returns SET status='CLOSED',updated_at='2026-04-05T12:00:00Z' WHERE id=?", returned)

        val disposition = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2026-04-01", "2026-05-01"))
        assertEquals("1", disposition.report.confirmedReturnDispositionValue()!!.restockUnits.wire)
        assertEquals("1", disposition.report.confirmedReturnDispositionValue()!!.damagedUnits.wire)
        assertEquals("0", disposition.report.confirmedReturnDispositionValue()!!.rejectedUnits.wire)
        assertIs<ReportValue.NotAvailable>(disposition.report.netRevenue)
        assertIs<ReportValue.NotAvailable>(disposition.report.reversalAmount)
        assertIs<ReportValue.NotAvailable>(disposition.report.fiscalTotal)
    }

    @Test fun `return item attached to a different order makes receipt metric unavailable`() {
        val returnOrder = order("2006-02-01T12:00:00Z", "100.00")
        val otherOrder = order("2006-02-02T12:00:00Z", "100.00")
        soldItem(returnOrder, 1, "Expected Drill", "EXPECTED")
        soldItem(otherOrder, 1, "Foreign Drill", "FOREIGN")
        val foreignItem = jdbc.queryForObject("SELECT id FROM order_items WHERE order_id=?", Long::class.java, otherOrder)!!
        val returned = jdbc.queryForObject(
            """INSERT INTO returns(rma_number,order_id,status,received_at,created_at,updated_at)
               VALUES (?,?,'RETURN_RECEIVED','2006-03-10T12:00:00Z','2006-03-09T12:00:00Z','2006-03-10T12:00:00Z') RETURNING id""",
            Long::class.java,
            "RMA-${UUID.randomUUID()}",
            returnOrder,
        )!!
        jdbc.update("INSERT INTO return_items(return_id,order_item_id,quantity) VALUES (?,?,1)", returned, foreignItem)

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2006-03-01", "2006-04-01"))
        assertIs<ReportValue.Unavailable>(found.report.returnReceipts)
    }

    @Test fun `received state without receipt time cannot disappear as an available zero`() {
        val order = order("2005-02-01T12:00:00Z", "100.00")
        val returned = jdbc.queryForObject(
            "INSERT INTO returns(rma_number,order_id,status,received_at) VALUES (?,?,'RETURN_RECEIVED',NULL) RETURNING id",
            Long::class.java,
            "RMA-${UUID.randomUUID()}",
            order,
        )!!

        val result = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2005-03-01", "2005-04-01"))
        jdbc.update("UPDATE returns SET status='REQUESTED' WHERE id=?", returned)
        assertIs<ReportValue.Unavailable>(result.report.returnReceipts)
    }

    @Test fun `confirmed disposition rejects quantities above sold and incomplete order item sets`() {
        val excessiveOrder = order("2004-01-01T12:00:00Z", "200.00")
        val excessiveVariant = soldItem(excessiveOrder, 2, "Excess Drill", "EXCESS")
        val excessiveOrderItem = jdbc.queryForObject("SELECT id FROM order_items WHERE order_id=?", Long::class.java, excessiveOrder)!!
        val excessiveReturn = jdbc.queryForObject(
            """INSERT INTO returns(rma_number,order_id,status,received_at,created_at,updated_at)
               VALUES (?,?,'CLOSED','2004-02-01T12:00:00Z','2004-01-02T12:00:00Z','2004-03-01T12:00:00Z') RETURNING id""",
            Long::class.java,
            "RMA-${UUID.randomUUID()}",
            excessiveOrder,
        )!!
        val excessiveReturnItem = jdbc.queryForObject(
            "INSERT INTO return_items(return_id,order_item_id,quantity) VALUES (?,?,3) RETURNING id",
            Long::class.java,
            excessiveReturn,
            excessiveOrderItem,
        )!!
        confirmRestock(excessiveReturn, excessiveReturnItem, excessiveVariant, 3, "2004-03-01T12:00:00Z")
        val excessive = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2004-03-01", "2004-04-01"))
        assertIs<ReportValue.Unavailable>(excessive.report.confirmedReturnDisposition)

        val incompleteOrder = order("2003-01-01T12:00:00Z", "200.00")
        val includedVariant = soldItem(incompleteOrder, 1, "Included Drill", "INCLUDED")
        soldItem(incompleteOrder, 1, "Missing Drill", "MISSING")
        val includedOrderItem = jdbc.queryForObject(
            "SELECT id FROM order_items WHERE order_id=? ORDER BY id LIMIT 1",
            Long::class.java,
            incompleteOrder,
        )!!
        val incompleteReturn = jdbc.queryForObject(
            """INSERT INTO returns(rma_number,order_id,status,received_at,created_at,updated_at)
               VALUES (?,?,'CLOSED','2003-02-01T12:00:00Z','2003-01-02T12:00:00Z','2003-03-01T12:00:00Z') RETURNING id""",
            Long::class.java,
            "RMA-${UUID.randomUUID()}",
            incompleteOrder,
        )!!
        val includedReturnItem = jdbc.queryForObject(
            "INSERT INTO return_items(return_id,order_item_id,quantity) VALUES (?,?,1) RETURNING id",
            Long::class.java,
            incompleteReturn,
            includedOrderItem,
        )!!
        confirmRestock(incompleteReturn, includedReturnItem, includedVariant, 1, "2003-03-01T12:00:00Z")
        val incomplete = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2003-03-01", "2003-04-01"))
        assertIs<ReportValue.Unavailable>(incomplete.report.confirmedReturnDisposition)
    }

    @Test fun `confirmed disposition rejects receipt before return creation`() {
        val order = order("2002-01-01T12:00:00Z", "100.00")
        val variant = soldItem(order, 1, "Chronology Drill", "CHRONOLOGY")
        val orderItem = jdbc.queryForObject("SELECT id FROM order_items WHERE order_id=?", Long::class.java, order)!!
        val returned = jdbc.queryForObject(
            """INSERT INTO returns(rma_number,order_id,status,received_at,created_at,updated_at)
               VALUES (?,?,'CLOSED','2002-02-01T12:00:00Z','2002-02-02T12:00:00Z','2002-03-01T12:00:00Z') RETURNING id""",
            Long::class.java,
            "RMA-${UUID.randomUUID()}",
            order,
        )!!
        val returnItem = jdbc.queryForObject(
            "INSERT INTO return_items(return_id,order_item_id,quantity) VALUES (?,?,1) RETURNING id",
            Long::class.java,
            returned,
            orderItem,
        )!!
        confirmRestock(returned, returnItem, variant, 1, "2002-03-01T12:00:00Z")

        val found = assertIs<StoreCoreCreatedOrderReadResult.Found>(repository.read("2002-03-01", "2002-04-01"))
        assertIs<ReportValue.Unavailable>(found.report.confirmedReturnDisposition)
    }

    private fun order(createdAt: String, total: String, subtotal: String = total, shipping: String = "0.00"): Long {
        val customer = jdbc.queryForObject(
            "INSERT INTO customers(email,password_hash,first_name,last_name) VALUES (?,?,'Report','Buyer') RETURNING id",
            Long::class.java,
            "report-${UUID.randomUUID()}@example.com",
            "\$argon2id\$v=19\$m=65536,t=3,p=1\$fixture\$fixture",
        )!!
        val key = UUID.randomUUID(); val hash = UUID.randomUUID().toString().replace("-", "").padEnd(64, '0')
        val claim = jdbc.queryForObject(
            "INSERT INTO checkout_idempotency_claims(customer_id,checkout_idempotency_key,request_hash,checkout_snapshot) VALUES (?,?,?,'{}') RETURNING id",
            Long::class.java, customer, key, hash,
        )!!
        return jdbc.queryForObject(
            """INSERT INTO orders(order_number,checkout_claim_id,checkout_idempotency_key,checkout_request_hash,customer_id,status,
                buyer_snapshot,checkout_snapshot,subtotal,shipping_cost,total,created_at,updated_at)
                VALUES (?,?,?,?,?,'CREATED','{}','{}',?::numeric,?::numeric,?::numeric,?::timestamptz,?::timestamptz) RETURNING id""",
            Long::class.java, "RP-${UUID.randomUUID()}", claim, key, hash, customer, subtotal, shipping, total, createdAt, createdAt,
        )!!
    }

    private fun soldItem(
        orderId: Long,
        quantity: Int,
        name: String,
        sku: String,
        existingVariant: Long? = null,
        snapshotOverride: String? = null,
    ): Long {
        val variant = existingVariant ?: run {
            val product = jdbc.queryForObject(
                "INSERT INTO products(name,slug,base_price,status) VALUES (?,?,100,'ACTIVE') RETURNING id",
                Long::class.java, name, "report-${UUID.randomUUID()}",
            )!!
            jdbc.queryForObject(
                "INSERT INTO product_variants(product_id,sku,label) VALUES (?,?,?) RETURNING id",
                Long::class.java, product, sku + UUID.randomUUID().toString().take(6), name,
            )!!
        }
        jdbc.update(
            """INSERT INTO order_items(order_id,variant_id,product_snapshot,quantity,original_unit_price,discount_amount,effective_unit_price,subtotal)
               VALUES (?,?,COALESCE(?::jsonb,jsonb_build_object('sku',?::text,'name',?::text)),?,100,0,100,?::numeric)""",
            orderId, variant, snapshotOverride, sku, name, quantity, (quantity * 100).toString(),
        )
        return variant
    }

    private fun accreditation(orderId: Long, total: String, appliedAt: String, paymentStatus: String, attemptProviderPresent: Boolean = true): Long {
        val payment = jdbc.queryForObject(
            "INSERT INTO payments(order_id,external_reference,status,amount,currency) VALUES (?,?,?,?::numeric,'ARS') RETURNING id",
            Long::class.java, orderId, "report-payment-${UUID.randomUUID()}", paymentStatus, total,
        )!!
        val provider = "report-provider-${UUID.randomUUID()}"
        val attemptNo = jdbc.queryForObject("SELECT count(*)+1 FROM mp_checkout_attempts WHERE order_id=?", Int::class.java, orderId)!!
        val attempt = jdbc.queryForObject(
            """INSERT INTO mp_checkout_attempts(order_id,payment_id,attempt_no,external_reference,idempotency_key,request_hash,
               amount,currency,snapshot,provider_order_id,state)
               VALUES (?,?,?,?,?,?,?::numeric,'ARS','{}',?,'ACCREDITED') RETURNING id""",
            Long::class.java, orderId, payment, attemptNo, "report-attempt-${UUID.randomUUID()}", UUID.randomUUID(),
            UUID.randomUUID().toString().replace("-", "").padEnd(64, '0'), total, provider.takeIf { attemptProviderPresent },
        )!!
        val inbox = jdbc.queryForObject(
            """INSERT INTO mp_order_notification_inbox(raw_topic,query_data_id,provider_order_id_candidate,x_request_id,
               signature_version,signature_result,envelope_redacted,disposition)
               VALUES ('merchant_order',?,?,?,'v1','ACCEPTED','{}','PROCESSABLE') RETURNING id""",
            Long::class.java, provider, provider, "report-request-${UUID.randomUUID()}",
        )!!
        jdbc.update(
            """INSERT INTO mp_order_commercial_applications(inbox_id,attempt_id,order_id,provider_order_id,transition,
               confirmed_amount,confirmed_currency,applied_at)
               VALUES (?,?,?,?,'PAYMENT_ACCREDITED',?::numeric,'ARS',?::timestamptz)""",
            inbox, attempt, orderId, provider, total, appliedAt,
        )
        return attempt
    }

    private fun cancelledAttempt(orderId: Long, total: String) {
        val payment = jdbc.queryForObject(
            "INSERT INTO payments(order_id,external_reference,status,amount,currency) VALUES (?,?,'CANCELLED',?::numeric,'ARS') RETURNING id",
            Long::class.java, orderId, "report-cancelled-${UUID.randomUUID()}", total,
        )!!
        jdbc.update(
            """INSERT INTO mp_checkout_attempts(order_id,payment_id,attempt_no,external_reference,idempotency_key,request_hash,
               amount,currency,snapshot,state)
               VALUES (?,?,1,?,?,?,?::numeric,'ARS','{}','TERMINAL_UNPAID_VERIFIED')""",
            orderId, payment, "report-cancelled-attempt-${UUID.randomUUID()}", UUID.randomUUID(),
            UUID.randomUUID().toString().replace("-", "").padEnd(64, '0'), total,
        )
    }

    private fun rawPayment(orderId: Long, total: String, status: String): Long = jdbc.queryForObject(
        "INSERT INTO payments(order_id,external_reference,status,amount,currency) VALUES (?,?,?,?::numeric,'ARS') RETURNING id",
        Long::class.java, orderId, "report-raw-${UUID.randomUUID()}", status, total,
    )!!

    private fun inventoryVariant(sku: String, name: String): Long {
        val product = jdbc.queryForObject(
            "INSERT INTO products(name,slug,base_price,status) VALUES (?,?,100,'ACTIVE') RETURNING id",
            Long::class.java, name, "inventory-${UUID.randomUUID()}",
        )!!
        return jdbc.queryForObject(
            "INSERT INTO product_variants(product_id,sku,label,active) VALUES (?,?,?,TRUE) RETURNING id",
            Long::class.java, product, sku + UUID.randomUUID().toString().take(6), name,
        )!!
    }

    private fun ledger(variantId: Long, eventType: String, channel: String, delta: Int, createdAt: String) {
        jdbc.update(
            """INSERT INTO inventory_ledger(variant_id,event_idempotency_key,event_type,channel,quantity_delta,actor,created_at)
               VALUES (?,?,?,?,?,'REPORT_TEST',?::timestamptz)""",
            variantId, UUID.randomUUID(), eventType, channel, delta, createdAt,
        )
    }

    private fun confirmRestock(returnId: Long, returnItemId: Long, variantId: Long, quantity: Int, confirmedAt: String) {
        val actor = jdbc.queryForObject(
            "INSERT INTO users(email,password_hash,first_name,last_name) VALUES (?,?, 'Report','Admin') RETURNING id",
            Long::class.java,
            "return-report-${UUID.randomUUID()}@example.com",
            "\$argon2id\$fixture",
        )!!
        val command = jdbc.queryForObject(
            """INSERT INTO rma_disposition_commands(return_id,idempotency_key,request_hash,actor_id,confirmed_at,result)
               VALUES (?,?,?,?,?::timestamptz,'{}') RETURNING id""",
            Long::class.java,
            returnId,
            UUID.randomUUID(),
            UUID.randomUUID().toString().replace("-", "").padEnd(64, '0'),
            actor,
            confirmedAt,
        )!!
        val ledger = jdbc.queryForObject(
            """INSERT INTO inventory_ledger(variant_id,event_idempotency_key,event_type,channel,quantity_delta,actor,created_at)
               VALUES (?,?,'RMA_RESTOCK','INTERNAL',?,'REPORT_TEST',?::timestamptz) RETURNING id""",
            Long::class.java,
            variantId,
            UUID.randomUUID(),
            quantity,
            confirmedAt,
        )!!
        jdbc.update(
            """UPDATE return_items SET disposition_command_id=?,restock_quantity=?,damaged_quantity=0,rejected_quantity=0,
               adjustment_ledger_id=? WHERE id=?""",
            command,
            quantity,
            ledger,
            returnItemId,
        )
    }

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
