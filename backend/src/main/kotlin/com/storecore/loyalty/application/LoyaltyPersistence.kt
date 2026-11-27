package com.storecore.loyalty.application

import com.storecore.loyalty.domain.*
import java.time.Instant
import java.util.UUID

/** Untrusted persistence rows are translated once, before any snapshot can escape. */
data class LoyaltyPersistedWallet(val id: Long, val customerId: Long, val ownerRealm: String?, val revision: String?, val policy: String?)
data class LoyaltyPersistedLot(
    val id: Long, val walletId: Long, val acceptedAt: Instant, val expiresAt: Instant, val policy: String?,
    val issued: String?, val free: String?, val held: String?, val redeemed: String?, val expired: String?, val reversed: String?,
)

enum class LoyaltyWalletUnavailableReason { NOT_FOUND, CORRUPT_EVIDENCE }
sealed class LoyaltyWalletRead {
    class Available(val snapshot: LoyaltyWalletSnapshot) : LoyaltyWalletRead()
    class Unavailable(val reason: LoyaltyWalletUnavailableReason) : LoyaltyWalletRead()
}

object LoyaltyWalletTranslator {
    fun fromWire(wallet: LoyaltyPersistedWallet, rows: List<LoyaltyPersistedLot>, now: Instant): LoyaltyWalletRead {
        fun corrupt() = LoyaltyWalletRead.Unavailable(LoyaltyWalletUnavailableReason.CORRUPT_EVIDENCE)
        if (LoyaltyRealm.fromWire(wallet.ownerRealm) != LoyaltyRealm.CUSTOMER) return corrupt()
        val revision = LoyaltyRevision.fromWire(wallet.revision) ?: return corrupt()
        val policy = LoyaltyPolicyId.fromWire(wallet.policy)
        if (policy != LoyaltyPolicyId.V1) return corrupt()
        val lots = rows.map { row ->
            if (row.walletId != wallet.id || LoyaltyPolicyId.fromWire(row.policy) != policy) return corrupt()
            val issued = LoyaltyPoints.fromWire(row.issued) ?: return corrupt()
            val free = LoyaltyPoints.fromWire(row.free) ?: return corrupt()
            val held = LoyaltyPoints.fromWire(row.held) ?: return corrupt()
            val redeemed = LoyaltyPoints.fromWire(row.redeemed) ?: return corrupt()
            val expired = LoyaltyPoints.fromWire(row.expired) ?: return corrupt()
            val reversed = LoyaltyPoints.fromWire(row.reversed) ?: return corrupt()
            val lot = LoyaltyLot.create(row.id, row.acceptedAt, issued, free, held, redeemed, expired, reversed) ?: return corrupt()
            if (lot.expiresAt != row.expiresAt) return corrupt()
            lot
        }
        val snapshot = LoyaltyWalletSnapshot.create(wallet.id, wallet.customerId, revision, policy, lots, now) ?: return corrupt()
        return LoyaltyWalletRead.Available(snapshot)
    }
}

interface LoyaltyWalletRepository { fun findByCustomer(customerId: Long, now: Instant): LoyaltyWalletRead }
interface LoyaltyCommandPort {
    /** Adapter must enforce current actor authority before returning a private historical receipt. */
    fun findReceipt(commandId: UUID, realm: LoyaltyRealm, actorId: Long): LoyaltyCommandReceipt?
}
fun interface LoyaltyClock { fun now(): Instant }
fun interface LoyaltyIds { fun next(): UUID }
