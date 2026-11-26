package com.storecore.channelreporting

import com.storecore.channelreporting.application.StoreCoreCreatedOrderReadResult
import com.storecore.channelreporting.application.ChannelReportCsvPreparationRequest
import com.storecore.channelreporting.application.ChannelReportCsvPreparationResult
import com.storecore.channelreporting.domain.ReportUnavailableReason
import com.storecore.channelreporting.domain.ReportPeriodToken
import com.storecore.channelreporting.infrastructure.JdbcStoreCoreCreatedOrderReportRepository
import com.storecore.channelreporting.infrastructure.Sha256ReportPeriodHasher
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import java.sql.SQLException
import javax.sql.DataSource
import kotlin.test.assertEquals
import kotlin.test.assertIs

class StoreCoreCreatedOrderReportFailureTest {
    @Test fun `transaction begin failure is translated to closed read failed result`() {
        val source = mock(DataSource::class.java)
        `when`(source.connection).thenThrow(SQLException("database unavailable"))

        val result = JdbcStoreCoreCreatedOrderReportRepository(source, Sha256ReportPeriodHasher())
            .read("2026-11-01", "2026-11-02")

        val unavailable = assertIs<StoreCoreCreatedOrderReadResult.SourceUnavailable>(result)
        assertEquals(ReportUnavailableReason.READ_FAILED, unavailable.reason)
    }

    @Test fun `transaction begin failure publishes no prepared CSV artifact`() {
        val source = mock(DataSource::class.java)
        `when`(source.connection).thenThrow(SQLException("database unavailable"))
        val request = ChannelReportCsvPreparationRequest.create(
            "2026-11-01", "2026-11-02", ReportPeriodToken.fromWire("a".repeat(64)),
        )!!

        val result = JdbcStoreCoreCreatedOrderReportRepository(source, Sha256ReportPeriodHasher()).prepare(request)

        assertIs<ChannelReportCsvPreparationResult.SourceUnavailable>(result)
    }
}
