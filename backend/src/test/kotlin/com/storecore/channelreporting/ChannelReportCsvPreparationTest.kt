package com.storecore.channelreporting

import com.storecore.channelreporting.application.PreparedChannelReportCsv
import com.storecore.channelreporting.infrastructure.ChannelReportCsvDataRecordAdmission
import com.storecore.channelreporting.infrastructure.ChannelReportCsvDataRecordBudget
import com.storecore.channelreporting.infrastructure.ChannelReportCsvPlan
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
}
