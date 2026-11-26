package com.storecore.channelreporting

import com.storecore.channelreporting.infrastructure.*
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue
import java.lang.reflect.Modifier

class ChannelReportCsvTest {
    @Test fun `CSV vocabulary is closed and header owns exactly fifty ordered columns`() {
        assertEquals(50, ChannelReportCsvColumn.entries.size)
        assertEquals(ChannelReportCsvRecordKind.STATUS, ChannelReportCsvRecordKind.fromWire("STATUS"))
        assertEquals(ChannelReportCsvRecordKind.UNKNOWN, ChannelReportCsvRecordKind.fromWire("FUTURE"))
        assertEquals(ChannelReportCsvMetric.CREATED_ORDERS, ChannelReportCsvMetric.fromWire("createdOrders"))
        assertEquals(ChannelReportCsvMetric.UNKNOWN, ChannelReportCsvMetric.fromWire("created-orders"))
        assertEquals(
            "recordKind,metric,part,csvVersion,contractVersion,reportFromDate,reportToDateExclusive," +
                "reportTimezone,reportFromInclusive,reportToExclusive,reportGeneratedAt,reportPeriodToken," +
                "availability,reason,evidenceSource,evidenceTimeBasis,evidenceObservedAt,evidenceFreshness," +
                "evidenceFromInclusive,evidenceToExclusive,evidencePeriodToken,empty,entityId,sku,name,label," +
                "state,eventType,channel,count,units,quantityDeltaSum,nominalTotal,confirmedGross,currency," +
                "merchandiseSubtotal,shippingAmount,availableQuantity,safetyStock,sellableQuantity,sellableUnits," +
                "zeroSellableVariantCount,revokedHistoryCount,restockUnits,damagedUnits,rejectedUnits,activityAt," +
                "catalogToken,total,truncated\r\n",
            ChannelReportCsvEncoder.header(),
        )
    }

    @Test fun `typed cells preserve signed quantities while open text is formula protected before RFC quoting`() {
        assertEquals("-7", ChannelReportCsvEncoder.encodeCell(ChannelReportCsvCell.signed("-7")!!))
        assertEquals("1234.50", ChannelReportCsvEncoder.encodeCell(ChannelReportCsvCell.money("1234.50")!!))
        assertEquals("\"' =2+2, tool \"\"A\"\"\"", ChannelReportCsvEncoder.encodeCell(ChannelReportCsvCell.openText(" =2+2, tool \"A\"")))
        assertEquals("\"line\r\nbreak\"", ChannelReportCsvEncoder.encodeCell(ChannelReportCsvCell.openText("line\r\nbreak")))
        assertNull(ChannelReportCsvCell.unsigned("01"))
        assertNull(ChannelReportCsvCell.signed("-0"))
        assertNull(ChannelReportCsvCell.money("1.0"))
    }

    @Test fun `raw canonical cell construction cannot bypass formula protection`() {
        assertTrue(ChannelReportCsvCell::class.java.declaredConstructors.all { it.isSynthetic || Modifier.isPrivate(it.modifiers) })
        assertNull(ChannelReportCsvCell.unsigned("=2+2"))
        assertNull(ChannelReportCsvCell.signed("+2"))
        assertNull(ChannelReportCsvCell.money("@SUM(A1:A2)"))
        assertEquals("'=2+2", ChannelReportCsvEncoder.encodeCell(ChannelReportCsvCell.openText("=2+2")))
    }

    @Test fun `record fills every inapplicable column and forbids reserved field overrides`() {
        val record = ChannelReportCsvRecord.create(
            ChannelReportCsvRecordKind.VALUE,
            ChannelReportCsvMetric.CREATED_ORDERS,
            ChannelReportCsvPart.ROOT,
            mapOf(
                ChannelReportCsvColumn.COUNT to ChannelReportCsvCell.unsigned("2")!!,
                ChannelReportCsvColumn.NOMINAL_TOTAL to ChannelReportCsvCell.money("1234.50")!!,
            ),
        )!!
        assertEquals(50, record.cells.size)
        assertEquals("VALUE", record.cells[ChannelReportCsvColumn.RECORD_KIND.ordinal].wire)
        assertEquals("createdOrders", record.cells[ChannelReportCsvColumn.METRIC.ordinal].wire)
        assertEquals("", record.cells[ChannelReportCsvColumn.SKU.ordinal].wire)
        assertTrue(ChannelReportCsvEncoder.record(record).endsWith("\r\n"))
        assertNull(ChannelReportCsvRecord.create(
            ChannelReportCsvRecordKind.VALUE,
            ChannelReportCsvMetric.CREATED_ORDERS,
            ChannelReportCsvPart.ROOT,
            mapOf(ChannelReportCsvColumn.RECORD_KIND to ChannelReportCsvCell.openText("STATUS")),
        ))
    }
}
