package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.infrastructure.media.MediaContainerPreflight
import com.storecore.catalog.infrastructure.media.MediaContainerPreflightOutcome
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

class MediaNormalizerWorkerMainTest {
    @TempDir lateinit var workspace: Path

    @Test
    fun `worker main contract writes accepted result after output`() {
        val input = MediaWorkerTestFixtures.image("png", alpha = true)
        val request = MediaWorkerTestFixtures.workspace(workspace, input)

        assertEquals(0, MediaNormalizerWorkerMain.run(workspace))
        val output = Files.readAllBytes(workspace.resolve("output.bin"))
        val response = MediaWorkerProtocolCodec.decodeResponse(Files.readAllBytes(workspace.resolve("result.bin")))
        assertTrue(response is MediaWorkerResponse.Accepted)
        response as MediaWorkerResponse.Accepted
        assertEquals(request.requestId, response.requestId)
        assertArrayEquals(request.nonce(), response.nonce())
        assertEquals(sha256(output), response.outputDigest)
        assertEquals(output.size.toLong(), response.outputSize.value)
        assertTrue(MediaContainerPreflight.inspect(output, MediaNormalizationLimits.standard()) is MediaContainerPreflightOutcome.Accepted)
    }

    @Test
    fun `file level main uses cwd and no arguments`() {
        val input = MediaWorkerTestFixtures.image("png", alpha = true)
        MediaWorkerTestFixtures.workspace(workspace, input)
        val previous = System.getProperty("user.dir")
        try {
            System.setProperty("user.dir", workspace.toString())
            main(emptyArray())
        } finally {
            System.setProperty("user.dir", previous)
        }
        assertTrue(MediaWorkerProtocolCodec.decodeResponse(Files.readAllBytes(workspace.resolve("result.bin"))) is MediaWorkerResponse.Accepted)
        assertTrue(Files.exists(workspace.resolve("output.bin")))
    }

    @Test
    fun `unknown reserved or trailing request exits unknown without artifacts`() {
        val input = MediaWorkerTestFixtures.image("png")
        val request = MediaWorkerProtocolCodec.encodeRequest(MediaWorkerTestFixtures.request(input))
        Files.write(workspace.resolve("input.bin"), input)
        Files.write(workspace.resolve("request.bin"), request + byteArrayOf(0))

        assertEquals(MediaNormalizerWorkerMain.UNKNOWN_EXIT, MediaNormalizerWorkerMain.run(workspace))
        assertFalse(Files.exists(workspace.resolve("result.bin")))
        assertFalse(Files.exists(workspace.resolve("output.bin")))
    }
}
