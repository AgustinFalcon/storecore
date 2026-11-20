package com.storecore.catalog.infrastructure.media.worker

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path

class MediaWorkerJobFilesTest {
    @TempDir lateinit var workspace: Path

    @Test
    fun `reads required regular files and creates artifacts once`() {
        val input = MediaWorkerTestFixtures.image("png")
        MediaWorkerTestFixtures.workspace(workspace, input)
        val files = MediaWorkerJobFiles.open(workspace)
        assertArrayEquals(input, files.readInput(input.size.toLong()))
        files.writeOutput(byteArrayOf(1, 2, 3))
        files.writeResult(byteArrayOf(4, 5))
        assertThrows(Exception::class.java) { files.writeOutput(byteArrayOf(9)) }
        assertThrows(Exception::class.java) { files.writeResult(byteArrayOf(9)) }
    }

    @Test
    fun `rejects unknown workspace names`() {
        val input = MediaWorkerTestFixtures.image("png")
        MediaWorkerTestFixtures.workspace(workspace, input)
        Files.writeString(workspace.resolve("unexpected.txt"), "no")
        assertThrows(IllegalArgumentException::class.java) { MediaWorkerJobFiles.open(workspace) }
    }

    @Test
    fun `rejects symlink input without following it`() {
        val input = MediaWorkerTestFixtures.image("png")
        val outside = Files.createTempFile("media-worker-outside", ".bin")
        Files.write(outside, input)
        Files.write(workspace.resolve("request.bin"), MediaWorkerProtocolCodec.encodeRequest(MediaWorkerTestFixtures.request(input)))
        val linked = runCatching { Files.createSymbolicLink(workspace.resolve("input.bin"), outside) }.isSuccess
        assumeTrue(linked, "host does not permit symlink creation")
        assertThrows(IllegalArgumentException::class.java) { MediaWorkerJobFiles.open(workspace) }
    }
}
