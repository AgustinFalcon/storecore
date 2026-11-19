package com.storecore.catalog.media

import com.storecore.catalog.domain.media.ContentDigest
import com.storecore.catalog.domain.media.MediaByteSize
import com.storecore.catalog.infrastructure.media.worker.MediaWorkerSweepResult
import com.storecore.catalog.infrastructure.media.worker.MediaWorkerWorkspaceResult
import com.storecore.catalog.infrastructure.media.worker.PrivateMediaWorkerWorkspace
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.ByteArrayInputStream
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path
import java.nio.file.attribute.FileTime
import java.nio.file.attribute.PosixFileAttributeView
import java.nio.file.attribute.PosixFilePermission
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.UUID

class PrivateMediaWorkerWorkspaceTest {
    @TempDir lateinit var temporary: Path

    @Test
    fun `publishes with create-new and transfers artifact ownership until artifact close`() {
        val manager = PrivateMediaWorkerWorkspace(temporary.resolve("worker"))
        val lease = (manager.create(UUID.randomUUID()) as MediaWorkerWorkspaceResult.Created).lease
        val bytes = "normalized".toByteArray()

        val published = lease.publishInput(ByteArrayInputStream("source".toByteArray()), 6)
        assertNotNull(published)
        assertNull(lease.publishInput(ByteArrayInputStream("replacement".toByteArray()), 64))
        assertEquals("source", Files.readString(lease.input), "CREATE_NEW collision must preserve the first input")
        Files.write(lease.output, bytes)
        val digest = requireNotNull(ContentDigest.fromWire(sha256(bytes)))
        val artifact = lease.claimArtifact(requireNotNull(MediaByteSize.fromWire(bytes.size)), digest)
        assertNotNull(artifact)

        lease.close()
        assertTrue(Files.exists(lease.output, LinkOption.NOFOLLOW_LINKS))
        assertArrayEquals(bytes, requireNotNull(artifact).openStream().use { it.readAllBytes() })
        artifact.close()
        assertFalse(Files.exists(lease.directory, LinkOption.NOFOLLOW_LINKS))
    }

    @Test
    fun `claimed artifact keeps workspace active across lease close until artifact close`() {
        val root = temporary.resolve("worker")
        val manager = PrivateMediaWorkerWorkspace(root)
        val lease = (manager.create(UUID.randomUUID()) as MediaWorkerWorkspaceResult.Created).lease
        val bytes = "normalized".toByteArray()
        Files.write(lease.output, bytes)
        val artifact = requireNotNull(
            lease.claimArtifact(
                requireNotNull(MediaByteSize.fromWire(bytes.size)),
                requireNotNull(ContentDigest.fromWire(sha256(bytes))),
            ),
        )
        Files.setLastModifiedTime(lease.directory, FileTime.from(Instant.now().minus(Duration.ofHours(2))))

        lease.close()
        val swept = manager.sweep(Instant.now(), Duration.ofHours(1)) as MediaWorkerSweepResult.Completed
        assertEquals(0, swept.removed)
        assertTrue(Files.exists(lease.directory, LinkOption.NOFOLLOW_LINKS))

        artifact.close()
        assertFalse(Files.exists(lease.directory, LinkOption.NOFOLLOW_LINKS))
    }

    @Test
    fun `result and output symlinks are never followed`() {
        val manager = PrivateMediaWorkerWorkspace(temporary.resolve("worker"))
        val lease = (manager.create(UUID.randomUUID()) as MediaWorkerWorkspaceResult.Created).lease
        val sentinel = temporary.resolve("outside-result")
        val bytes = "outside".toByteArray()
        Files.write(sentinel, bytes)
        try {
            Files.createSymbolicLink(lease.result, sentinel)
            Files.createSymbolicLink(lease.output, sentinel)
        } catch (_: Exception) {
            lease.close()
            return
        }

        assertNull(lease.readResult(4_096))
        assertNull(
            lease.claimArtifact(
                requireNotNull(MediaByteSize.fromWire(bytes.size)),
                requireNotNull(ContentDigest.fromWire(sha256(bytes))),
            ),
        )
        assertArrayEquals(bytes, Files.readAllBytes(sentinel))
        lease.close()
    }

    @Test
    fun `artifact hashing rejects declared size mismatch without accepting trailing growth`() {
        val manager = PrivateMediaWorkerWorkspace(temporary.resolve("worker"))
        val lease = (manager.create(UUID.randomUUID()) as MediaWorkerWorkspaceResult.Created).lease
        val bytes = ByteArray(2 * 1024 * 1024) { 7 }
        Files.write(lease.output, bytes)

        assertNull(
            lease.claimArtifact(
                requireNotNull(MediaByteSize.fromWire(1)),
                requireNotNull(ContentDigest.fromWire(sha256(byteArrayOf(7)))),
            ),
        )
        lease.close()
    }

