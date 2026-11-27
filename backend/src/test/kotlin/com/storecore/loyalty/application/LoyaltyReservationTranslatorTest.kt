package com.storecore.loyalty.application

import com.storecore.loyalty.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class LoyaltyReservationTranslatorTest {
    private val now = Instant.parse("2026-11-27T12:00:00Z")
    private val id = "12345678-1234-1234-1234-123456789abc"
    private val row = LoyaltyPersistedReservation(
        id, "1", "2", "3", "4", "0", "loyalty-policy-v1", "QUOTED", "600",
        now.minusSeconds(10), now.plusSeconds(890),
    )
    private fun allocation(ordinal: Int = 1, lotId: String = "10", points: String = "600") =
        LoyaltyPersistedReservationAllocation(id, "1", ordinal, lotId, points)
    private fun read(reservation: LoyaltyPersistedReservation = row,
                     allocations: List<LoyaltyPersistedReservationAllocation> = listOf(allocation()),
                     walletId: Long = 1, customerId: Long = 2, at: Instant = now) =
        LoyaltyReservationTranslator.fromWire(reservation, allocations, walletId, customerId, at)
    private fun unavailable(result: LoyaltyReservationRead) {
        assertTrue(result is LoyaltyReservationRead.Unavailable)
        assertEquals(LoyaltyReservationUnavailableReason.CORRUPT_EVIDENCE,
            (result as LoyaltyReservationRead.Unavailable).reason)
    }

    @Test fun `valid quoted reservation preserves typed identity revisions window and ordered allocations`() {
        val result = read(allocations = listOf(allocation(points = "400"), allocation(2, "11", "200")))
        val reservation = (result as LoyaltyReservationRead.Available).reservation
        assertEquals(UUID.fromString(id), reservation.id)
        assertEquals(1L, reservation.walletId)
        assertEquals(2L, reservation.customerId)
        assertEquals(3L, reservation.cartRevision.value)
        assertEquals(4L, reservation.walletRevision.value)
        assertEquals(0L, reservation.revision.value)
        assertSame(LoyaltyPolicyId.V1, reservation.policy)
        assertSame(LoyaltyReservationState.QUOTED, reservation.state)
        assertEquals(600L, reservation.points.value)
        assertEquals(now.minusSeconds(10), reservation.window.createdAt)
        assertEquals(now.plusSeconds(890), reservation.window.expiresAt)
        assertEquals(listOf(10L, 11L), reservation.allocations.map { it.lotId })
        assertEquals(listOf(400L, 200L), reservation.allocations.map { it.points.value })
    }

    @Test fun `unknown policy and state never escape as a partial actionable aggregate`() {
        for (value in listOf(null, "future", "quoted", "UNKNOWN")) unavailable(read(row.copy(state = value)))
        for (value in listOf(null, "future", "LOYALTY-POLICY-V1", "UNKNOWN")) unavailable(read(row.copy(policy = value)))
    }

    @Test fun `wire identities require canonical nonzero UUID and positive decimal ownership`() {
        for (value in listOf(null, "", "not-a-uuid", "00000000-0000-0000-0000-000000000000",
            id.uppercase(), "1-1-1-1-1")) unavailable(read(row.copy(id = value)))
        for (value in listOf(null, "0", "-1", "01", "9223372036854775808")) {
            unavailable(read(row.copy(walletId = value)))
            unavailable(read(row.copy(customerId = value)))
        }
        unavailable(read(walletId = 9))
        unavailable(read(customerId = 9))
        unavailable(read(walletId = 0))
        unavailable(read(customerId = 0))
    }

    @Test fun `all revisions reject malformed negative and overflowing values`() {
        for (value in listOf(null, "-1", "01", "+1", "9223372036854775808")) {
            unavailable(read(row.copy(cartRevision = value)))
            unavailable(read(row.copy(walletRevision = value)))
            unavailable(read(row.copy(revision = value)))
        }
        unavailable(read(row.copy(revision = Long.MAX_VALUE.toString())))
    }

    @Test fun `reservation window requires whole seconds exact TTL and nonfuture creation`() {
        unavailable(read(row.copy(createdAt = row.createdAt.plusNanos(1))))
        unavailable(read(row.copy(expiresAt = row.expiresAt.minusSeconds(1))))
        unavailable(read(row.copy(expiresAt = row.expiresAt.plusNanos(1))))
        unavailable(read(row.copy(createdAt = now.plusSeconds(1), expiresAt = now.plusSeconds(901))))
        unavailable(read(row.copy(createdAt = Instant.MAX.minusSeconds(899), expiresAt = Instant.MAX), at = Instant.MAX))
        unavailable(read(at = now.plusNanos(1)))
        // A read preserves an overdue hold until an explicit expiry command applies.
        assertSame(LoyaltyReservationState.QUOTED,
            (read(at = row.expiresAt) as LoyaltyReservationRead.Available).reservation.state)
    }

    @Test fun `allocations must be positive unique contiguous and already ordered`() {
        unavailable(read(allocations = emptyList()))
        for (value in listOf(null, "0", "-1", "01", "9223372036854775808")) {
            unavailable(read(allocations = listOf(allocation().copy(points = value))))
            unavailable(read(allocations = listOf(allocation().copy(lotId = value))))
        }
        for (ordinal in listOf(0, -1, 2)) unavailable(read(allocations = listOf(allocation(ordinal))))
        unavailable(read(allocations = listOf(allocation(points = "300"), allocation(2, "10", "300"))))
        unavailable(read(allocations = listOf(allocation(2, "11", "300"), allocation(points = "300"))))
        unavailable(read(allocations = listOf(allocation(points = "300"), allocation(3, "11", "300"))))
    }

    @Test fun `allocation correlations must match whole reservation and owning wallet`() {
        unavailable(read(allocations = listOf(allocation().copy(reservationId = UUID.randomUUID().toString()))))
        unavailable(read(allocations = listOf(allocation().copy(reservationId = id.uppercase()))))
        unavailable(read(allocations = listOf(allocation().copy(walletId = "9"))))
    }

    @Test fun `allocation totals equal selected points without signed overflow`() {
        for (points in listOf(null, "0", "-1", "01", "9223372036854775808", "599", "601")) {
            unavailable(read(row.copy(points = points)))
        }
        unavailable(read(row.copy(points = Long.MAX_VALUE.toString()),
            listOf(allocation(points = Long.MAX_VALUE.toString()), allocation(2, "11", "1"))))
    }

    @Test fun `only unbound lifecycle states are admitted in this cut`() {
        assertTrue(read(row.copy(state = "QUOTED", revision = "0")) is LoyaltyReservationRead.Available)
        assertTrue(read(row.copy(state = "RELEASED", revision = "1")) is LoyaltyReservationRead.Available)
        unavailable(read(row.copy(state = "QUOTED", revision = "1")))
        unavailable(read(row.copy(state = "RELEASED", revision = "0")))
        unavailable(read(row.copy(state = "EXPIRED")))
        assertTrue(read(row.copy(state = "EXPIRED", revision = "1"), at = row.expiresAt) is LoyaltyReservationRead.Available)
        unavailable(read(row.copy(state = "EXPIRED", revision = "0"), at = row.expiresAt))
        for (state in listOf("PAYMENT_PENDING", "RECONCILIATION_REQUIRED", "COMMITTED")) {
            unavailable(read(row.copy(state = state)))
        }
    }
    @Test fun `aggregate allocations cannot be changed through input or exposed collection`() {
        val input = mutableListOf(allocation(points = "400"), allocation(2, "11", "200"))
        val reservation = (read(allocations = input) as LoyaltyReservationRead.Available).reservation
        input.clear()
        assertEquals(listOf(10L, 11L), reservation.allocations.map { it.lotId })
        assertThrows(UnsupportedOperationException::class.java) {
            (reservation.allocations as MutableList<*>).clear()
        }
    }
}
