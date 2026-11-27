package com.storecore.loyalty.application

import com.storecore.loyalty.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.util.UUID

class LoyaltyReservationCommandsTest {
    private val hash = LoyaltyFingerprint.canonical(listOf("request"))

    @Test fun `quote command is a customer wallet command with checked revisions and points`() {
        val binding = requireNotNull(LoyaltyCommandBinding.create(UUID.randomUUID(), LoyaltyRealm.CUSTOMER, 17,
            LoyaltyCommandOperation.CREATE_RESERVATION, LoyaltyAggregateType.WALLET, "23", hash))
        val command = LoyaltyReservationQuoteCommand.create(binding, 17, "4", "8", "600")
        assertNotNull(command)
        assertEquals(17, command!!.customerId)
        assertEquals(4, command.cartRevision.value)
        assertEquals(8, command.expectedWalletRevision.value)
        assertEquals(600, command.points.value)
        assertNull(LoyaltyReservationQuoteCommand.create(binding, 18, "4", "8", "600"))
        assertNull(LoyaltyReservationQuoteCommand.create(binding, 17, "04", "8", "600"))
        assertNull(LoyaltyReservationQuoteCommand.create(binding, 17, "4", "8", "0"))
    }

    @Test fun `cancel and expiry commands own distinct authority and exact reservation identity`() {
        val reservation = UUID.randomUUID()
        fun binding(realm: LoyaltyRealm, actor: Long, operation: LoyaltyCommandOperation) = requireNotNull(
            LoyaltyCommandBinding.create(UUID.randomUUID(), realm, actor, operation,
                LoyaltyAggregateType.RESERVATION, reservation.toString(), hash))
        assertNotNull(LoyaltyReservationTerminalCommand.create(
            binding(LoyaltyRealm.CUSTOMER, 17, LoyaltyCommandOperation.CANCEL_RESERVATION),
            reservation, 17, "0"))
        assertNotNull(LoyaltyReservationTerminalCommand.create(
            binding(LoyaltyRealm.SYSTEM, 1, LoyaltyCommandOperation.EXPIRE_RESERVATION),
            reservation, 1, "0"))
        assertNull(LoyaltyReservationTerminalCommand.create(
            binding(LoyaltyRealm.CUSTOMER, 17, LoyaltyCommandOperation.CANCEL_RESERVATION),
            UUID.randomUUID(), 17, "0"))
        assertNull(LoyaltyReservationTerminalCommand.create(
            binding(LoyaltyRealm.CUSTOMER, 17, LoyaltyCommandOperation.CANCEL_RESERVATION),
            reservation, 18, "0"))
        assertNull(LoyaltyReservationTerminalCommand.create(
            binding(LoyaltyRealm.SYSTEM, 1, LoyaltyCommandOperation.EXPIRE_RESERVATION),
            reservation, 1, "00"))
    }
}
