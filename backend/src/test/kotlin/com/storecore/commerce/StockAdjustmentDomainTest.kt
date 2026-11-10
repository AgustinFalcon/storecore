package com.storecore.commerce

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule
import com.fasterxml.jackson.databind.SerializationFeature
import com.storecore.commerce.domain.*
import com.storecore.commerce.infrastructure.StockAdjustmentRequestTranslator
import com.storecore.commerce.infrastructure.StockAdjustmentReceiptCodec
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class StockAdjustmentDomainTest {
    private val mapper = ObjectMapper().registerModule(JavaTimeModule()).disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private val balance = StockBalanceSnapshot(8,3,1)
    private fun command(delta: Int, expected: StockBalanceSnapshot = balance) = AdjustAvailableStockCommand.create(UUID.randomUUID(),1,delta,expected," count ")

    @Test fun `policy guards full snapshot missing negative and overflowing quantities`() {
        assertNull(ApplyAvailableStockAdjustment.reject(command(-8),balance))
        assertEquals(StockAdjustmentRejection.BALANCE_MISSING,ApplyAvailableStockAdjustment.reject(command(1),null))
        assertEquals(StockAdjustmentRejection.BALANCE_CHANGED,ApplyAvailableStockAdjustment.reject(command(1),balance.copy(reserved=2)))
        assertEquals(StockAdjustmentRejection.BALANCE_CHANGED,ApplyAvailableStockAdjustment.reject(command(1),balance.copy(safety=2)))
        assertEquals(StockAdjustmentRejection.WOULD_MAKE_AVAILABLE_NEGATIVE,ApplyAvailableStockAdjustment.reject(command(-9),balance))
        val max = StockBalanceSnapshot(Int.MAX_VALUE,0,0)
        assertEquals(StockAdjustmentRejection.QUANTITY_OVERFLOW,ApplyAvailableStockAdjustment.reject(command(1,max),max))
        assertEquals("count",command(1).reason)
        listOf("", " ", "a".repeat(501)).forEach { reason -> assertThrows(InvalidStockAdjustmentCommand::class.java) { AdjustAvailableStockCommand.create(UUID.randomUUID(),1,1,balance,reason) } }
        assertThrows(InvalidStockAdjustmentCommand::class.java) { command(0) }
    }

    @Test fun `strict command boundary refuses coercions and malformed preconditions`() {
        val key = UUID.randomUUID()
        fun body(delta: String="1", expected: String="8", reason: String="\"Count\"") = """{"commandId":"$key","quantityDelta":$delta,"expected":{"available":$expected,"reserved":3,"safety":1},"reason":$reason}"""
        assertEquals(1,StockAdjustmentRequestTranslator.command("1",mapper.readTree(body())).quantityDelta)
        listOf("0","1.2","1e1","\"2\"","2147483648","null","true").forEach { delta ->
            assertThrows(InvalidStockAdjustmentCommand::class.java, { StockAdjustmentRequestTranslator.command("1",mapper.readTree(body(delta))) },delta)
        }
        listOf("-1","\"8\"","null","2147483648").forEach { value -> assertThrows(InvalidStockAdjustmentCommand::class.java) { StockAdjustmentRequestTranslator.command("1",mapper.readTree(body(expected=value))) } }
        assertThrows(InvalidStockAdjustmentCommand::class.java) { StockAdjustmentRequestTranslator.command("0",mapper.readTree(body())) }
        assertThrows(InvalidStockAdjustmentCommand::class.java) { StockAdjustmentRequestTranslator.command("1",mapper.readTree(body(reason="1"))) }
    }

    @Test fun `future and malformed stored outcomes never become applied`() {
        assertEquals(StockAdjustmentState.UNKNOWN,StockAdjustmentState.fromWire("future"))
        assertEquals(StockAdjustmentRejection.UNKNOWN,StockAdjustmentRejection.fromWire(null))
        assertEquals(StockAdjustmentRequestError.UNKNOWN,StockAdjustmentRequestError.fromWire("future"))
        assertEquals(StockAdjustmentLookupState.UNKNOWN,StockAdjustmentLookupState.fromWire("future"))
        val receipt = StockAdjustmentReceipt(UUID.randomUUID(),"1",StockAdjustmentState.APPLIED,null,balance,balance.copy(available=9),"1",Instant.EPOCH)
        val codec = StockAdjustmentReceiptCodec(mapper)
        assertEquals(receipt,codec.decode(mapper.writeValueAsString(receipt),receipt.commandId,1,Instant.EPOCH))
        listOf("{}", "broken",mapper.writeValueAsString(receipt.copy(state=StockAdjustmentState.UNKNOWN)),mapper.writeValueAsString(receipt.copy(after=null)),mapper.writeValueAsString(receipt.copy(variantId="2"))).forEach { raw ->
            assertEquals(StockAdjustmentState.UNKNOWN,codec.decode(raw,receipt.commandId,1,Instant.EPOCH).state)
        }
    }

    @Test fun `malformed rejected null fields remain unknown`() {
        val commandId = UUID.randomUUID()
        val codec = StockAdjustmentReceiptCodec(mapper)
        fun rejected(reason: String, before: String, after: String = "null", ledger: String = "null") =
            """{"commandId":"$commandId","variantId":"1","state":"REJECTED","reason":"$reason","before":$before,"after":$after,"ledgerId":$ledger,"recordedAt":"1970-01-01T00:00:00Z"}"""

        assertEquals(StockAdjustmentState.REJECTED, codec.decode(rejected("BALANCE_CHANGED", "{\"available\":8,\"reserved\":3,\"safety\":1}"), commandId, 1, Instant.EPOCH).state)
        assertEquals(StockAdjustmentState.REJECTED, codec.decode(rejected("BALANCE_MISSING", "null"), commandId, 1, Instant.EPOCH).state)

        listOf("{}", "[]", "\"invalid\"", "{\"available\":-1,\"reserved\":3,\"safety\":1}").forEach { malformed ->
            assertEquals(StockAdjustmentState.UNKNOWN, codec.decode(rejected("BALANCE_CHANGED", "{\"available\":8,\"reserved\":3,\"safety\":1}", after = malformed), commandId, 1, Instant.EPOCH).state, "after=$malformed")
            assertEquals(StockAdjustmentState.UNKNOWN, codec.decode(rejected("BALANCE_MISSING", malformed), commandId, 1, Instant.EPOCH).state, "before=$malformed")
        }
        listOf("{}", "[]", "\"invalid\"", "1").forEach { malformed ->
            assertEquals(StockAdjustmentState.UNKNOWN, codec.decode(rejected("BALANCE_CHANGED", "{\"available\":8,\"reserved\":3,\"safety\":1}", ledger = malformed), commandId, 1, Instant.EPOCH).state, "ledger=$malformed")
        }
    }
}
