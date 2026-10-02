package com.storecore.commerce.domain

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.storecore.commerce.infrastructure.toWire
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class MercadoLibreAccountStatusTest {
    @Test
    fun `database translator accepts the closed set and only Active authorizes`() {
        val states = listOf(ChannelAccountState.Disabled, ChannelAccountState.ReadOnly, ChannelAccountState.Active, ChannelAccountState.Paused, ChannelAccountState.Error)
        states.forEach { state ->
            assertSame(state, ChannelAccountState.fromWire(" ${state.wire} "))
            assertEquals(state === ChannelAccountState.Active, MercadoLibreAccountView("ml-test", state).authorized)
        }
    }

    @Test
    fun `unknown values never authorize or echo raw database state`() {
        listOf("FUTURE_ACCOUNT", "", "active", null).forEach { raw ->
            val state = ChannelAccountState.fromWire(raw)
            assertSame(ChannelAccountState.Unknown, state)
            val response = MercadoLibreAccountView("ml-test", state).toWire()
            assertFalse(response.authorized)
            assertEquals("unknown", response.status)
        }
    }

    @Test
    fun `absent account remains disabled with an empty reference`() {
        val response = MercadoLibreAccountView("", ChannelAccountState.Disabled).toWire()
        assertFalse(response.authorized)
        assertEquals("", response.accountRef)
        assertEquals("DISABLED", response.status)
    }

    @Test
    fun `HTTP serialization preserves flat account contract and existing state wires`() {
        val mapper = jacksonObjectMapper()
        listOf(ChannelAccountState.Active, ChannelAccountState.Disabled, ChannelAccountState.Unknown).forEach { state ->
            val body = mapper.readTree(mapper.writeValueAsString(MercadoLibreAccountView("ml-test", state).toWire()))
            assertEquals(setOf("authorized", "accountRef", "status"), body.fieldNames().asSequence().toSet())
            assertEquals(state.isActive(), body["authorized"].booleanValue())
            assertEquals("ml-test", body["accountRef"].textValue())
            assertEquals(state.wire, body["status"].textValue())
        }
    }
}
