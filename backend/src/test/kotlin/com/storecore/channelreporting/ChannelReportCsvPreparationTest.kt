package com.storecore.channelreporting

import com.storecore.channelreporting.application.*
import com.storecore.channelreporting.domain.ReportUnsignedLong
import com.storecore.channelreporting.infrastructure.ChannelReportCsvDataRecordAdmission
import com.storecore.channelreporting.infrastructure.ChannelReportCsvDataRecordBudget
import com.storecore.channelreporting.infrastructure.ChannelReportCsvPlan
import com.storecore.channelreporting.infrastructure.ChannelReportCsvCompleteCollections
import java.math.BigInteger
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChannelReportCsvPreparationTest {
    @Test fun `prepared artifact owns defensive bytes and releases them idempotently`() {
        val source = "evidence".toByteArray()
        val artifact = PreparedChannelReportCsv.create(source)
        source.fill(0)

        val first = artifact.readBytes()!!
        assertContentEquals("evidence".toByteArray(), first)
        first.fill(0)
        assertContentEquals("evidence".toByteArray(), artifact.readBytes())
        assertFalse(artifact.isReleased())

        artifact.close()
        artifact.close()
        assertTrue(artifact.isReleased())
        assertNull(artifact.readBytes())
    }

    @Test fun `record budget admits exactly fifty thousand and rejects the next record without bounded overflow`() {
        val admitted = ChannelReportCsvDataRecordBudget.create(listOf(BigInteger.valueOf(24), BigInteger.valueOf(49_976)))!!
        assertTrue(admitted.matchesPreparedRecordCount(BigInteger.valueOf(50_000)))
        assertFalse(admitted.matchesPreparedRecordCount(BigInteger.valueOf(49_999)))
        assertTrue(admitted.admission == ChannelReportCsvDataRecordAdmission.ADMITTED)

        val rejected = ChannelReportCsvDataRecordBudget.create(listOf(BigInteger.valueOf(50_000), BigInteger.ONE))!!
        assertTrue(rejected.admission == ChannelReportCsvDataRecordAdmission.TOO_LARGE)
        val unbounded = ChannelReportCsvDataRecordBudget.create(listOf(BigInteger.valueOf(Long.MAX_VALUE), BigInteger.ONE))!!
        assertTrue(unbounded.admission == ChannelReportCsvDataRecordAdmission.TOO_LARGE)
        assertNull(ChannelReportCsvDataRecordBudget.create(listOf(BigInteger.ONE.negate())))
    }

    @Test fun `section plan owns twenty four statuses and the available created order value`() {
        val plan = ChannelReportCsvPlan.create(channelReportFixture())!!
        assertTrue(plan.budget.matchesPreparedRecordCount(BigInteger.valueOf(25)))
        val csv = plan.encode()!!.toString(Charsets.UTF_8)
        val records = csv.removeSuffix("\r\n").split("\r\n")

        assertTrue(records.first().startsWith("recordKind,metric,part,"))
        assertTrue(records[1].startsWith("META,,,"))
        assertTrue(records.count { it.startsWith("STATUS,") } == 24)
        assertTrue(records.count { it.startsWith("VALUE,createdOrders,ROOT,") } == 1)
        assertTrue(records.size == 27)
    }

    @Test fun `section plans emit fixed groups scalar values and nested operation activity in contract order`() {
        val plan = ChannelReportCsvPlan.create(channelReportFixture(scalarMetricsAvailable = true))!!
        assertTrue(plan.budget.matchesPreparedRecordCount(BigInteger.valueOf(50)))
        val records = plan.encode()!!.toString(Charsets.UTF_8).removeSuffix("\r\n").split("\r\n")
        val rows = records.drop(2).map { it.split(',') }

        val applied = rows.single { it[0] == "VALUE" && it[1] == "appliedAccreditations" }
        assertEquals(listOf("1", "100.00", "ARS", "90.00", "10.00"), listOf(applied[29], applied[33], applied[34], applied[35], applied[36]))

        val payments = rows.filter { it[0] == "GROUP" && it[1] == "paymentDisposition" }
        assertEquals(listOf("PENDING", "APPROVED", "REJECTED", "CANCELLED", "REFUNDED", "CHARGED_BACK"), payments.map { it[26] })
        assertEquals(listOf("0", "1", "0", "0", "0", "0"), payments.map { it[29] })

        val inventory = rows.filter { it[0] == "GROUP" && it[1] == "inventoryMovements" }
        assertEquals(listOf("RESERVATION" to "INTERNAL", "SALE" to "WEB"), inventory.map { it[27] to it[28] })
        assertEquals(listOf("2" to "-2", "1" to "-1"), inventory.map { it[29] to it[31] })

        val retained = rows.filter { it[0] == "GROUP" && it[1] == "blackStoreOperations" && it[2] == "RETAINED" }
        assertEquals(listOf("PENDING", "RESERVED", "COMMITTED", "RELEASED", "EXPIRED"), retained.map { it[26] })
        val retired = rows.filter { it[0] == "GROUP" && it[1] == "blackStoreOperations" && it[2] == "RETIRED" }
        assertEquals(listOf("COMMITTED", "RELEASED", "EXPIRED"), retired.map { it[26] })

        val retainedActivity = rows.filter { it[1] == "blackStoreOperations" && it[2] == "LATEST_RETAINED_ACTIVITY" }
        assertEquals(listOf("STATUS", "VALUE"), retainedActivity.map { it[0] })
        assertEquals(listOf("BLACKSTORE_STOCK_SAGA", "CURRENT_SNAPSHOT", "CURRENT"), listOf(retainedActivity[0][14], retainedActivity[0][15], retainedActivity[0][17]))
        assertEquals("2026-11-25T19:00:00Z", retainedActivity[1][46])
        val retiredActivity = rows.single { it[0] == "STATUS" && it[1] == "blackStoreOperations" && it[2] == "LATEST_RETIRED_ACTIVITY" }
        assertEquals("UNAVAILABLE", retiredActivity[12])
        assertEquals("NO_EVIDENCE", retiredActivity[13])
        assertTrue(rows.none { it[0] == "VALUE" && it[2] == "LATEST_RETIRED_ACTIVITY" })
        assertTrue(records.size == 52)
    }

    @Test fun `large collection sections count before details then emit complete ordered formula safe items`() {
        val report = channelReportFixture(collectionMetricsAvailable = true)
        val plan = ChannelReportCsvPlan.create(report)!!
        assertTrue(plan.budget.matchesPreparedRecordCount(BigInteger.valueOf(34)))
        assertNull(plan.encode())
        val details = ChannelReportCsvCompleteCollections.create(
            report.bestSellersValue()!!.items,
            report.lowStockValue()!!.items,
            report.blackStoreCurrentStockValue()!!.items,
        )
        val csv = plan.encode(details)!!.toString(Charsets.UTF_8)
        val rows = csv.removeSuffix("\r\n").split("\r\n").drop(2)

        assertTrue(rows.count { it.startsWith("ITEM,bestSellers,ROOT,") } == 2)
        assertTrue(rows.count { it.startsWith("ITEM,lowStock,ROOT,") } == 2)
        assertTrue(rows.count { it.startsWith("ITEM,blackStoreCurrentStock,ROOT,") } == 2)
        assertTrue(csv.contains("'=DRILL-1"))
        assertTrue(csv.contains("'+Low stock drill"))
        assertTrue(csv.contains("'@Red"))
        assertTrue(rows.size == 34)

        val contradictory = ChannelReportCsvCompleteCollections.create(
            listOf(
                BestSellerItem.create(ReportUnsignedLong.fromValue(1)!!, "=DRILL-1", "Drill 1", ReportUnsignedLong.fromValue(99)!!)!!,
                report.bestSellersValue()!!.items[1],
            ),
            report.lowStockValue()!!.items,
            report.blackStoreCurrentStockValue()!!.items,
        )
        assertNull(plan.encode(contradictory))
    }

    @Test fun `collection pre count admits fifty thousand and rejects fifty thousand one without details`() {
        val admitted = ChannelReportCsvPlan.create(channelReportFixture(bestSellerTotal = 49_974))!!
        val rejected = ChannelReportCsvPlan.create(channelReportFixture(bestSellerTotal = 49_975))!!

        assertEquals(ChannelReportCsvDataRecordAdmission.ADMITTED, admitted.budget.admission)
        assertEquals(ChannelReportCsvDataRecordAdmission.TOO_LARGE, rejected.budget.admission)
        assertNull(admitted.encode())
        assertNull(rejected.encode())
    }

    @Test fun `complete export exceeds dashboard limits and preserves every collection row`() {
        val total = 55L
        val report = channelReportFixture(collectionMetricsAvailable = true, collectionTotal = total)
        val plan = ChannelReportCsvPlan.create(report)!!
        val details = ChannelReportCsvCompleteCollections.create(
            bestSellerItems(total), lowStockItems(total), blackStoreStockItems(total),
        )
        val rows = plan.encode(details)!!.toString(Charsets.UTF_8).removeSuffix("\r\n").split("\r\n").drop(2)

        assertEquals(55, rows.count { it.startsWith("ITEM,bestSellers,ROOT,") })
        assertEquals(55, rows.count { it.startsWith("ITEM,lowStock,ROOT,") })
        assertEquals(55, rows.count { it.startsWith("ITEM,blackStoreCurrentStock,ROOT,") })
        for (metric in listOf("bestSellers", "lowStock", "blackStoreCurrentStock")) {
            val summary = rows.single { it.startsWith("VALUE,$metric,ROOT,") }.split(',')
            assertEquals("55", summary[48])
            assertEquals("false", summary[49])
        }
        val best = rows.first { it.startsWith("ITEM,bestSellers,ROOT,") }.split(',')
        assertEquals(listOf("1", "'=DRILL-1", "Drill 1", "", "55"), listOf(best[22], best[23], best[24], best[25], best[30]))
        assertEquals(listOf("", "", ""), listOf(best[37], best[38], best[39]))
        val low = rows.first { it.startsWith("ITEM,lowStock,ROOT,") }.split(',')
        assertEquals(listOf("101", "LOW-1", "'+Low stock drill", "Variant 1"), listOf(low[22], low[23], low[24], low[25]))
        assertEquals(listOf("", "0", "55", ""), listOf(low[30], low[37], low[38], low[39]))
        val stock = rows.first { it.startsWith("ITEM,blackStoreCurrentStock,ROOT,") }.split(',')
        assertEquals(listOf("201", "STOCK-1", "Stock tool 1", "'@Red"), listOf(stock[22], stock[23], stock[24], stock[25]))
        assertEquals(listOf("", "", "", "1"), listOf(stock[30], stock[37], stock[38], stock[39]))
    }

    @Test fun `exact fifty thousand data records prepare completely while next record remains rejected`() {
        val total = 49_974L
        val admitted = ChannelReportCsvPlan.create(channelReportFixture(bestSellerTotal = total))!!
        val bytes = admitted.encode(ChannelReportCsvCompleteCollections.create(bestSellerItems(total), emptyList(), emptyList()))!!
        val recordCount = bytes.toString(Charsets.UTF_8).removeSuffix("\r\n").split("\r\n").size

        assertEquals(50_002, recordCount)
        assertEquals(ChannelReportCsvDataRecordAdmission.TOO_LARGE,
            ChannelReportCsvPlan.create(channelReportFixture(bestSellerTotal = total + 1))!!.budget.admission)
    }

    private fun bestSellerItems(total: Long): List<BestSellerItem> = (1..total.toInt()).map { index ->
        BestSellerItem.create(
            ReportUnsignedLong.fromValue(index.toLong())!!,
            if (index == 1) "=DRILL-$index" else "DRILL-$index",
            "Drill $index",
            ReportUnsignedLong.fromValue(total - index + 1)!!,
        )!!
    }

    private fun lowStockItems(total: Long): List<LowStockItem> = (1..total.toInt()).map { index ->
        LowStockItem.create(
            ReportUnsignedLong.fromValue(100L + index)!!,
            "LOW-$index",
            if (index == 1) "+Low stock drill" else "Low stock tool $index",
            "Variant $index",
            ReportUnsignedLong.fromValue(index.toLong() - 1)!!,
            ReportUnsignedLong.fromValue(total)!!,
        )!!
    }

    private fun blackStoreStockItems(total: Long): List<BlackStoreStockItem> = (1..total.toInt()).map { index ->
        BlackStoreStockItem.create(
            ReportUnsignedLong.fromValue(200L + index)!!,
            "STOCK-$index",
            "Stock tool $index",
            if (index == 1) "@Red" else "Variant $index",
            ReportUnsignedLong.fromValue(1)!!,
        )!!
    }
}