    @Test
    fun `ancestor symlink makes workspace unavailable and preserves target`() {
        val target = temporary.resolve("trusted-target")
        Files.createDirectory(target)
        val alias = temporary.resolve("alias")
        try {
            Files.createSymbolicLink(alias, target)
        } catch (_: Exception) {
            return
        }

        assertSame(
            MediaWorkerWorkspaceResult.Unavailable,
            PrivateMediaWorkerWorkspace(alias.resolve("worker")).create(UUID.randomUUID()),
        )
        assertFalse(Files.exists(target.resolve("worker"), LinkOption.NOFOLLOW_LINKS))
    }

    @Test
    fun `existing root with unverifiable or broad permissions is unavailable`() {
        val root = temporary.resolve("existing-worker")
        Files.createDirectory(root)
        val posix = Files.getFileAttributeView(root, PosixFileAttributeView::class.java, LinkOption.NOFOLLOW_LINKS)
        if (posix != null) {
            posix.setPermissions(PosixFilePermission.entries.toSet())
        } else {
            val acl = Files.getFileAttributeView(root, java.nio.file.attribute.AclFileAttributeView::class.java, LinkOption.NOFOLLOW_LINKS)
                ?: return
            val owner = acl.owner.name
            if (acl.acl.filter { it.type() == java.nio.file.attribute.AclEntryType.ALLOW }
                    .all { it.principal().name.equals(owner, ignoreCase = true) }) return
        }

        assertSame(MediaWorkerWorkspaceResult.Unavailable, PrivateMediaWorkerWorkspace(root).create(UUID.randomUUID()))
    }

    @Test
    fun `oversized and empty inputs fail closed and leave no partial file`() {
        val manager = PrivateMediaWorkerWorkspace(temporary.resolve("worker"))
        val lease = (manager.create(UUID.randomUUID()) as MediaWorkerWorkspaceResult.Created).lease

        assertNull(lease.publishInput(ByteArrayInputStream(ByteArray(5)), 4))
        assertFalse(Files.exists(lease.input, LinkOption.NOFOLLOW_LINKS))
        assertNull(lease.publishInput(ByteArrayInputStream(ByteArray(0)), 4))
        assertFalse(Files.exists(lease.input, LinkOption.NOFOLLOW_LINKS))
        lease.close()
    }

    @Test
    fun `sweeper deletes only stale allowlisted direct files`() {
        val root = temporary.resolve("worker")
        val manager = PrivateMediaWorkerWorkspace(root)
        val bootstrap = (manager.create(UUID.randomUUID()) as MediaWorkerWorkspaceResult.Created).lease
        bootstrap.close()
        val stale = root.resolve(UUID.randomUUID().toString())
        Files.createDirectory(stale)
        Files.write(stale.resolve("request.bin"), byteArrayOf(1))
        val past = Instant.now().minus(Duration.ofHours(2))
        Files.setLastModifiedTime(stale, FileTime.from(past))
        val result = manager.sweep(Instant.now(), Duration.ofHours(1))

        assertEquals(1, (result as MediaWorkerSweepResult.Completed).removed)
        assertFalse(Files.exists(stale, LinkOption.NOFOLLOW_LINKS))
    }

    @Test
    fun `unexpected entry is quarantined without touching outside sentinel`() {
        val root = temporary.resolve("worker")
        val manager = PrivateMediaWorkerWorkspace(root)
        val bootstrap = (manager.create(UUID.randomUUID()) as MediaWorkerWorkspaceResult.Created).lease
        bootstrap.close()
        val directory = root.resolve(UUID.randomUUID().toString())
        Files.createDirectory(directory)
        val sentinel = temporary.resolve("outside-sentinel")
        Files.writeString(sentinel, "preserve")
        Files.writeString(directory.resolve("unexpected"), "bad")
        Files.setLastModifiedTime(directory, FileTime.from(Instant.now().minus(Duration.ofHours(2))))

        assertTrue(manager.sweep(Instant.now(), Duration.ofHours(1)) is MediaWorkerSweepResult.Unsafe)
        assertEquals("preserve", Files.readString(sentinel))
        assertTrue(Files.list(root).use { stream -> stream.anyMatch { it.fileName.toString().startsWith(".quarantine-") } })
    }

    @Test
    fun `symlink is quarantined and outside sentinel remains intact when platform supports links`() {
        val root = temporary.resolve("worker")
        val manager = PrivateMediaWorkerWorkspace(root)
        val bootstrap = (manager.create(UUID.randomUUID()) as MediaWorkerWorkspaceResult.Created).lease
        bootstrap.close()
        val directory = root.resolve(UUID.randomUUID().toString())
        Files.createDirectory(directory)
        val sentinel = temporary.resolve("outside-sentinel")
        Files.writeString(sentinel, "preserve")
        try {
            Files.createSymbolicLink(directory.resolve("request.bin"), sentinel)
        } catch (_: Exception) {
            return
        }
        Files.setLastModifiedTime(directory, FileTime.from(Instant.now().minus(Duration.ofHours(2))))

        assertTrue(manager.sweep(Instant.now(), Duration.ofHours(1)) is MediaWorkerSweepResult.Unsafe)
        assertEquals("preserve", Files.readString(sentinel))
    }

    private fun sha256(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
}
