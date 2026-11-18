package com.storecore.catalog.application.media

import com.storecore.catalog.domain.media.MediaCleanupBatchSize

interface MediaDraftCleanupRepository {
    fun expireDrafts(batchSize: MediaCleanupBatchSize): Int
    fun enqueueOrphanDeletes(batchSize: MediaCleanupBatchSize): Int
}

data class MediaDraftCleanupBatchResult(val expiredDrafts: Int, val enqueuedDeletes: Int)

/** Either phase can be retried after a restart; external deletion is a separate worker. */
class MediaDraftCleanupService(private val repository: MediaDraftCleanupRepository) {
    fun runBatch(batchSize: MediaCleanupBatchSize): MediaDraftCleanupBatchResult {
        val expired = repository.expireDrafts(batchSize)
        return MediaDraftCleanupBatchResult(expired, repository.enqueueOrphanDeletes(batchSize))
    }
}
