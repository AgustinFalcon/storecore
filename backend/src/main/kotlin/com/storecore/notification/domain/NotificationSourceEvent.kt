package com.storecore.notification.domain

@JvmInline value class NotificationEventHash private constructor(val value: String) {
    companion object {
        internal fun of(event: NotificationSourceEvent) = NotificationEventHash(lengthFramedSha256(listOf(
            "notification-event-v1", event.source.type.wire, event.source.id.value, event.category.wire,
            event.severity.wire, event.condition.value, event.episode.value,
        )))
    }
}

class NotificationSourceEvent private constructor(
    val deliveryId: NotificationDeliveryId, val source: NotificationSourceIdentity, val category: NotificationCategory,
    val severity: NotificationSeverity, val condition: NotificationConditionCode, val episode: NotificationEpisodeKey,
    val fingerprint: NotificationFingerprint,
) {
    fun canonicalHash(): NotificationEventHash = NotificationEventHash.of(this)
    companion object {
        fun create(deliveryId: NotificationDeliveryId, source: NotificationSourceIdentity, category: NotificationCategory,
                   severity: NotificationSeverity, condition: NotificationConditionCode, episode: NotificationEpisodeKey): NotificationSourceEvent? {
            if (source.type == NotificationSourceType.UNKNOWN || severity == NotificationSeverity.UNKNOWN) return null
            return NotificationSourceEvent(deliveryId, source, category, severity, condition, episode,
                NotificationFingerprint.v1(category, condition, episode) ?: return null)
        }
    }
}
