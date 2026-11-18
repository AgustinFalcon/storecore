package com.storecore.catalog.domain.media

interface MediaWireType {
    val wire: String
}

enum class MediaAssetState(override val wire: String) : MediaWireType {
    AWAITING_BYTES("AWAITING_BYTES"), STORED_PRIVATE("STORED_PRIVATE"), ATTACHED("ATTACHED"),
    DELETE_PENDING("DELETE_PENDING"), DELETED("DELETED"), FAILED("FAILED"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?): MediaAssetState = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}

enum class MediaFormat(override val wire: String) : MediaWireType {
    JPEG("JPEG"), PNG("PNG"), WEBP("WEBP"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?): MediaFormat = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}

enum class MediaProviderKind(override val wire: String) : MediaWireType {
    UNCONFIGURED("UNCONFIGURED"), TEST_STUB("TEST_STUB"), CLOUDINARY("CLOUDINARY"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?): MediaProviderKind = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}

enum class MediaAssociationKind(override val wire: String) : MediaWireType {
    PRODUCT_GALLERY("PRODUCT_GALLERY"), VARIANT_GALLERY("VARIANT_GALLERY"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?): MediaAssociationKind = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}

enum class LegacyMediaState(override val wire: String) : MediaWireType {
    ALLOWED("ALLOWED"), BLOCKED("BLOCKED"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?): LegacyMediaState = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}

enum class MediaUploadOutcome(override val wire: String) : MediaWireType {
    CREATED("CREATED"), REPLAY("REPLAY"), REJECTED("REJECTED"), CONFLICT("CONFLICT"), FAILED("FAILED"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?): MediaUploadOutcome = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}

enum class MediaCommandState(override val wire: String) : MediaWireType {
    AWAITING_BYTES("AWAITING_BYTES"), CLAIMED("CLAIMED"), STORED_PRIVATE("STORED_PRIVATE"),
    ATTACHED("ATTACHED"), DELETE_PENDING("DELETE_PENDING"), COMPLETED("COMPLETED"), FAILED("FAILED"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?): MediaCommandState = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}

enum class MediaFailureCode(override val wire: String) : MediaWireType {
    NONE("NONE"), UNAUTHORISED("UNAUTHORISED"), INVALID_FORMAT("INVALID_FORMAT"), INVALID_DIMENSIONS("INVALID_DIMENSIONS"),
    SIZE_EXCEEDED("SIZE_EXCEEDED"), CORRUPT_BYTES("CORRUPT_BYTES"), ANIMATED_MEDIA("ANIMATED_MEDIA"),
    STORAGE_UNAVAILABLE("STORAGE_UNAVAILABLE"), SCOPE_CONFLICT("SCOPE_CONFLICT"), UNKNOWN("UNKNOWN");
    companion object { fun fromWire(raw: String?): MediaFailureCode = entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN }
}
