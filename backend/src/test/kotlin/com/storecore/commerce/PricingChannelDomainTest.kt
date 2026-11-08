package com.storecore.commerce

import com.storecore.commerce.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant

class PricingChannelDomainTest {
    @Test fun `wire values are closed and unknown transitions fail closed`() {
        PricePolicyStatus.entries.forEach { assertEquals(it, PricePolicyStatus.fromWire(it.name)) }
        ChannelState.entries.forEach { assertEquals(it, ChannelState.fromWire(it.name)) }
        PriceScope.entries.forEach { assertEquals(it, PriceScope.fromWire(it.name)) }
        PriceCurrency.entries.forEach { assertEquals(it, PriceCurrency.fromWire(it.name)) }
        PriceWriter.entries.forEach { assertEquals(it, PriceWriter.fromWire(it.name)) }
        assertEquals(PricePolicyStatus.UNKNOWN, PricePolicyStatus.fromWire("future"))
        assertEquals(ChannelState.UNKNOWN, ChannelState.fromWire(null))
        assertEquals(PriceScope.UNKNOWN, PriceScope.fromWire("future"))
        assertEquals(PriceCurrency.UNKNOWN, PriceCurrency.fromWire("USD"))
        assertEquals(PriceWriter.UNKNOWN, PriceWriter.fromWire("AUTO"))
        assertSame(PricePolicyTransition.Unknown, PricePolicyTransition.fromWire("ACTIVE"))
        val transitions = listOf(PricePolicyTransition.Activate, PricePolicyTransition.Pause, PricePolicyTransition.End, PricePolicyTransition.Unknown)
        for (status in PricePolicyStatus.entries) for (transition in transitions) {
            val permitted = (transition == PricePolicyTransition.Activate && status in setOf(PricePolicyStatus.DRAFT, PricePolicyStatus.PAUSED)) ||
                (transition == PricePolicyTransition.Pause && status == PricePolicyStatus.ACTIVE) ||
                (transition == PricePolicyTransition.End && status in setOf(PricePolicyStatus.ACTIVE, PricePolicyStatus.PAUSED))
            assertEquals(permitted, transition.accepts(status), "$status -> $transition")
        }
    }
    @Test fun `server time and monetary invariants prevent unsafe activation`() {
        val now = Instant.parse("2026-11-08T12:00:00Z")
        val policy = ManualPricePolicy(PriceCurrency.ARS, PriceScope.DEFAULT, PriceWriter.MANUAL, BigDecimal("100.00"),
            BigDecimal("90.00"), null, BigDecimal("80.00"), now.minusSeconds(10), now.plusSeconds(10))
        assertTrue(policy.canActivate(now))
        assertFalse(policy.canActivate(policy.validTo))
        assertFalse(policy.copy(currency = PriceCurrency.UNKNOWN).valid())
        assertFalse(policy.copy(scope = PriceScope.UNKNOWN).valid())
        assertFalse(policy.copy(writer = PriceWriter.UNKNOWN).valid())
        assertFalse(policy.copy(basePrice = BigDecimal("-1")).valid())
        assertFalse(policy.copy(desiredPrice = BigDecimal("1.001")).valid())
        assertFalse(policy.copy(observedPrice = BigDecimal("-1")).valid())
        assertFalse(policy.copy(effectivePromoPrice = BigDecimal("91")).valid())
        assertFalse(policy.copy(validTo = policy.validFrom).valid())
    }
    @Test fun `historical zero remains unverified and missing is unavailable`() {
        val zero = ChannelObservation.historical(0)
        assertEquals(0, zero.value)
        assertEquals(ChannelFactState.KNOWN, zero.state)
        assertEquals(ObservationFreshness.UNVERIFIED, zero.freshness)
        val missing = ChannelObservation.historical<Int>(null)
        assertNull(missing.value)
        assertEquals(ChannelFactState.UNAVAILABLE, missing.state)
        assertEquals(ChannelUnavailableReason.EXTERNAL_NOT_AVAILABLE, missing.reason)
    }
}
