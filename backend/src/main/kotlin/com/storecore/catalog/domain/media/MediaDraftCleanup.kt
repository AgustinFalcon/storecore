package com.storecore.catalog.domain.media

/** A maintenance invocation always has a finite database workload. */
@JvmInline
value class MediaCleanupBatchSize private constructor(val value: Int) {
    companion object {
        fun fromWire(raw: Int?): MediaCleanupBatchSize? = raw?.takeIf { it in 1..100 }?.let(::MediaCleanupBatchSize)
    }
}
