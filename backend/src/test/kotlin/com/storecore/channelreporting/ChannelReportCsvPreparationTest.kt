package com.storecore.channelreporting

import com.storecore.channelreporting.application.PreparedChannelReportCsv
import com.storecore.channelreporting.infrastructure.ChannelReportCsvDataRecordAdmission
import com.storecore.channelreporting.infrastructure.ChannelReportCsvDataRecordBudget
import com.storecore.channelreporting.infrastructure.ChannelReportCsvPlan
import java.math.BigInteger
import kotlin.test.Test
import kotlin.test.assertContentEquals
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
}
