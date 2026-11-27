package com.storecore.loyalty.domain

import java.time.Instant
import java.nio.charset.CharacterCodingException
import java.util.UUID

private fun UUID.isNonZero(): Boolean = this != UUID(0, 0)

class LoyaltySourceApplication private constructor(
    val id: UUID, val walletId: Long, val source: LoyaltySource, val sourceId: String,
    val policy: LoyaltyPolicyId, val points: LoyaltyPoints, val acceptedAt: Instant,
) {
    companion object {
        const val MAX_SOURCE_ID_LENGTH = 256
        fun create(id: UUID, walletId: Long, source: LoyaltySource, sourceId: String,
                   policy: LoyaltyPolicyId, points: LoyaltyPoints, acceptedAt: Instant): LoyaltySourceApplication? {
            val admittedInPersistenceCut = source == LoyaltySource.PAYMENT_ACCREDITATION ||
                source == LoyaltySource.ADMIN_ADJUSTMENT || source == LoyaltySource.EXPIRY
            if (!id.isNonZero() || walletId <= 0 || !admittedInPersistenceCut || policy != LoyaltyPolicyId.V1 ||
                points.value == 0L || acceptedAt.nano != 0 || sourceId.isBlank() || sourceId != sourceId.trim() ||
                sourceId.length > MAX_SOURCE_ID_LENGTH || sourceId.any { it.isISOControl() }) return null
            try { sourceId.loyaltyCanonicalUtf8() } catch (_: CharacterCodingException) { return null }
            return LoyaltySourceApplication(id, walletId, source, sourceId, policy, points, acceptedAt)
        }
    }
}

class LoyaltyLedgerEntry private constructor(
    val id: Long, val walletId: Long, val sourceApplicationId: UUID, val movement: LoyaltyMovement,
    val manualDirection: LoyaltyManualDirection?, val points: LoyaltyPoints, val recordedAt: Instant,
) {
    companion object {
        fun create(id: Long, walletId: Long, sourceApplicationId: UUID, movement: LoyaltyMovement,
                   manualDirection: LoyaltyManualDirection?, points: LoyaltyPoints, recordedAt: Instant): LoyaltyLedgerEntry? {
            if (id <= 0 || walletId <= 0 || !sourceApplicationId.isNonZero() || points.value == 0L || recordedAt.nano != 0) return null
            val complete = when (movement) {
                LoyaltyMovement.EARN, LoyaltyMovement.EXPIRE -> manualDirection == null
                LoyaltyMovement.MANUAL_ADJUSTMENT -> manualDirection == LoyaltyManualDirection.CREDIT || manualDirection == LoyaltyManualDirection.DEBIT
                else -> false
            }
            if (!complete) return null
            return LoyaltyLedgerEntry(id, walletId, sourceApplicationId, movement, manualDirection, points, recordedAt)
        }
    }
}

class LoyaltyAllocationEvent private constructor(
    val id: UUID, val walletId: Long, val lotId: Long, val ledgerEntryId: Long,
    val kind: LoyaltyAllocationKind, val points: LoyaltyPoints, val recordedAt: Instant,
) {
    companion object {
        fun create(id: UUID, walletId: Long, lotId: Long, ledgerEntryId: Long, kind: LoyaltyAllocationKind,
                   points: LoyaltyPoints, recordedAt: Instant): LoyaltyAllocationEvent? {
            if (!id.isNonZero() || walletId <= 0 || lotId <= 0 || ledgerEntryId <= 0 || kind == LoyaltyAllocationKind.UNKNOWN ||
                points.value == 0L || recordedAt.nano != 0) return null
            return LoyaltyAllocationEvent(id, walletId, lotId, ledgerEntryId, kind, points, recordedAt)
        }
    }
}

class LoyaltyAuditEntry private constructor(
    val id: UUID, val commandId: UUID, val walletId: Long, val action: LoyaltyAuditAction, val recordedAt: Instant,
) {
    companion object {
        fun create(id: UUID, commandId: UUID, walletId: Long, action: LoyaltyAuditAction, recordedAt: Instant): LoyaltyAuditEntry? {
            if (!id.isNonZero() || !commandId.isNonZero() || walletId <= 0 ||
                action != LoyaltyAuditAction.COMMAND_RECORDED || recordedAt.nano != 0) return null
            return LoyaltyAuditEntry(id, commandId, walletId, action, recordedAt)
        }
    }
}
