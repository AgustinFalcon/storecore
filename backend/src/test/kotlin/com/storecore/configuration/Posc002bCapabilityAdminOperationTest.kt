package com.storecore.configuration

import com.storecore.configuration.domain.CapabilityAdminOperation
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class Posc002bCapabilityAdminOperationTest {
    @Test
    fun fromWireKeepsClosedSetAndUnknown() {
        assertEquals(CapabilityAdminOperation.ChangeState, CapabilityAdminOperation.fromWire("CHANGE_STATE"))
        assertEquals(CapabilityAdminOperation.KillCreate, CapabilityAdminOperation.fromWire("KILL_CREATE"))
        assertEquals(CapabilityAdminOperation.KillReplace, CapabilityAdminOperation.fromWire("KILL_REPLACE"))
        assertEquals(CapabilityAdminOperation.KillRemove, CapabilityAdminOperation.fromWire("KILL_REMOVE"))
        val unknown = CapabilityAdminOperation.fromWire("not-a-command")
        assertTrue(unknown is CapabilityAdminOperation.Unknown)
        assertEquals("not-a-command", unknown.wire)
        assertEquals("UNKNOWN", CapabilityAdminOperation.fromWire("").wire)
        assertEquals("UNKNOWN", CapabilityAdminOperation.fromWire(null).wire)
    }
}
