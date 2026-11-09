package com.storecore.commerce

import com.storecore.commerce.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class ReturnDispositionPolicyTest {
    private val mixed = ReturnDispositionLine(7, DispositionQuantities(1, 1, 0), DamageReason.COSMETIC, null, null)
    @Test fun `mixed and no-restock partitions match the physically received quantity`() {
        assertNull(InspectReturn.reject(mapOf(7L to 2), listOf(mixed)))
        assertNull(InspectReturn.reject(mapOf(7L to 2), listOf(mixed.copy(quantities = DispositionQuantities(0, 2, 0)))))
        assertNull(InspectReturn.reject(mapOf(7L to 2), listOf(mixed.copy(quantities = DispositionQuantities(0, 0, 2), damageReason = null, rejectionReason = RejectionReason.NOT_OUR_ITEM))))
    }
    @Test fun `partitions reject negative incomplete exceeded and overflowing quantities`() {
        listOf(DispositionQuantities(-1, 3, 0), DispositionQuantities(0, 1, 0), DispositionQuantities(2, 1, 0), DispositionQuantities(Int.MAX_VALUE, Int.MAX_VALUE, 3)).forEach {
            assertEquals(DispositionRejection.INVALID_PARTITION, InspectReturn.reject(mapOf(7L to 2), listOf(mixed.copy(quantities = it))))
        }
    }
    @Test fun `complete item identity and a single classification per line are required`() {
        listOf(emptyList(), listOf(mixed, mixed), listOf(mixed.copy(returnItemId = 8))).forEach {
            assertEquals(DispositionRejection.ITEM_SET_MISMATCH, InspectReturn.reject(mapOf(7L to 2), it))
        }
    }
    @Test fun `unknown missing and irrelevant reasons fail closed`() {
        listOf(mixed.copy(damageReason = null), mixed.copy(damageReason = DamageReason.UNKNOWN), mixed.copy(rejectionReason = RejectionReason.OTHER)).forEach {
            assertEquals(DispositionRejection.INVALID_REASON, InspectReturn.reject(mapOf(7L to 2), listOf(it)))
        }
        assertEquals(DispositionRejection.INVALID_OBSERVATION, InspectReturn.reject(mapOf(7L to 2), listOf(mixed.copy(observation = "x".repeat(501)))))
    }
    @Test fun `closed translators never promote an unknown reason or state`() {
        assertEquals(DamageReason.UNKNOWN, DamageReason.fromWire("future"))
        assertEquals(RejectionReason.UNKNOWN, RejectionReason.fromWire(null))
        assertEquals(ReturnDisposition.UNKNOWN, ReturnDisposition.fromWire("future"))
        assertEquals(ReturnDispositionState.UNKNOWN, ReturnDispositionState.fromWire("future"))
        DamageReason.entries.forEach { assertEquals(it, DamageReason.fromWire(it.name)) }
        RejectionReason.entries.forEach { assertEquals(it, RejectionReason.fromWire(it.name)) }
        ReturnDispositionState.entries.forEach { assertEquals(it, ReturnDispositionState.fromWire(it.name)) }
    }
    @Test fun `apply requires received goods and verified commercial evidence`() {
        assertNull(ApplyReturnDisposition.reject(RmaStatus.RETURN_RECEIVED, ShipmentStatus.DELIVERED, FulfillmentEligibility.ELIGIBLE))
        RmaStatus.entries.filter { it != RmaStatus.RETURN_RECEIVED }.forEach {
            assertEquals(DispositionRejection.RETURN_NOT_RECEIVED, ApplyReturnDisposition.reject(it, ShipmentStatus.DELIVERED, FulfillmentEligibility.ELIGIBLE))
        }
        FulfillmentEligibility.entries.filter { it != FulfillmentEligibility.ELIGIBLE }.forEach {
            assertEquals(DispositionRejection.EVIDENCE_UNAVAILABLE, ApplyReturnDisposition.reject(RmaStatus.RETURN_RECEIVED, ShipmentStatus.DELIVERED, it))
        }
    }
}
