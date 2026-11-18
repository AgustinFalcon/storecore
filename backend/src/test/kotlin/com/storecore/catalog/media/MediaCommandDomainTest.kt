package com.storecore.catalog.media

import com.storecore.catalog.domain.media.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class MediaCommandDomainTest {
    @Test fun `delete wire types are closed and unknown fails closed`() {
        assertEquals(MediaDeletePurpose.USER_DELETE, MediaDeletePurpose.fromWire("USER_DELETE"))
        assertEquals(MediaDeletePurpose.UNKNOWN, MediaDeletePurpose.fromWire("user_delete"))
        assertEquals(MediaDeleteState.TOMBSTONED, MediaDeleteState.fromWire("TOMBSTONED"))
        assertEquals(MediaDeleteState.UNKNOWN, MediaDeleteState.fromWire("DONE"))
        assertEquals(MediaDeleteOutcome.DIGEST_MISMATCH, MediaDeleteOutcome.fromWire("DIGEST_MISMATCH"))
        assertEquals(MediaDeleteOutcome.UNKNOWN, MediaDeleteOutcome.fromWire(null))
    }

    @Test fun `command values reject unsafe or non positive wire data`() {
        assertNotNull(MediaOwnerId.fromWire(1L))
        assertNull(MediaOwnerId.fromWire(0))
        assertNotNull(MediaProductId.fromWire(9))
        assertNull(MediaProductId.fromWire(-1))
        assertNotNull(MediaByteSize.fromWire(1L))
        assertNull(MediaByteSize.fromWire(0L))
        assertNotNull(MediaRequestHash.fromWire("a".repeat(64)))
        assertNull(MediaRequestHash.fromWire("A".repeat(64)))
    }
}
