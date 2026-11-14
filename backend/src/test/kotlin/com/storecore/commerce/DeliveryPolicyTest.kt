package com.storecore.commerce

import com.storecore.commerce.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class DeliveryPolicyTest {
    private fun pickup(cost:Any?="0.00")=mapOf("enabled" to true,"label" to "Collect","cost" to cost,"minDays" to 0,"maxDays" to 1,"destination" to "Store","instructions" to "Bring reference")
    private fun config(option:Map<String,Any?>)=mapOf("pickup" to option,"localDelivery" to mapOf("enabled" to false))
    @Test fun `closed modes and policy never invent defaults or round money`() {
        DeliveryMode.entries.forEach { assertEquals(it,DeliveryMode.fromWire(it.name)) }
        for(raw in listOf(null,"pickup",true,1,emptyMap<String,String>())) assertEquals(DeliveryMode.UNKNOWN,DeliveryMode.fromWire(raw))
        assertTrue(DeliveryPolicyTranslator.policy(mapOf("pickup" to mapOf("enabled" to false),"localDelivery" to mapOf("enabled" to false)),2)!!.isEmpty())
        for(cost in listOf(null,true,"1.005","-1","1000000000000",Double.NaN)) assertNull(DeliveryPolicyTranslator.policy(config(pickup(cost)),2))
        assertNull(DeliveryPolicyTranslator.policy(config(pickup()+mapOf("minDays" to 1.5)),2))
        assertNull(DeliveryPolicyTranslator.policy(config(pickup()+mapOf("maxDays" to -1)),2))
        assertEquals(BigDecimal("0.00"),DeliveryPolicyTranslator.policy(config(pickup()),2)!!.single().cost)
    }
    private fun snapshot(mode:DeliveryMode=DeliveryMode.PICKUP)=mapOf("mode" to mode.name,"label" to "Collect","cost" to "0.00","currency" to PaymentCurrency.ARS.name,"minDays" to 0,"maxDays" to 1,"requiresAddress" to mode.requiresAddress,"configurationVersion" to 2,"destination" to "Store","instructions" to "Bring reference")
    @Test fun `only missing historical block selects legacy and malformed never selects a machine`() {
        assertEquals(DeliverySnapshotState.LEGACY_MISSING_BLOCK,DeliveryPolicyTranslator.snapshot(false,null).state)
        for(raw in listOf(null,emptyMap<String,String>(),snapshot()+mapOf("mode" to "FUTURE"),snapshot()+mapOf("cost" to "1.005"),snapshot()+mapOf("requiresAddress" to true))) {
            val decision=DeliveryPolicyTranslator.snapshot(true,raw)
            assertEquals(DeliverySnapshotState.INVALID,decision.state)
            assertNull(ShipmentJourney.next(ShipmentStatus.PENDING,decision))
        }
    }
    @Test fun `pickup and delivery have separate steps and completed collection allows RMA`() {
        val pickup=DeliveryPolicyTranslator.snapshot(true,snapshot())
        assertEquals(ShipmentCommand.PACKED,ShipmentJourney.next(ShipmentStatus.PENDING,pickup)!!.command)
        assertEquals(ShipmentCommand.READY_FOR_PICKUP,ShipmentJourney.next(ShipmentStatus.PREPARING,pickup)!!.command)
        assertEquals(ShipmentCommand.PICKED_UP,ShipmentJourney.next(ShipmentStatus.READY_FOR_PICKUP,pickup)!!.command)
        assertNull(ShipmentJourney.transition(ShipmentStatus.PREPARING,ShipmentCommand.SHIPPED,pickup))
        assertNull(ShipmentJourney.transition(ShipmentStatus.PREPARING,ShipmentCommand.READY_FOR_PICKUP,DeliveryDecision.Legacy))
        assertTrue(ReceiveReturn.accepts(ShipmentStatus.PICKED_UP,RmaStatus.NONE,RmaCommand.RECEIVED,pickup))
        assertFalse(ReceiveReturn.accepts(ShipmentStatus.READY_FOR_PICKUP,RmaStatus.NONE,RmaCommand.RECEIVED,pickup))
    }
}
