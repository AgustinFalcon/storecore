package com.storecore.catalog.domain.media

enum class MediaDeletePurpose(override val wire: String) : MediaWireType {
    USER_DELETE("USER_DELETE"), ORPHAN_GC("ORPHAN_GC"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?): MediaDeletePurpose = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}

enum class MediaDeleteState(override val wire: String) : MediaWireType {
    PENDING("PENDING"), CLAIMED("CLAIMED"), RETRY("RETRY"), TOMBSTONED("TOMBSTONED"), BLOCKED("BLOCKED"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?): MediaDeleteState = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}

enum class MediaDeleteOutcome(override val wire: String) : MediaWireType {
    DELETED("DELETED"), ALREADY_ABSENT("ALREADY_ABSENT"), RETRYABLE_FAILURE("RETRYABLE_FAILURE"),
    DIGEST_MISMATCH("DIGEST_MISMATCH"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?): MediaDeleteOutcome = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}
