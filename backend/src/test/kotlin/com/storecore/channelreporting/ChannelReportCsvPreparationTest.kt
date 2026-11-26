package com.storecore.channelreporting

import com.storecore.channelreporting.application.PreparedChannelReportCsv
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ChannelReportCsvPreparationTest {
    @Test fun `prepared artifact owns defensive bytes and releases them idempotently`() {
        val source = "evidence".toByteArray()
        val artifact = PreparedChannelReportCsv.create(source)
        source.fill(0)

        val first = artifact.readBytes()!!
        assertContentEquals("evidence".toByteArray(), first)
        first.fill(0)
        assertContentEquals("evidence".toByteArray(), artifact.readBytes())
        assertFalse(artifact.isReleased())

        artifact.close()
        artifact.close()
        assertTrue(artifact.isReleased())
        assertNull(artifact.readBytes())
    }
}
