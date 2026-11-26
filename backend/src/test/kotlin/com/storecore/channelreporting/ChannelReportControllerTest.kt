package com.storecore.channelreporting

import com.storecore.channelreporting.application.*
import com.storecore.channelreporting.domain.*
import com.storecore.channelreporting.infrastructure.*
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.infrastructure.web.InstallationOrigin
import com.storecore.identity.infrastructure.web.RequestAuth
import org.hamcrest.Matchers.`is`
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.*
import org.springframework.http.HttpHeaders
import org.springframework.transaction.CannotCreateTransactionException
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import java.util.UUID
import java.io.OutputStream
import java.io.IOException
import java.io.ByteArrayOutputStream
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ChannelReportControllerTest {
    private lateinit var auth: RequestAuth
    private val reports = mock(StoreCoreCreatedOrderReportRepository::class.java)
    private val exports = mock(ChannelReportCsvPreparationPort::class.java)
    private val principal = InternalUserPrincipal(UUID.randomUUID(), 41, setOf(InternalRole.OPERATOR))
    private lateinit var mvc: MockMvc
    private var authCalls = 0
    private val authActions = ArrayDeque<() -> InternalUserPrincipal>()

    @BeforeEach fun setup() {
        reset(reports)
        reset(exports)
        authCalls = 0
        authActions.clear()
        auth = mock(RequestAuth::class.java) { invocation ->
            if (invocation.method.name == "operatorOrAdmin") {
                authCalls++
                authActions.removeFirstOrNull()?.invoke() ?: principal
            } else RETURNS_DEFAULTS.answer(invocation)
        }
        mvc = MockMvcBuilders.standaloneSetup(
            ChannelReportController(reports, exports, auth, ChannelReportReadOriginPolicy(InstallationOrigin("https://store.example.test"))),
        ).setControllerAdvice(ChannelReportExceptionAdvice()).addFilters<org.springframework.test.web.servlet.setup.StandaloneMockMvcBuilder>(ChannelReportNoStoreFilter()).build()
    }

    @Test fun `valid report is explicit no store JSON and authority is revalidated before publication`() {
        `when`(reports.read("2026-11-01", "2026-11-26")).thenReturn(StoreCoreCreatedOrderReadResult.Found(channelReportFixture()))
        mvc.perform(get("/api/v1/user/channel-reports")
            .header("Sec-Fetch-Site", "same-origin")
            .param("fromDate", "2026-11-01").param("toDateExclusive", "2026-11-26"))
            .andExpect(status().isOk)
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
            .andExpect(jsonPath("$.data.contractVersion", `is`(ReportPeriod.CONTRACT_VERSION)))
            .andExpect(jsonPath("$.data.metrics.createdOrders.value.count", `is`("2")))
            .andExpect(jsonPath("$.data.metrics.netRevenue.value").doesNotExist())
        assertEquals(2, authCalls)
        verify(reports).read("2026-11-01", "2026-11-26")
    }

    @Test fun `origin and query fail closed before report work while source failure stays generic`() {
        val valid = get("/api/v1/user/channel-reports").header("Sec-Fetch-Site", "same-origin")
            .param("fromDate", "2026-11-01").param("toDateExclusive", "2026-11-26")
        mvc.perform(get("/api/v1/user/channel-reports").param("fromDate", "2026-11-01").param("toDateExclusive", "2026-11-26"))
            .andExpect(status().isForbidden).andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
        mvc.perform(valid.param("extra", "1"))
            .andExpect(status().isBadRequest).andExpect(jsonPath("$.errorCode", `is`("REQUEST_VALIDATION_FAILED")))
        verifyNoInteractions(reports)

        `when`(reports.read("2026-11-01", "2026-11-26")).thenReturn(StoreCoreCreatedOrderReadResult.TimezoneUnavailable)
        mvc.perform(get("/api/v1/user/channel-reports").header("Origin", "https://store.example.test")
            .param("fromDate", "2026-11-01").param("toDateExclusive", "2026-11-26"))
            .andExpect(status().isServiceUnavailable)
            .andExpect(jsonPath("$.errorCode", `is`("CHANNEL_REPORT_UNAVAILABLE")))
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
    }

    @Test fun `authentication transaction failures and changed final actor publish no report`() {
        fun request() = get("/api/v1/user/channel-reports").header("Sec-Fetch-Site", "same-origin")
            .param("fromDate", "2026-11-01").param("toDateExclusive", "2026-11-26")

        authActions.add { throw CannotCreateTransactionException("private authentication failure") }
        mvc.perform(request()).andExpect(status().isServiceUnavailable)
            .andExpect(jsonPath("$.errorCode", `is`("CHANNEL_REPORT_UNAVAILABLE")))
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("private authentication failure"))))
        verifyNoInteractions(reports)

        `when`(reports.read("2026-11-01", "2026-11-26")).thenReturn(StoreCoreCreatedOrderReadResult.Found(channelReportFixture()))
        authActions.add { principal }
        authActions.add { throw CannotCreateTransactionException("private final failure") }
        mvc.perform(request()).andExpect(status().isServiceUnavailable)
            .andExpect(jsonPath("$.errorCode", `is`("CHANNEL_REPORT_UNAVAILABLE")))

        authActions.add { principal }
        authActions.add { principal.copy(sessionId = UUID.randomUUID()) }
        mvc.perform(request()).andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.errorCode", `is`("AUTHENTICATION_FAILED")))
    }

    @Test fun `CSV export revalidates actor then streams fixed attachment and releases owned bytes`() {
        val artifact = PreparedChannelReportCsv.create("header\r\nvalue\r\n".toByteArray())
        `when`(exports.prepare(anyCsvRequest())).thenReturn(ChannelReportCsvPreparationResult.Prepared.create(artifact))
        mvc.perform(csvRequest())
            .andExpect(status().isOk)
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))
            .andExpect(header().string(HttpHeaders.CONTENT_TYPE, "text/csv;charset=UTF-8"))
            .andExpect(header().string(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"storecore-channel-report-2026-11-01-to-2026-11-26.csv\""))
            .andExpect(content().bytes("header\r\nvalue\r\n".toByteArray()))
        assertTrue(artifact.isReleased())
        assertEquals(2, authCalls)
    }

    @Test fun `CSV export maps stale oversized and changed actor before committing CSV headers`() {
        `when`(exports.prepare(anyCsvRequest())).thenReturn(ChannelReportCsvPreparationResult.StalePeriod)
        mvc.perform(csvRequest()).andExpect(status().isConflict)
            .andExpect(jsonPath("$.errorCode", `is`("REPORT_PERIOD_STALE")))
            .andExpect(header().string(HttpHeaders.CACHE_CONTROL, "no-store"))

        `when`(exports.prepare(anyCsvRequest())).thenReturn(ChannelReportCsvPreparationResult.TooLarge)
        mvc.perform(csvRequest()).andExpect(status().isUnprocessableEntity)
            .andExpect(jsonPath("$.errorCode", `is`("REPORT_EXPORT_TOO_LARGE")))

        val artifact = PreparedChannelReportCsv.create("private".toByteArray())
        `when`(exports.prepare(anyCsvRequest())).thenReturn(ChannelReportCsvPreparationResult.Prepared.create(artifact))
        authActions.add { principal }
        authActions.add { principal.copy(sessionId = UUID.randomUUID()) }
        mvc.perform(csvRequest()).andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.errorCode", `is`("AUTHENTICATION_FAILED")))
        assertTrue(artifact.isReleased())
    }

    @Test fun `CSV transport releases bytes when client output fails`() {
        val artifact = PreparedChannelReportCsv.create("bounded bytes".toByteArray())
        val transport = requireNotNull(PreparedChannelReportCsvTransport.takeOwnership(artifact))
        val output = object : OutputStream() {
            override fun write(value: Int) = throw IOException("client disconnected")
            override fun write(value: ByteArray, offset: Int, length: Int) = throw IOException("client disconnected")
        }

        kotlin.test.assertFailsWith<IOException> { transport.writeTo(output) }

        assertTrue(artifact.isReleased())
        assertTrue(transport.isReleased())
    }

    @Test fun `CSV transport supports cancellation before first write and ignores a second writer`() {
        val cancelled = requireNotNull(PreparedChannelReportCsvTransport.takeOwnership(
            PreparedChannelReportCsv.create("never published".toByteArray()),
        ))
        cancelled.close()
        val cancelledOutput = ByteArrayOutputStream()
        cancelled.writeTo(cancelledOutput)
        assertEquals(0, cancelledOutput.size())
        assertTrue(cancelled.isReleased())

        val once = requireNotNull(PreparedChannelReportCsvTransport.takeOwnership(
            PreparedChannelReportCsv.create("once".toByteArray()),
        ))
        val output = ByteArrayOutputStream()
        once.writeTo(output)
        once.writeTo(output)
        assertEquals("once", output.toString(Charsets.UTF_8))
        assertTrue(once.isReleased())
    }

    private fun csvRequest() = get("/api/v1/user/channel-reports.csv")
        .header("Sec-Fetch-Site", "same-origin")
        .param("fromDate", "2026-11-01")
        .param("toDateExclusive", "2026-11-26")
        .param("periodToken", "a".repeat(64))

    private fun anyCsvRequest(): ChannelReportCsvPreparationRequest =
        any(ChannelReportCsvPreparationRequest::class.java) ?: requireNotNull(
            ChannelReportCsvPreparationRequest.create(
                "2026-11-01",
                "2026-11-26",
                ReportPeriodToken.fromWire("a".repeat(64)),
            ),
        )

}
