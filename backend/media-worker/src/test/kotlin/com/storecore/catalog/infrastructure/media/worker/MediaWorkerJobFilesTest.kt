package com.storecore.catalog.infrastructure.media.worker

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path
import java.nio.file.attribute.PosixFileAttributeView
import java.nio.file.attribute.PosixFilePermission

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
    fun `posix worker artifacts are group-readable 0660 and inherit the workspace group`() {
        val posix = Files.getFileAttributeView(workspace, PosixFileAttributeView::class.java)
        assumeTrue(posix != null, "POSIX attributes are required for worker 0660 artifacts")
        val input = MediaWorkerTestFixtures.image("png")
        MediaWorkerTestFixtures.workspace(workspace, input)
        val files = MediaWorkerJobFiles.open(workspace)
        files.writeOutput(byteArrayOf(1, 2, 3))
        files.writeResult(byteArrayOf(4, 5))
        val expected = setOf(
            PosixFilePermission.OWNER_READ,
            PosixFilePermission.OWNER_WRITE,
            PosixFilePermission.GROUP_READ,
            PosixFilePermission.GROUP_WRITE,
        )
        val outputView = Files.getFileAttributeView(workspace.resolve("output.bin"), PosixFileAttributeView::class.java, LinkOption.NOFOLLOW_LINKS)
        val resultView = Files.getFileAttributeView(workspace.resolve("result.bin"), PosixFileAttributeView::class.java, LinkOption.NOFOLLOW_LINKS)
        assertEquals(expected, outputView.readAttributes().permissions())
        assertEquals(expected, resultView.readAttributes().permissions())
        assertEquals(posix.readAttributes().group(), outputView.readAttributes().group())
        assertEquals(posix.readAttributes().group(), resultView.readAttributes().group())
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
