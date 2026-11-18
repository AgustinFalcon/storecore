package com.storecore.catalog.media

import com.storecore.catalog.application.media.*
import com.storecore.catalog.domain.media.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class MediaDraftCleanupDomainTest {
    @Test fun `batch rejects absent empty negative and excessive limits`() {
        listOf(null, Int.MIN_VALUE, -1, 0, 101, Int.MAX_VALUE).forEach {
            assertNull(MediaCleanupBatchSize.fromWire(it))
        }
        assertEquals(1, MediaCleanupBatchSize.fromWire(1)!!.value)
        assertEquals(100, MediaCleanupBatchSize.fromWire(100)!!.value)
    }

    @Test fun `closed drafts permit orphan cleanup and unknown remains fail closed`() {
        listOf(CatalogMediaDraftState.CLAIMED, CatalogMediaDraftState.EXPIRED, CatalogMediaDraftState.ABANDONED).forEach {
            assertSame(it, CatalogMediaDraftState.fromWire(it.wire))
            assertTrue(it.permitsOrphanCleanup)
        }
        assertFalse(CatalogMediaDraftState.OPEN.permitsOrphanCleanup)
        listOf(null, "", "future", "expired").forEach {
            assertSame(CatalogMediaDraftState.UNKNOWN, CatalogMediaDraftState.fromWire(it))
            assertFalse(CatalogMediaDraftState.fromWire(it).permitsOrphanCleanup)
        }
    }

    @Test fun `cleanup resumes second phase even when no new draft expires`() {
        val batch = MediaCleanupBatchSize.fromWire(7)!!
        val calls = mutableListOf<MediaCleanupBatchSize>()
        val repository = object : MediaDraftCleanupRepository {
            override fun expireDrafts(batchSize: MediaCleanupBatchSize): Int { calls.add(batchSize); return 0 }
            override fun enqueueOrphanDeletes(batchSize: MediaCleanupBatchSize): Int { calls.add(batchSize); return 3 }
        }
        assertEquals(MediaDraftCleanupBatchResult(0, 3), MediaDraftCleanupService(repository).runBatch(batch))
        assertEquals(listOf(batch, batch), calls)
    }
}
