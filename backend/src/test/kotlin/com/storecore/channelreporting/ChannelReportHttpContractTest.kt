package com.storecore.channelreporting

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.channelreporting.application.*
import com.storecore.channelreporting.domain.*
import com.storecore.channelreporting.infrastructure.*
import com.storecore.identity.application.AuthorizationDenied
import com.storecore.identity.infrastructure.web.InstallationOrigin
import org.junit.jupiter.api.assertDoesNotThrow
import org.junit.jupiter.api.assertThrows
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.util.LinkedMultiValueMap
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChannelReportHttpContractTest {
    @Test fun `query accepts each owned date once and rejects every extra duplicate or malformed value`() {
        val valid = LinkedMultiValueMap<String, String>().apply {
            add("fromDate", "2026-11-01")
            add("toDateExclusive", "2026-11-26")
        }
        assertNotNull(ChannelReportQuery.fromWire(valid))
        for (invalid in listOf(
            LinkedMultiValueMap(valid).apply { add("fromDate", "2026-11-02") },
            LinkedMultiValueMap(valid).apply { add("extra", "1") },
            LinkedMultiValueMap(valid).apply { remove("fromDate") },
            LinkedMultiValueMap(valid).apply { set("fromDate", "2026-1-01") },
        )) assertNull(ChannelReportQuery.fromWire(invalid))
    }

    @Test fun `CSV query additionally owns one canonical period token and rejects every ambiguity`() {
        val token = "a".repeat(64)
        val valid = LinkedMultiValueMap<String, String>().apply {
            add("fromDate", "2026-11-01")
            add("toDateExclusive", "2026-11-26")
            add("periodToken", token)
        }
        val query = assertNotNull(ChannelReportCsvQuery.fromWire(valid))
        assertEquals(token, query.periodToken.wire)
        for (invalid in listOf(
            LinkedMultiValueMap(valid).apply { add("periodToken", token) },
            LinkedMultiValueMap(valid).apply { set("periodToken", "A".repeat(64)) },
            LinkedMultiValueMap(valid).apply { remove("periodToken") },
            LinkedMultiValueMap(valid).apply { add("extra", "1") },
            LinkedMultiValueMap(valid).apply { set("fromDate", "2026-1-01") },
        )) assertNull(ChannelReportCsvQuery.fromWire(invalid))
    }

    @Test fun `read origin policy admits normal same origin browser evidence and rejects ambiguity`() {
        val policy = ChannelReportReadOriginPolicy(InstallationOrigin("https://store.example.test"))
        assertDoesNotThrow { policy.requireAdmitted(request("Sec-Fetch-Site" to "same-origin")) }
        assertDoesNotThrow { policy.requireAdmitted(request("Referer" to "https://store.example.test/user/channel-reports")) }
        assertDoesNotThrow { policy.requireAdmitted(request("Origin" to "https://store.example.test", "Sec-Fetch-Site" to "same-origin")) }
        for (request in listOf(
            request(),
            request("Sec-Fetch-Site" to "cross-site"),
            request("Origin" to "https://outside.invalid"),
            request("Origin" to "https://store.example.test", "Referer" to "https://outside.invalid/page"),
            request("Origin" to "https://store.example.test", "Sec-Fetch-Site" to "cross-site"),
        )) assertThrows<AuthorizationDenied> { policy.requireAdmitted(request) }
    }

    @Test fun `explicit mapper emits canonical strings exact report variants and no domain helpers`() {
        val report = channelReportFixture()
        val period = report.period
        val mapper = ObjectMapper().setSerializationInclusion(JsonInclude.Include.NON_NULL)
        val root = mapper.valueToTree<com.fasterxml.jackson.databind.JsonNode>(ChannelReportHttpMapper.toDto(report))

        assertEquals(ReportPeriod.CONTRACT_VERSION, root.path("contractVersion").asText())
        assertEquals("2026-11-01", root.path("period").path("fromDate").asText())
        assertTrue(root.path("period").path("periodToken").asText().matches(Regex("[0-9a-f]{64}")))
        val created = root.path("metrics").path("createdOrders")
        assertEquals("AVAILABLE", created.path("availability").asText())
        assertEquals("2", created.path("value").path("count").asText())
        assertTrue(created.path("value").path("count").isTextual)
        assertEquals("1234.50", created.path("value").path("nominalTotal").asText())
        assertEquals("STORECORE_ORDER", created.path("evidence").path("source").asText())
        assertEquals(period.token.wire, created.path("evidence").path("periodToken").asText())
        assertFalse(created.path("evidence").has("period"))
        val unsupported = root.path("metrics").path("netRevenue")
        assertEquals(setOf("availability", "reason"), unsupported.fieldNames().asSequence().toSet())
        assertEquals("NOT_AVAILABLE", unsupported.path("availability").asText())
        assertEquals("REVERSAL_AMOUNT_UNAVAILABLE", unsupported.path("reason").asText())
        assertFalse(root.toString().contains("createdOrdersValue"))
        assertFalse(root.toString().contains("UNKNOWN"))
    }

    @Test fun `mapper rejects wrong metric authority permanent availability and corrupt nested activity evidence`() {
        val wrongSource = channelReportFixture(createdEvidence = { period ->
            ReportEvidence.period(ReportSource.STORECORE_INVENTORY_LEDGER, ReportTimeBasis.ORDER_CREATED, ReportFreshness.CURRENT, period)!!
        })
        val wrongBasis = channelReportFixture(createdEvidence = { period ->
            ReportEvidence.period(ReportSource.STORECORE_ORDER, ReportTimeBasis.LEDGER_RECORDED, ReportFreshness.CURRENT, period)!!
        })
        val wrongVariant = channelReportFixture(createdEvidence = { period ->
            ReportEvidence.current(ReportSource.STORECORE_ORDER, period.generatedAt, ReportFreshness.CURRENT)!!
        })
        val forbiddenRevenue = channelReportFixture(netRevenue = { period ->
            ReportValue.available(
                ReportArsAmount.fromWire("1.00")!!,
                ReportEvidence.current(ReportSource.STORECORE_ORDER, period.generatedAt, ReportFreshness.CURRENT)!!,
            )
        })
        val corruptNested = channelReportFixture(operations = { period ->
            val zero = ReportUnsignedLong.fromValue(0)!!
            val retained = BlackStoreOperationState.admitted.associateWith { zero }
            val retired = BlackStoreRetiredOperationState.admitted.associateWith { zero }
            val wrong = ReportValue.available(
                Instant.parse("2026-11-25T19:00:00Z"),
                ReportEvidence.current(ReportSource.STORECORE_ORDER, period.generatedAt, ReportFreshness.CURRENT)!!,
            )
            val noEvidence = requireNotNull(ReportValue.unavailable<Instant>(ReportUnavailableReason.NO_EVIDENCE))
            val diagnostics = BlackStoreOperationDiagnostics.create(retained, retired, wrong, noEvidence)!!
            ReportValue.available(
                diagnostics,
                ReportEvidence.current(ReportSource.BLACKSTORE_STOCK_SAGA, period.generatedAt, ReportFreshness.CURRENT)!!,
            )
        })
        for (report in listOf(wrongSource, wrongBasis, wrongVariant, forbiddenRevenue, corruptNested)) {
            assertThrows<ChannelReportMappingUnavailable> { ChannelReportHttpMapper.toDto(report) }
        }
    }

    private fun request(vararg headers: Pair<String, String>) = MockHttpServletRequest("GET", "/api/v1/user/channel-reports").apply {
        headers.forEach { addHeader(it.first, it.second) }
    }
}
