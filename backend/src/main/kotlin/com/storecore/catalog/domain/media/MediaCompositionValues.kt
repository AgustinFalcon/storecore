package com.storecore.catalog.domain.media

private const val MAX_SAFE_MEDIA_INTEGER = 9_007_199_254_740_991L

private fun safeMediaInteger(raw: Any?): Long? = when (raw) {
    is Byte -> raw.toLong()
    is Short -> raw.toLong()
    is Int -> raw.toLong()
    is Long -> raw
    else -> null
}?.takeIf { it in 1..MAX_SAFE_MEDIA_INTEGER }

@JvmInline value class MediaCompositionRevision private constructor(val value: Long) {
    fun next(): MediaCompositionRevision? = fromWire(value + 1)
    companion object {
        fun fromWire(raw: Any?): MediaCompositionRevision? = safeMediaInteger(raw)?.let(::MediaCompositionRevision)
    }
}

@JvmInline value class ProductImageId private constructor(val value: Long) {
    companion object {
        fun fromWire(raw: Any?): ProductImageId? = safeMediaInteger(raw)?.let(::ProductImageId)
    }
}

@JvmInline value class MediaVariantId private constructor(val value: Long) {
    companion object {
        fun fromWire(raw: Any?): MediaVariantId? = safeMediaInteger(raw)?.let(::MediaVariantId)
    }
}
