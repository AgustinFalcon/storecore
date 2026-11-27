package com.storecore.loyalty.domain

import java.nio.ByteBuffer
import java.nio.CharBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.util.UUID

internal fun String.loyaltyCanonicalUtf8(): ByteArray {
    val encoded = Charsets.UTF_8.newEncoder()
        .onMalformedInput(CodingErrorAction.REPORT)
        .onUnmappableCharacter(CodingErrorAction.REPORT)
        .encode(CharBuffer.wrap(this))
    return ByteArray(encoded.remaining()).also { encoded.get(it) }
}
private inline fun <reified T : Enum<T>> persistenceClosed(raw: String?, unknown: T): T =
    enumValues<T>().firstOrNull { it.name == raw } ?: unknown

enum class LoyaltyRealm {
    CUSTOMER, USER, SYSTEM, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyRealm = persistenceClosed(raw, UNKNOWN) }
}
enum class LoyaltyCommandOperation {
    ADMIN_ADJUSTMENT, MATERIALIZE_EXPIRY, UNKNOWN;
    val wire: String get() = name
    fun admits(realm: LoyaltyRealm): Boolean = when (this) {
        ADMIN_ADJUSTMENT -> realm == LoyaltyRealm.USER
        MATERIALIZE_EXPIRY -> realm == LoyaltyRealm.SYSTEM
        UNKNOWN -> false
    }
    companion object { fun fromWire(raw: String?): LoyaltyCommandOperation = persistenceClosed(raw, UNKNOWN) }
}
enum class LoyaltyAggregateType {
    WALLET, UNKNOWN;
    val wire: String get() = name
    fun accepts(ref: String): Boolean = this == WALLET && ref.matches(Regex("[1-9][0-9]*")) && ref.toLongOrNull() != null
    companion object { fun fromWire(raw: String?): LoyaltyAggregateType = persistenceClosed(raw, UNKNOWN) }
}
enum class LoyaltyAllocationKind {
    ISSUE, REVERSE, EXPIRE, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyAllocationKind = persistenceClosed(raw, UNKNOWN) }
}
enum class LoyaltyAuditAction {
    COMMAND_RECORDED, UNKNOWN;
    val wire: String get() = name
    companion object { fun fromWire(raw: String?): LoyaltyAuditAction = persistenceClosed(raw, UNKNOWN) }
}
enum class LoyaltyReceiptStatus(val code: Int) {
    OK(200), CONFLICT(409), UNKNOWN(0);
    fun accepts(outcome: LoyaltyOutcome): Boolean = outcome != LoyaltyOutcome.UNKNOWN && when (this) {
        OK -> outcome == LoyaltyOutcome.APPLIED
        CONFLICT -> outcome != LoyaltyOutcome.APPLIED
        UNKNOWN -> false
    }
    companion object { fun fromWire(raw: Int?): LoyaltyReceiptStatus = entries.firstOrNull { it != UNKNOWN && it.code == raw } ?: UNKNOWN }
}

class LoyaltyFingerprint private constructor(val value: String) {
    override fun equals(other: Any?): Boolean = other is LoyaltyFingerprint && value == other.value
    override fun hashCode(): Int = value.hashCode()
    companion object {
        fun fromWire(raw: String?): LoyaltyFingerprint? = raw?.takeIf { it.matches(Regex("[0-9a-f]{64}")) }?.let(::LoyaltyFingerprint)
        /** Count and UTF-8 byte lengths are framed as signed positive 32-bit big-endian integers. */
        fun canonical(fields: List<String>): LoyaltyFingerprint {
            val digest = MessageDigest.getInstance("SHA-256")
            fun length(value: Int) { digest.update(ByteBuffer.allocate(Int.SIZE_BYTES).putInt(value).array()) }
            length(fields.size)
            fields.forEach { field -> val bytes = field.loyaltyCanonicalUtf8(); length(bytes.size); digest.update(bytes) }
            return LoyaltyFingerprint(digest.digest().joinToString("") { "%02x".format(it) })
        }
    }
}
enum class LoyaltyCommandMatch { DIFFERENT_COMMAND, EXACT_REPLAY, CONFLICT }

class LoyaltyCommandBinding private constructor(
    val commandId: UUID, val realm: LoyaltyRealm, val actorId: Long,
    val operation: LoyaltyCommandOperation, val aggregateType: LoyaltyAggregateType,
    val aggregateRef: String, val requestHash: LoyaltyFingerprint,
) {
    fun match(other: LoyaltyCommandBinding): LoyaltyCommandMatch = when {
        commandId != other.commandId -> LoyaltyCommandMatch.DIFFERENT_COMMAND
        realm == other.realm && actorId == other.actorId && operation == other.operation &&
            aggregateType == other.aggregateType && aggregateRef == other.aggregateRef && requestHash == other.requestHash -> LoyaltyCommandMatch.EXACT_REPLAY
        else -> LoyaltyCommandMatch.CONFLICT
    }
    companion object {
        fun create(commandId: UUID, realm: LoyaltyRealm, actorId: Long, operation: LoyaltyCommandOperation,
                   aggregateType: LoyaltyAggregateType, aggregateRef: String, requestHash: LoyaltyFingerprint): LoyaltyCommandBinding? {
            if (commandId == UUID(0, 0) || realm == LoyaltyRealm.UNKNOWN || actorId <= 0 ||
                !operation.admits(realm) || !aggregateType.accepts(aggregateRef)) return null
            return LoyaltyCommandBinding(commandId, realm, actorId, operation, aggregateType, aggregateRef, requestHash)
        }
    }
}
