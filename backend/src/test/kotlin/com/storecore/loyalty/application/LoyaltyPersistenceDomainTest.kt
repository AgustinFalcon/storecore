package com.storecore.loyalty.application

import com.storecore.loyalty.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class LoyaltyPersistenceDomainTest {
    private val now = Instant.parse("2026-11-26T12:00:00Z")
    private fun lot(id: Long = 1, walletId: Long = 1, issued: String = "10", free: String = "10",
                    acceptedAt: Instant = now.minusSeconds(100), policy: String = LoyaltyPolicyId.V1.wire) =
        LoyaltyPersistedLot(id, walletId, acceptedAt, acceptedAt.plusSeconds(365L * 86400), policy,
            issued, free, "0", "0", "0", "0")
    private fun load(lots: List<LoyaltyPersistedLot>, revision: String = "0", realm: String = LoyaltyRealm.CUSTOMER.wire) =
        LoyaltyWalletTranslator.fromWire(LoyaltyPersistedWallet(1, 2, realm, revision, LoyaltyPolicyId.V1.wire), lots, now)

    @Test fun `wallet exposes truthful availability and next expiry at read instant`() {
        val due = lot(1, acceptedAt = now.minusSeconds(365L * 86400))
        val future = lot(2)
        val snapshot = (load(listOf(due, future)) as LoyaltyWalletRead.Available).snapshot
        assertEquals(10L, snapshot.availablePoints.value)
        assertEquals(future.expiresAt, snapshot.nextExpiryAt)
        assertEquals(10L, snapshot.nextExpiryPoints.value)
        assertEquals(0L, snapshot.heldPoints.value)
    }
    @Test fun `unknown ownership and future policy make complete wallet unavailable`() {
        assertTrue(load(listOf(lot()), realm = LoyaltyRealm.USER.wire) is LoyaltyWalletRead.Unavailable)
        assertTrue(load(listOf(lot(policy = "future"))) is LoyaltyWalletRead.Unavailable)
    }
    @Test fun `cross wallet duplicate lots future acceptance and wrong expiry fail closed`() {
        for (lots in listOf(listOf(lot(walletId = 2)), listOf(lot(), lot()),
            listOf(lot(acceptedAt = now.plusSeconds(1))),
            listOf(lot().copy(expiresAt = now)))) assertTrue(load(lots) is LoyaltyWalletRead.Unavailable)
    }
    @Test fun `corrupt magnitudes conservation and revision fail closed`() {
        for (lots in listOf(listOf(lot(issued = "9")), listOf(lot(free = "-1")),
            listOf(lot(free = "01")), listOf(lot(issued = Long.MAX_VALUE.toString(), free = Long.MAX_VALUE.toString()), lot(2)))) {
            assertTrue(load(lots) is LoyaltyWalletRead.Unavailable)
        }
        assertTrue(load(emptyList(), revision = "-1") is LoyaltyWalletRead.Unavailable)
        assertTrue(load(emptyList(), revision = "9223372036854775808") is LoyaltyWalletRead.Unavailable)
        val exhausted = (load(emptyList(), revision = Long.MAX_VALUE.toString()) as LoyaltyWalletRead.Available).snapshot
        assertNull(exhausted.revision.next())
    }
    @Test fun `fingerprints frame UTF8 lengths and field boundaries canonically`() {
        assertNotEquals(LoyaltyFingerprint.canonical(listOf("a", "bc")), LoyaltyFingerprint.canonical(listOf("ab", "c")))
        assertNotEquals(LoyaltyFingerprint.canonical(listOf("a|b", "c")), LoyaltyFingerprint.canonical(listOf("a", "b|c")))
        assertEquals(LoyaltyFingerprint.canonical(listOf("á", "")), LoyaltyFingerprint.canonical(listOf("á", "")))
        assertNull(LoyaltyFingerprint.fromWire("A".repeat(64)))
    }
    @Test fun `global command namespace conflicts on every identity component`() {
        val id = UUID.fromString("12345678-1234-1234-1234-123456789abc")
        val hash = LoyaltyFingerprint.canonical(listOf("payload"))
        fun binding(realm: LoyaltyRealm = LoyaltyRealm.USER, actor: Long = 2,
                    op: LoyaltyCommandOperation = LoyaltyCommandOperation.ADMIN_ADJUSTMENT,
                    ref: String = "1", fingerprint: LoyaltyFingerprint = hash) = requireNotNull(
            LoyaltyCommandBinding.create(id, realm, actor, op, LoyaltyAggregateType.WALLET, ref, fingerprint))
        val original = binding()
        assertEquals(LoyaltyCommandMatch.EXACT_REPLAY, original.match(binding()))
        for (other in listOf(binding(realm = LoyaltyRealm.SYSTEM, op = LoyaltyCommandOperation.MATERIALIZE_EXPIRY), binding(actor = 3),
            binding(ref = "2"),
            binding(fingerprint = LoyaltyFingerprint.canonical(listOf("changed"))))) {
            assertEquals(LoyaltyCommandMatch.CONFLICT, original.match(other))
        }
        assertNull(LoyaltyCommandBinding.create(UUID(0, 0), LoyaltyRealm.USER, 2,
            LoyaltyCommandOperation.ADMIN_ADJUSTMENT, LoyaltyAggregateType.WALLET, "1", hash))
        assertNull(LoyaltyCommandBinding.create(id, LoyaltyRealm.UNKNOWN, 2,
            LoyaltyCommandOperation.ADMIN_ADJUSTMENT, LoyaltyAggregateType.WALLET, "1", hash))
    }
    @Test fun `closed persistence vocabulary rejects unknown wire`() {
        assertEquals(LoyaltyRealm.UNKNOWN, LoyaltyRealm.fromWire("user"))
        assertEquals(LoyaltyCommandOperation.UNKNOWN, LoyaltyCommandOperation.fromWire("ADJUST"))
        assertEquals(LoyaltyAggregateType.UNKNOWN, LoyaltyAggregateType.fromWire("future"))
        assertEquals(LoyaltyAllocationKind.UNKNOWN, LoyaltyAllocationKind.fromWire("RESERVE"))
        assertEquals(LoyaltyAuditAction.UNKNOWN, LoyaltyAuditAction.fromWire("future"))
        assertEquals(LoyaltyReceiptStatus.UNKNOWN, LoyaltyReceiptStatus.fromWire(202))
    }
    @Test fun `historical receipt retains snapshots and rejects inconsistent outcome status`() {
        val before = (load(emptyList()) as LoyaltyWalletRead.Available).snapshot
        val after = (load(listOf(lot()), revision = "1") as LoyaltyWalletRead.Available).snapshot
        val binding = requireNotNull(LoyaltyCommandBinding.create(UUID.randomUUID(), LoyaltyRealm.USER, 2,
            LoyaltyCommandOperation.ADMIN_ADJUSTMENT, LoyaltyAggregateType.WALLET, "1", LoyaltyFingerprint.canonical(listOf("x"))))
        val receipt = requireNotNull(LoyaltyCommandReceipt.create(binding, LoyaltyOutcome.APPLIED,
            LoyaltyReceiptStatus.OK, before, after, now))
        load(listOf(lot(free = "9", issued = "9")))
        assertEquals(10L, receipt.after.availablePoints.value)
        assertNull(LoyaltyCommandReceipt.create(binding, LoyaltyOutcome.UNKNOWN, LoyaltyReceiptStatus.CONFLICT, before, after, now))
        assertNull(LoyaltyCommandReceipt.create(binding, LoyaltyOutcome.APPLIED, LoyaltyReceiptStatus.CONFLICT, before, after, now))
    }
    @Test fun `operation admits only its authorized realm`() {
        val hash = LoyaltyFingerprint.canonical(listOf("x"))
        val reservation = UUID.randomUUID().toString()
        for (realm in LoyaltyRealm.entries) for (op in LoyaltyCommandOperation.entries) for (aggregate in LoyaltyAggregateType.entries) {
            val ref = if (aggregate == LoyaltyAggregateType.RESERVATION) reservation else "1"
            val value = LoyaltyCommandBinding.create(UUID.randomUUID(), realm, 2, op, aggregate, ref, hash)
            val valid = when (op) {
                LoyaltyCommandOperation.ADMIN_ADJUSTMENT -> realm == LoyaltyRealm.USER && aggregate == LoyaltyAggregateType.WALLET
                LoyaltyCommandOperation.MATERIALIZE_EXPIRY -> realm == LoyaltyRealm.SYSTEM && aggregate == LoyaltyAggregateType.WALLET
                LoyaltyCommandOperation.CREATE_RESERVATION -> realm == LoyaltyRealm.CUSTOMER && aggregate == LoyaltyAggregateType.WALLET
                LoyaltyCommandOperation.CANCEL_RESERVATION -> realm == LoyaltyRealm.CUSTOMER && aggregate == LoyaltyAggregateType.RESERVATION
                LoyaltyCommandOperation.EXPIRE_RESERVATION -> realm == LoyaltyRealm.SYSTEM && aggregate == LoyaltyAggregateType.RESERVATION
                LoyaltyCommandOperation.UNKNOWN -> false
            }
            assertEquals(valid, value != null, "$realm $op $aggregate")
        }
    }

    @Test fun `reservation command aggregates require their canonical identity shape`() {
        val hash = LoyaltyFingerprint.canonical(listOf("x"))
        val id = UUID.randomUUID()
        assertNotNull(LoyaltyCommandBinding.create(id, LoyaltyRealm.CUSTOMER, 7,
            LoyaltyCommandOperation.CREATE_RESERVATION, LoyaltyAggregateType.WALLET, "9", hash))
        val reservation = UUID.randomUUID().toString()
        assertNotNull(LoyaltyCommandBinding.create(id, LoyaltyRealm.CUSTOMER, 7,
            LoyaltyCommandOperation.CANCEL_RESERVATION, LoyaltyAggregateType.RESERVATION, reservation, hash))
        for (invalid in listOf(reservation.uppercase(), "{$reservation}", UUID(0, 0).toString(), "not-a-uuid")) {
            assertNull(LoyaltyCommandBinding.create(id, LoyaltyRealm.CUSTOMER, 7,
                LoyaltyCommandOperation.CANCEL_RESERVATION, LoyaltyAggregateType.RESERVATION, invalid, hash))
        }
    }
    @Test fun `receipt applies exactly one revision and rejections preserve state`() {
        fun snapshot(revision: String, lots: List<LoyaltyPersistedLot> = emptyList()) =
            (load(lots, revision) as LoyaltyWalletRead.Available).snapshot
        val binding = requireNotNull(LoyaltyCommandBinding.create(UUID.randomUUID(), LoyaltyRealm.USER, 2,
            LoyaltyCommandOperation.ADMIN_ADJUSTMENT, LoyaltyAggregateType.WALLET, "1", LoyaltyFingerprint.canonical(listOf("x"))))
        assertNull(LoyaltyCommandReceipt.create(binding, LoyaltyOutcome.APPLIED, LoyaltyReceiptStatus.OK, snapshot("0"), snapshot("0"), now))
        assertNull(LoyaltyCommandReceipt.create(binding, LoyaltyOutcome.APPLIED, LoyaltyReceiptStatus.OK, snapshot("0"), snapshot("2"), now))
        assertNotNull(LoyaltyCommandReceipt.create(binding, LoyaltyOutcome.APPLIED, LoyaltyReceiptStatus.OK, snapshot("0"), snapshot("1"), now))
        assertNull(LoyaltyCommandReceipt.create(binding, LoyaltyOutcome.REVISION_CONFLICT, LoyaltyReceiptStatus.CONFLICT, snapshot("0"), snapshot("1"), now))
        assertNull(LoyaltyCommandReceipt.create(binding, LoyaltyOutcome.REVISION_CONFLICT, LoyaltyReceiptStatus.CONFLICT, snapshot("0"), snapshot("0", listOf(lot())), now))
        assertNull(LoyaltyCommandReceipt.create(binding, LoyaltyOutcome.APPLIED, LoyaltyReceiptStatus.OK, snapshot(Long.MAX_VALUE.toString()), snapshot(Long.MAX_VALUE.toString()), now))
        assertNotNull(LoyaltyCommandReceipt.create(binding, LoyaltyOutcome.REVISION_EXHAUSTED, LoyaltyReceiptStatus.CONFLICT, snapshot(Long.MAX_VALUE.toString()), snapshot(Long.MAX_VALUE.toString()), now))
        assertEquals(LoyaltyReceiptStatus.UNKNOWN, LoyaltyReceiptStatus.fromWire(201))
    }

    @Test fun `canonical identity rejects malformed Unicode instead of replacement collisions`() {
        for (raw in listOf("\uD800", "\uDC00", "x\uD800y")) {
            assertThrows(java.nio.charset.CharacterCodingException::class.java) {
                LoyaltyFingerprint.canonical(listOf(raw))
            }
        }
    }
}
