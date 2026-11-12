package com.storecore.identity

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class RecoveryBrowserProtocolTest {
    private val mapper = jacksonObjectMapper()
    @Test fun `capture protocol is closed and rejects secret-bearing or unknown fields`() {
        val accepted = RecoveryBrowserCommand.fromWire(mapper.readTree("""{"kind":"CAPTURE","requestId":1,"fixture":"CUSTOMER_CASE"}"""))
        assertTrue(accepted is RecoveryBrowserCommand.Capture)
        listOf(
            """{"kind":"CAPTURE","requestId":1,"fixture":"future"}""",
            """{"kind":"CAPTURE","requestId":1,"fixture":"USER_CASE","token":"secret"}""",
            """{"kind":"RESULT","passed":1}""",
            """{"kind":"future"}""",
        ).forEach { assertEquals(RecoveryBrowserCommand.Unknown, RecoveryBrowserCommand.fromWire(mapper.readTree(it))) }
        assertTrue(RecoveryBrowserCommand.fromWire(mapper.readTree("""{"kind":"RESULT","passed":2}""")) is RecoveryBrowserCommand.Result)
        assertTrue(RecoveryBrowserCommand.fromWire(mapper.readTree("""{"kind":"FAILED","phase":"INSPECT"}""")) is RecoveryBrowserCommand.Failed)
        assertEquals(RecoveryBrowserCommand.Unknown, RecoveryBrowserCommand.fromWire(mapper.readTree("""{"kind":"FAILED","phase":"future"}""")))
    }
}
