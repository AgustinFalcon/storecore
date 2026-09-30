package com.storecore.blackstore

import com.storecore.blackstore.domain.CompanionAdminCommand
import com.storecore.blackstore.domain.CompanionAdminOperation
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.UUID

class Posc002cCompanionAdminOperationTest {
    @Test
    fun fromWireUsesClosedCases() {
        assertEquals(CompanionAdminOperation.Pair, CompanionAdminOperation.fromWire("PAIR"))
        assertEquals(CompanionAdminOperation.Rotate, CompanionAdminOperation.fromWire("ROTATE"))
        assertEquals(CompanionAdminOperation.Activate, CompanionAdminOperation.fromWire("ACTIVATE"))
        assertEquals(CompanionAdminOperation.Suspend, CompanionAdminOperation.fromWire("SUSPEND"))
        assertEquals(CompanionAdminOperation.Revoke, CompanionAdminOperation.fromWire("REVOKE"))
        assertTrue(CompanionAdminOperation.fromWire("pair") is CompanionAdminOperation.Unknown)
        assertTrue(CompanionAdminOperation.fromWire(null) is CompanionAdminOperation.Unknown)
    }

    @Test
    fun pairHashMatchesSqlSeparatorCanonicalForm() {
        val client = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        val command = CompanionAdminCommand.Pair(
            UUID.randomUUID(),
            client,
            listOf(CompanionScope.STOCK_READ, CompanionScope.CATALOG_READ),
            "pair de prueba",
        )
        assertEquals(64, command.requestHash().length)
        val rotate = CompanionAdminCommand.Rotate(
            UUID.randomUUID(),
            7,
            CompanionLifecycleStatus.DISABLED,
            1,
            listOf(CompanionScope.CATALOG_READ),
            "rotar",
        )
        assertEquals(64, rotate.requestHash().length)
    }
}
