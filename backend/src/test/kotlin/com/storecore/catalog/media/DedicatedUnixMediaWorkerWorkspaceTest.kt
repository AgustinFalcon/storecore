package com.storecore.catalog.media

import com.storecore.catalog.infrastructure.media.worker.DedicatedUnixMediaWorkerWorkspace
import com.storecore.catalog.infrastructure.media.worker.MediaWorkerPrincipal
import com.storecore.catalog.infrastructure.media.worker.MediaWorkerWorkspaceAccess
import com.storecore.catalog.infrastructure.media.worker.MediaWorkerWorkspaceResult
import com.storecore.catalog.infrastructure.media.worker.WorkerUnixIdentity
import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path
import java.nio.file.attribute.PosixFileAttributeView
import java.nio.file.attribute.PosixFilePermission
import java.util.UUID

class DedicatedUnixMediaWorkerWorkspaceTest {
    @TempDir lateinit var temporary: Path

    @Test
    fun `missing dedicated unix account stays Unavailable`() {
        val manager = DedicatedUnixMediaWorkerWorkspace(temporary.resolve("worker"), identity = null)
        assertSame(MediaWorkerWorkspaceAccess.Unavailable, manager.accessFor(MediaWorkerPrincipal.DEDICATED_WORKER))
        assertSame(MediaWorkerWorkspaceResult.Unavailable, manager.create(UUID.randomUUID()))
    }

    @Test
    fun `posix group handoff shares the workspace with the dedicated principal`() {
        val posix = Files.getFileAttributeView(temporary, PosixFileAttributeView::class.java)
        assumeTrue(posix != null, "POSIX attributes are required for the dedicated-user handoff")
        val attributes = posix.readAttributes()
        val identity = requireNotNull(WorkerUnixIdentity.create(attributes.owner(), attributes.group()))
        val manager = DedicatedUnixMediaWorkerWorkspace(temporary.resolve("worker"), identity)
        assertSame(MediaWorkerWorkspaceAccess.Compatible, manager.accessFor(MediaWorkerPrincipal.DEDICATED_WORKER))
        val created = manager.create(UUID.randomUUID())
        assertTrue(created is MediaWorkerWorkspaceResult.Created, created.toString())
        val lease = (created as MediaWorkerWorkspaceResult.Created).lease
        val before = Files.getPosixFilePermissions(lease.directory)
        assertTrue(PosixFilePermission.GROUP_WRITE !in before)
        assertTrue(PosixFilePermission.GROUP_EXECUTE !in before)
        Files.writeString(lease.request, "self-test")
        assertTrue(PosixFilePermission.GROUP_READ !in Files.getPosixFilePermissions(lease.request))
        assertSame(MediaWorkerWorkspaceAccess.Compatible, manager.grantWorker(lease))
        val directoryView = Files.getFileAttributeView(lease.directory, PosixFileAttributeView::class.java, LinkOption.NOFOLLOW_LINKS)
        val requestView = Files.getFileAttributeView(lease.request, PosixFileAttributeView::class.java, LinkOption.NOFOLLOW_LINKS)
        assertEquals(identity.group, directoryView.readAttributes().group())
        assertEquals(identity.group, requestView.readAttributes().group())
        assertTrue(PosixFilePermission.GROUP_WRITE in directoryView.readAttributes().permissions())
        assertTrue(PosixFilePermission.GROUP_READ in requestView.readAttributes().permissions())
        val report = "matched-self-test".toByteArray()
        Files.write(lease.result, report)
        maybeAdoptWorkerOwner(lease.result, identity)
        assertArrayEquals(report, lease.readResult(report.size.toLong()))
        lease.close()
    }

    private fun maybeAdoptWorkerOwner(path: Path, identity: WorkerUnixIdentity) {
        val current = Files.getOwner(path, LinkOption.NOFOLLOW_LINKS)
        if (current == identity.user) return
        runCatching { Files.setOwner(path, identity.user) }
        assumeTrue(
            Files.getOwner(path, LinkOption.NOFOLLOW_LINKS) == identity.user,
            "cross-UID consume requires chown to the dedicated worker",
        )
    }
}
