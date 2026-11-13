package com.storecore.commerce.infrastructure.mporders

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.storecore.commerce.domain.PaymentCurrency
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class OfficialOrderWireMapperTest {
    private val mapper = jacksonObjectMapper()

    @Test
    fun `resource and search candidate map invalid currency shapes to unknown`() {
        val invalidPayloads = listOf(
            """{"id":"ORD-1"}""",
            """{"id":"ORD-1","currency":null}""",
            """{"id":"ORD-1","currency":""}""",
            """{"id":"ORD-1","currency":"USD"}""",
            """{"id":"ORD-1","currency":"ars"}""",
            """{"id":"ORD-1","currency":123}""",
            """{"id":"ORD-1","currency":false}""",
            """{"id":"ORD-1","currency":{}}""",
            """{"id":"ORD-1","currency":[]}""",
        )

        invalidPayloads.forEach { payload ->
            val node = mapper.readTree(payload)
            assertEquals(PaymentCurrency.UNKNOWN, OfficialOrderWireMapper.toResource(node).currency, payload)
            assertEquals(PaymentCurrency.UNKNOWN, requireNotNull(OfficialOrderWireMapper.toCandidate(node)).currency, payload)
        }
    }

    @Test
    fun `resource and search candidate accept exact textual ARS`() {
        val node = mapper.readTree("""{"id":"ORD-1","currency":"ARS"}""")
        assertEquals(PaymentCurrency.ARS, OfficialOrderWireMapper.toResource(node).currency)
        assertEquals(PaymentCurrency.ARS, requireNotNull(OfficialOrderWireMapper.toCandidate(node)).currency)
    }
}
