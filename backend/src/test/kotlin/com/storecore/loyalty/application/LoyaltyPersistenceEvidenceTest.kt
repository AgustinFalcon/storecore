package com.storecore.loyalty.application

import com.storecore.loyalty.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class LoyaltyPersistenceEvidenceTest {
    private val id = UUID.fromString("12345678-1234-1234-1234-123456789abc")
    private val zero = UUID(0, 0)
    private val now = Instant.parse("2026-11-26T12:00:00Z")
    private val points = requireNotNull(LoyaltyPoints.fromWire("10"))
    private val noPoints = requireNotNull(LoyaltyPoints.fromWire("0"))

    @Test fun `source application requires positive known immutable evidence`() {
        fun source(sourceId: String = "source-1", source: LoyaltySource = LoyaltySource.ADMIN_ADJUSTMENT,
                   uuid: UUID = id, wallet: Long = 1, policy: LoyaltyPolicyId = LoyaltyPolicyId.V1,
                   amount: LoyaltyPoints = points, at: Instant = now) =
            LoyaltySourceApplication.create(uuid, wallet, source, sourceId, policy, amount, at)
        assertNotNull(source())
        assertNull(source(uuid = zero)); assertNull(source(wallet = 0)); assertNull(source(source = LoyaltySource.UNKNOWN))
        assertNull(source(source = LoyaltySource.REDEMPTION)); assertNull(source(source = LoyaltySource.LOYALTY_CORRECTION))
        assertNull(source(policy = LoyaltyPolicyId.UNKNOWN)); assertNull(source(amount = noPoints)); assertNull(source(at = now.plusNanos(1)))
        for (raw in listOf("", " ", " leading", "trailing ", "a\nb", "\uD800", "\uDC00", "x".repeat(257))) assertNull(source(sourceId = raw))
    }
    @Test fun `ledger admits only complete movement metadata in cut B`() {
        for (movement in LoyaltyMovement.entries) for (direction in listOf(null) + LoyaltyManualDirection.entries) {
            val ledger = LoyaltyLedgerEntry.create(1, 1, id, movement, direction, points, now)
            val valid = when (movement) {
                LoyaltyMovement.EARN, LoyaltyMovement.EXPIRE -> direction == null
                LoyaltyMovement.MANUAL_ADJUSTMENT -> direction == LoyaltyManualDirection.CREDIT || direction == LoyaltyManualDirection.DEBIT
                else -> false
            }
            assertEquals(valid, ledger != null, "$movement $direction")
        }
        assertNull(LoyaltyLedgerEntry.create(0, 1, id, LoyaltyMovement.EARN, null, points, now))
        assertNull(LoyaltyLedgerEntry.create(1, 0, id, LoyaltyMovement.EARN, null, points, now))
        assertNull(LoyaltyLedgerEntry.create(1, 1, zero, LoyaltyMovement.EARN, null, points, now))
        assertNull(LoyaltyLedgerEntry.create(1, 1, id, LoyaltyMovement.EARN, null, noPoints, now))
        assertNull(LoyaltyLedgerEntry.create(1, 1, id, LoyaltyMovement.EARN, null, points, now.plusNanos(1)))
    }
    @Test fun `allocation event requires nonzero identity positive correlation and known kind`() {
        for (kind in LoyaltyAllocationKind.entries) {
            assertEquals(kind != LoyaltyAllocationKind.UNKNOWN,
                LoyaltyAllocationEvent.create(id, 1, 2, 3, kind, points, now) != null)
        }
        assertNull(LoyaltyAllocationEvent.create(zero, 1, 2, 3, LoyaltyAllocationKind.ISSUE, points, now))
        assertNull(LoyaltyAllocationEvent.create(id, 0, 2, 3, LoyaltyAllocationKind.ISSUE, points, now))
        assertNull(LoyaltyAllocationEvent.create(id, 1, 0, 3, LoyaltyAllocationKind.ISSUE, points, now))
        assertNull(LoyaltyAllocationEvent.create(id, 1, 2, 0, LoyaltyAllocationKind.ISSUE, points, now))
        assertNull(LoyaltyAllocationEvent.create(id, 1, 2, 3, LoyaltyAllocationKind.ISSUE, noPoints, now))
        assertNull(LoyaltyAllocationEvent.create(id, 1, 2, 3, LoyaltyAllocationKind.ISSUE, points, now.plusNanos(1)))
    }
    @Test fun `audit evidence binds one valid command and closed action`() {
        assertNotNull(LoyaltyAuditEntry.create(id, id, 1, LoyaltyAuditAction.COMMAND_RECORDED, now))
        assertNull(LoyaltyAuditEntry.create(zero, id, 1, LoyaltyAuditAction.COMMAND_RECORDED, now))
        assertNull(LoyaltyAuditEntry.create(id, zero, 1, LoyaltyAuditAction.COMMAND_RECORDED, now))
        assertNull(LoyaltyAuditEntry.create(id, id, 0, LoyaltyAuditAction.COMMAND_RECORDED, now))
        assertNull(LoyaltyAuditEntry.create(id, id, 1, LoyaltyAuditAction.UNKNOWN, now))
        assertNull(LoyaltyAuditEntry.create(id, id, 1, LoyaltyAuditAction.COMMAND_RECORDED, now.plusNanos(1)))
    }
}
