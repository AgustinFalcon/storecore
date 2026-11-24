package com.storecore.notification.domain

import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.security.MessageDigest
import java.util.UUID

@JvmInline value class NotificationId private constructor(val value: UUID) {
    companion object { fun fromWire(raw: UUID?): NotificationId? = validUuid(raw)?.let(::NotificationId) }
}
@JvmInline value class NotificationActorId private constructor(val value: Long) {
    companion object { fun fromWire(raw: Long?): NotificationActorId? = raw?.takeIf { it > 0 }?.let(::NotificationActorId) }
}
@JvmInline value class NotificationCommandId private constructor(val value: UUID) {
    companion object { fun fromWire(raw: UUID?): NotificationCommandId? = validUuid(raw)?.let(::NotificationCommandId) }
}
@JvmInline value class NotificationDeliveryId private constructor(val value: UUID) {
    companion object { fun fromWire(raw: UUID?): NotificationDeliveryId? = validUuid(raw)?.let(::NotificationDeliveryId) }
}
@JvmInline value class NotificationRevision private constructor(val value: Long) {
    fun next(): NotificationRevision? = runCatching { NotificationRevision(Math.addExact(value, 1L)) }.getOrNull()
    companion object { fun fromWire(raw: Long?): NotificationRevision? = raw?.takeIf { it >= 0 }?.let(::NotificationRevision) }
}
@JvmInline value class NotificationSourceId private constructor(val value: String) {
    companion object { fun fromWire(raw: String?): NotificationSourceId? = boundedUtf8(raw, 128)?.let(::NotificationSourceId) }
}
@JvmInline value class NotificationEpisodeKey private constructor(val value: String) {
    companion object { fun fromWire(raw: String?): NotificationEpisodeKey? = boundedUtf8(raw, 128)?.let(::NotificationEpisodeKey) }
}
@JvmInline value class NotificationConditionCode private constructor(val value: String) {
    companion object {
        private val syntax = Regex("[A-Z0-9_.-]{1,64}")
        fun fromWire(raw: String?): NotificationConditionCode? = raw?.takeIf(syntax::matches)?.let(::NotificationConditionCode)
    }
}
@JvmInline value class NotificationReason private constructor(val value: String) {
    companion object {
        fun fromWire(raw: String?): NotificationReason? {
            val trimmed = raw?.trim(*asciiEdgeWhitespace) ?: return null
            if ('\u0000' in trimmed || strictUtf8(trimmed) == null || trimmed.codePointCount(0, trimmed.length) !in 1..500) return null
            return NotificationReason(trimmed)
        }
    }
}
@JvmInline value class NotificationFingerprint private constructor(val value: String) {
    companion object {
        fun fromWire(raw: String?): NotificationFingerprint? = validDigest(raw)?.let(::NotificationFingerprint)
        /** V1: four UTF-8 fields, each preceded by its unsigned 32-bit big-endian byte length. */
        fun v1(category: NotificationCategory, condition: NotificationConditionCode, episode: NotificationEpisodeKey): NotificationFingerprint? =
            if (category == NotificationCategory.UNKNOWN) null else NotificationFingerprint(lengthFramedSha256(
                listOf("notification-v1", category.wire, condition.value, episode.value),
            ))
    }
}
@JvmInline value class NotificationCommandPayloadHash private constructor(val value: String) {
    companion object {
        fun fromWire(raw: String?): NotificationCommandPayloadHash? = validDigest(raw)?.let(::NotificationCommandPayloadHash)
        internal fun v1(command: NotificationCommand.ChangeLifecycle) = NotificationCommandPayloadHash(lengthFramedSha256(listOf(
            "notification-command-v1", command.step.wire, command.notificationId.value.toString(), command.actorId.value.toString(),
            command.expectedRevision.value.toString(), command.reason.value,
        )))
    }
}

class NotificationSourceIdentity private constructor(val type: NotificationSourceType, val id: NotificationSourceId) {
    override fun equals(other: Any?) = other is NotificationSourceIdentity && type == other.type && id == other.id
    override fun hashCode() = 31 * type.hashCode() + id.hashCode()
    companion object {
        fun create(type: NotificationSourceType, id: NotificationSourceId): NotificationSourceIdentity? =
            if (type == NotificationSourceType.UNKNOWN) null else NotificationSourceIdentity(type, id)
        /** Persisted future source vocabularies remain representable for neutral read-only rendering. */
        fun restore(type: NotificationSourceType, id: NotificationSourceId): NotificationSourceIdentity =
            NotificationSourceIdentity(type, id)
    }
}

private fun validUuid(raw: UUID?): UUID? = raw?.takeIf { it != UUID(0, 0) }
private val digestSyntax = Regex("[0-9a-f]{64}")
private fun validDigest(raw: String?): String? = raw?.takeIf(digestSyntax::matches)
internal fun strictUtf8(value: String): ByteArray? = value.toByteArray(Charsets.UTF_8).takeIf { it.toString(Charsets.UTF_8) == value }
private val asciiEdgeWhitespace = charArrayOf(' ', '\t', '\n', '\r', '\u000B', '\u000C')
private fun boundedUtf8(raw: String?, max: Int): String? = raw?.takeIf { value ->
    '\u0000' !in value && strictUtf8(value)?.size?.let { it in 1..max } == true
}
private fun lengthFramedSha256(fields: List<String>): String {
    val bytes = ByteArrayOutputStream().also { buffer -> DataOutputStream(buffer).use { out ->
        fields.forEach { value -> val utf8 = requireNotNull(strictUtf8(value)); out.writeInt(utf8.size); out.write(utf8) }
    } }.toByteArray()
    return MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
