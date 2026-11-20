package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.application.media.MediaNormalizationArtifact
import com.storecore.catalog.domain.media.ContentDigest
import com.storecore.catalog.domain.media.MediaByteSize
import java.io.InputStream
import java.nio.file.FileAlreadyExistsException
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption
import java.nio.channels.Channels
import java.nio.file.attribute.PosixFilePermission
import java.nio.file.attribute.AclEntry
import java.nio.file.attribute.AclEntryPermission
import java.nio.file.attribute.AclEntryType
import java.nio.file.attribute.AclFileAttributeView
import java.nio.file.attribute.PosixFileAttributeView
import java.security.MessageDigest
import java.time.Duration
import java.time.Instant
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/** A private, single-level workspace. It never follows or recursively traverses links. */
class PrivateMediaWorkerWorkspace(
    root: Path,
    private val policy: MediaWorkerWorkspacePolicy = MediaWorkerWorkspacePolicy.PrivateBackend,
) : MediaWorkerWorkspaceManager {
    private val root = root.toAbsolutePath().normalize()
    private val active = ConcurrentHashMap.newKeySet<Path>()

    /**
     * Backend-only policy refuses the dedicated worker. DedicatedUnix policy is Compatible once the
     * Unix identity exists; Windows and missing accounts stay Unavailable.
     */
    override fun accessFor(principal: MediaWorkerPrincipal): MediaWorkerWorkspaceAccess = when (principal) {
        MediaWorkerPrincipal.DEDICATED_WORKER -> when (policy) {
            MediaWorkerWorkspacePolicy.PrivateBackend -> MediaWorkerWorkspaceAccess.Unavailable
            is MediaWorkerWorkspacePolicy.DedicatedUnix -> MediaWorkerWorkspaceAccess.Compatible
        }
        MediaWorkerPrincipal.UNKNOWN -> MediaWorkerWorkspaceAccess.Unknown
    }

    override fun grantWorker(lease: MediaWorkerWorkspaceLease): MediaWorkerWorkspaceAccess {
        val dedicated = policy as? MediaWorkerWorkspacePolicy.DedicatedUnix
            ?: return MediaWorkerWorkspaceAccess.Unavailable
        val directory = lease.directory.toAbsolutePath().normalize()
        if (directory.parent != root) return MediaWorkerWorkspaceAccess.Unknown
        if (!shareWithWorker(directory, dedicated, directory = true)) return MediaWorkerWorkspaceAccess.Unavailable
        listOf(lease.input, lease.request, lease.result, lease.output, lease.diagnostic).forEach { path ->
            if (!Files.exists(path, LinkOption.NOFOLLOW_LINKS)) return@forEach
            if (Files.isSymbolicLink(path)) return MediaWorkerWorkspaceAccess.Unavailable
            if (!shareWithWorker(path, dedicated, directory = false)) return MediaWorkerWorkspaceAccess.Unavailable
        }
        return MediaWorkerWorkspaceAccess.Compatible
    }

    override fun create(requestId: UUID): MediaWorkerWorkspaceResult = runCatching {
        ensureRoot() ?: return MediaWorkerWorkspaceResult.Unavailable
        val directory = root.resolve(requestId.toString()).normalize()
        if (directory.parent != root) return MediaWorkerWorkspaceResult.Unknown
        Files.createDirectory(directory)
        if (!restrict(directory, directory = true)) {
            quarantine(directory)
            return MediaWorkerWorkspaceResult.Unavailable
        }
        val identity = identity(directory) ?: run {
            quarantine(directory)
            return MediaWorkerWorkspaceResult.Unavailable
        }
        active.add(directory)
        MediaWorkerWorkspaceResult.Created(Lease(directory, identity))
    }.getOrElse {
        if (it is FileAlreadyExistsException) MediaWorkerWorkspaceResult.Unavailable
        else MediaWorkerWorkspaceResult.Unknown
    }

    override fun sweep(now: Instant, staleAfter: Duration): MediaWorkerSweepResult {
        if (staleAfter.isNegative || staleAfter.isZero) return MediaWorkerSweepResult.Unknown
        ensureRoot() ?: return MediaWorkerSweepResult.Unknown
        var removed = 0
        Files.newDirectoryStream(root).use { entries ->
            for (entry in entries) {
                val normalized = entry.toAbsolutePath().normalize()
                if (normalized.parent != root) return unsafe(MediaWorkerWorkspaceUnsafeReason.OUTSIDE_ROOT)
                val attributes = attributes(normalized)
                    ?: return quarantineUnsafe(normalized, MediaWorkerWorkspaceUnsafeReason.SYMLINK)
                if (normalized in active) continue
                if (normalized.fileName.toString().startsWith(QUARANTINE_PREFIX)) {
                    if (!attributes.isDirectory) return unsafe(MediaWorkerWorkspaceUnsafeReason.UNEXPECTED_ENTRY)
                    continue
                }
                if (!attributes.isDirectory) return quarantineUnsafe(normalized, MediaWorkerWorkspaceUnsafeReason.UNEXPECTED_ENTRY)
                if (!UUID_NAME.matches(normalized.fileName.toString())) {
                    return quarantineUnsafe(normalized, MediaWorkerWorkspaceUnsafeReason.UNEXPECTED_ENTRY)
                }
                if (attributes.lastModifiedTime().toInstant().plus(staleAfter).isAfter(now)) continue
                when (deleteKnownDirectory(normalized)) {
                    DeleteResult.DELETED -> removed++
                    DeleteResult.SYMLINK -> return quarantineUnsafe(normalized, MediaWorkerWorkspaceUnsafeReason.SYMLINK)
                    DeleteResult.UNEXPECTED -> return quarantineUnsafe(normalized, MediaWorkerWorkspaceUnsafeReason.UNEXPECTED_ENTRY)
                    DeleteResult.OWNER -> return quarantineUnsafe(normalized, MediaWorkerWorkspaceUnsafeReason.OWNER_MISMATCH)
                    DeleteResult.OUTSIDE -> return unsafe(MediaWorkerWorkspaceUnsafeReason.OUTSIDE_ROOT)
                }
            }
        }
        return MediaWorkerSweepResult.Completed(removed)
    }

    private inner class Lease(
        override val directory: Path,
        private val directoryIdentity: FileIdentity,
    ) : MediaWorkerWorkspaceLease {
        override val input = directory.resolve(INPUT)
        override val request = directory.resolve(REQUEST)
        override val result = directory.resolve(RESULT)
        override val output = directory.resolve(OUTPUT)
        override val diagnostic = directory.resolve(DIAGNOSTIC)
        @Volatile private var closed = false
        @Volatile private var artifactClaimed = false

        override fun publishInput(source: InputStream, maxBytes: Long): MediaPublishedInput? {
            if (closed || maxBytes <= 0 || !validDirectory()) return null
            var createdByInvocation = false
            return runCatching {
                val digest = MessageDigest.getInstance("SHA-256")
                var size = 0L
                Files.newOutputStream(input, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE).use { target ->
                    createdByInvocation = true
                    if (!restrict(input, directory = false)) throw IllegalStateException("private input unavailable")
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val count = source.read(buffer)
                        if (count < 0) break
                        if (count == 0) continue
                        size = Math.addExact(size, count.toLong())
                        if (size > maxBytes) throw InputLimitExceeded()
                        digest.update(buffer, 0, count)
                        target.write(buffer, 0, count)
                    }
                }
                val typedSize = MediaByteSize.fromWire(size) ?: throw InputLimitExceeded()
                val typedDigest = ContentDigest.fromWire(digest.digest().toHex()) ?: throw IllegalStateException()
                MediaPublishedInput(typedSize, typedDigest)
            }.getOrElse {
                if (createdByInvocation) Files.deleteIfExists(input)
                null
            }
        }

        override fun writeRequest(bytes: ByteArray): Boolean {
            if (closed || bytes.isEmpty() || !validDirectory()) return false
            return runCatching {
                Files.write(request, bytes, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)
                if (!restrict(request, directory = false)) {
                    Files.deleteIfExists(request)
                    return false
                }
                true
            }.getOrDefault(false)
        }

        override fun readResult(maxBytes: Long): ByteArray? {
            if (closed || maxBytes <= 0 || !validDirectory()) return null
            val expected = identity(result) ?: return null
            if (!expected.regularFile || !acceptedOwner(expected.owner, directoryIdentity.owner)) return null
            val channel = openVerified(result, directoryIdentity.owner, expected) ?: return null
            return runCatching {
                Channels.newInputStream(channel).use { source ->
                    val bytes = source.readNBytes(Math.addExact(maxBytes, 1).coerceAtMost(Int.MAX_VALUE.toLong()).toInt())
                    if (bytes.size.toLong() > maxBytes || source.read() != -1 || identity(result) != expected) null else bytes
                }
            }.getOrNull()
        }

        override fun claimArtifact(expectedSize: MediaByteSize, digest: ContentDigest): MediaNormalizationArtifact? {
            if (closed || artifactClaimed || !validDirectory()) return null
            val fileIdentity = identity(output) ?: return null
            if (!fileIdentity.regularFile || !acceptedOwner(fileIdentity.owner, directoryIdentity.owner)) return null
            val inspection = inspectVerified(output, directoryIdentity.owner, fileIdentity, expectedSize.value) ?: return null
            if (inspection.size != expectedSize.value || inspection.digest != digest.value) return null
            artifactClaimed = true
            return ClaimedArtifact(this, expectedSize, digest, fileIdentity)
        }

        override fun retainUnsafe(): MediaWorkerWorkspaceRetention {
            if (closed || !validDirectory()) return MediaWorkerWorkspaceRetention.Unknown
            // From this point cleanup is forbidden even when quarantine itself cannot be moved.
            // The active entry intentionally keeps the original workspace fenced in-process.
            closed = true
            val quarantined = quarantine(directory) ?: return MediaWorkerWorkspaceRetention.Unavailable
            if (quarantined.parent != root || !quarantined.fileName.toString().startsWith(QUARANTINE_PREFIX)) {
                return MediaWorkerWorkspaceRetention.Unknown
            }
            active.remove(directory)
            return MediaWorkerWorkspaceRetention.Retained
        }

        override fun close() {
            if (closed) return
            closed = true
            if (!artifactClaimed) {
                active.remove(directory)
                cleanupOrQuarantine(directory)
            }
        }

        private fun validDirectory(): Boolean = identity(directory) == directoryIdentity

        private inner class ClaimedArtifact(
            private val lease: Lease,
            override val size: MediaByteSize,
            private val digest: ContentDigest,
            private val fileIdentity: FileIdentity,
        ) : MediaNormalizationArtifact {
            @Volatile private var artifactClosed = false

            override fun openStream(): InputStream {
                check(!artifactClosed)
                val channel = openVerified(output, directoryIdentity.owner, fileIdentity) ?: error("artifact identity changed")
                try {
                    val inspection = inspectOpenChannel(channel, output, fileIdentity, size.value)
                    check(inspection?.digest == digest.value) { "artifact content changed" }
                    channel.position(0)
                    return Channels.newInputStream(channel)
                } catch (failure: Throwable) {
                    runCatching { channel.close() }
                    throw failure
                }
            }

            override fun close() {
                if (artifactClosed) return
                artifactClosed = true
                lease.closed = true
                active.remove(directory)
                cleanupOrQuarantine(directory)
            }
        }
    }

    private fun ensureRoot(): FileIdentity? = runCatching {
        val parent = root.parent ?: return null
        val hierarchy = trustedHierarchy(parent) ?: return null
        if (!Files.exists(root, LinkOption.NOFOLLOW_LINKS)) {
            Files.createDirectory(root)
            if (!restrict(root, directory = true)) return null
        }
        if (hierarchy.any { (path, expected) -> identity(path) != expected }) return null
        identity(root)?.takeIf { it.directory && verifyPrivacy(root, directory = true, owner = it.owner) }
    }.getOrNull()

    /**
     * Validates each already-existing hierarchy segment without link following. This relies on the
     * filesystem provider exposing symbolic links/reparse points through BasicFileAttributes; a
     * compromised kernel or provider remains outside the application security boundary.
     */
    private fun trustedHierarchy(path: Path): List<Pair<Path, FileIdentity>>? {
        val absolute = path.toAbsolutePath().normalize()
        var current = absolute.root ?: return null
        val trusted = mutableListOf<Pair<Path, FileIdentity>>()
        fun capture(candidate: Path): Boolean {
            val basic = runCatching {
                Files.readAttributes(candidate, java.nio.file.attribute.BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS)
            }.getOrNull() ?: return false
            if (!basic.isDirectory || basic.isSymbolicLink || basic.isOther) return false
            val value = identity(candidate) ?: return false
            trusted += candidate to value
            return true
        }
        if (!capture(current)) return null
        for (segment in absolute) {
            current = current.resolve(segment)
            if (!capture(current)) return null
        }
        return trusted
    }

    private fun cleanupOrQuarantine(directory: Path) {
        when (deleteKnownDirectory(directory)) {
            DeleteResult.DELETED -> Unit
            else -> quarantine(directory)
        }
    }

    private fun deleteKnownDirectory(directory: Path): DeleteResult {
        if (directory.toAbsolutePath().normalize().parent != root) return DeleteResult.OUTSIDE
        val parentIdentity = identity(directory) ?: return DeleteResult.SYMLINK
        if (!parentIdentity.directory) return DeleteResult.UNEXPECTED
        val rootIdentity = identity(root) ?: return DeleteResult.OWNER
        if (parentIdentity.owner != rootIdentity.owner) return DeleteResult.OWNER
        Files.newDirectoryStream(directory).use { children ->
            for (child in children) {
                if (child.toAbsolutePath().normalize().parent != directory) return DeleteResult.OUTSIDE
                val name = child.fileName.toString()
                if (name !in ALLOWED_FILES) return DeleteResult.UNEXPECTED
                val childIdentity = identity(child) ?: return DeleteResult.SYMLINK
                if (!childIdentity.regularFile) return DeleteResult.SYMLINK
                if (!acceptedOwner(childIdentity.owner, parentIdentity.owner)) return DeleteResult.OWNER
            }
        }
        ALLOWED_FILES.forEach { Files.deleteIfExists(directory.resolve(it)) }
        Files.delete(directory)
        return DeleteResult.DELETED
    }

    private fun quarantineUnsafe(path: Path, reason: MediaWorkerWorkspaceUnsafeReason): MediaWorkerSweepResult {
        quarantine(path)
        return unsafe(reason)
    }

    private fun quarantine(path: Path): Path? =
        runCatching {
            if (path.toAbsolutePath().normalize().parent == root && Files.exists(path, LinkOption.NOFOLLOW_LINKS)) {
                val target = root.resolve("$QUARANTINE_PREFIX${UUID.randomUUID()}")
                Files.move(path, target, StandardCopyOption.ATOMIC_MOVE)
            } else null
        }.getOrNull()

    private fun unsafe(reason: MediaWorkerWorkspaceUnsafeReason): MediaWorkerSweepResult =
        requireNotNull(MediaWorkerSweepResult.Unsafe.create(reason))

    private fun attributes(path: Path) = runCatching {
        Files.readAttributes(path, java.nio.file.attribute.BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS)
            .takeUnless { it.isSymbolicLink || it.isOther }
    }.getOrNull()

    private fun identity(path: Path): FileIdentity? = runCatching {
        val basic = Files.readAttributes(path, java.nio.file.attribute.BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS)
        if (basic.isSymbolicLink || basic.isOther) return null
        val owner = Files.getOwner(path, LinkOption.NOFOLLOW_LINKS).name
        // NTFS providers may not expose fileKey through BasicFileAttributes. In that case bind the
        // lease to the non-followed real path plus immutable creation time instead of disabling it.
        val key = basic.fileKey()?.toString()
            ?: "fallback:${path.toRealPath(LinkOption.NOFOLLOW_LINKS)}:${basic.creationTime().toMillis()}"
        FileIdentity(key, owner, basic.isDirectory, basic.isRegularFile)
    }.getOrNull()

    private fun acceptedOwner(actual: String, directoryOwner: String): Boolean = when (val current = policy) {
        MediaWorkerWorkspacePolicy.PrivateBackend -> actual == directoryOwner
        is MediaWorkerWorkspacePolicy.DedicatedUnix ->
            actual == directoryOwner || actual == current.identity.user.name
    }

    private fun shareWithWorker(
        path: Path,
        dedicated: MediaWorkerWorkspacePolicy.DedicatedUnix,
        directory: Boolean,
    ): Boolean = runCatching {
        val view = Files.getFileAttributeView(path, PosixFileAttributeView::class.java, LinkOption.NOFOLLOW_LINKS)
            ?: return false
        view.setGroup(dedicated.identity.group)
        view.setPermissions(sharedPermissions(directory))
        verifyAccess(path, directory, Files.getOwner(path, LinkOption.NOFOLLOW_LINKS).name, shared = true)
    }.getOrDefault(false)

    private fun privatePermissions(directory: Boolean) = if (directory) {
        setOf(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE, PosixFilePermission.OWNER_EXECUTE)
    } else {
        setOf(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE)
    }

    private fun sharedPermissions(directory: Boolean) = if (directory) {
        privatePermissions(true) + setOf(
            PosixFilePermission.GROUP_READ,
            PosixFilePermission.GROUP_WRITE,
            PosixFilePermission.GROUP_EXECUTE,
        )
    } else {
        privatePermissions(false) + setOf(PosixFilePermission.GROUP_READ, PosixFilePermission.GROUP_WRITE)
    }

    private fun restrict(path: Path, directory: Boolean): Boolean {
        val view = Files.getFileAttributeView(path, PosixFileAttributeView::class.java, LinkOption.NOFOLLOW_LINKS)
        if (view != null) {
            view.setPermissions(privatePermissions(directory))
            return verifyAccess(path, directory, Files.getOwner(path, LinkOption.NOFOLLOW_LINKS).name, shared = false)
        }
        val aclView = Files.getFileAttributeView(path, AclFileAttributeView::class.java, LinkOption.NOFOLLOW_LINKS)
            ?: return false
        val owner = aclView.owner
        val ownerEntry = AclEntry.newBuilder()
            .setType(AclEntryType.ALLOW)
            .setPrincipal(owner)
            .setPermissions(AclEntryPermission.entries.toSet())
            .build()
        aclView.acl = listOf(ownerEntry)
        return verifyAccess(path, directory, owner.name, shared = false)
    }

    private fun verifyPrivacy(path: Path, directory: Boolean, owner: String): Boolean =
        verifyAccess(path, directory, owner, shared = false)

    private fun verifyAccess(path: Path, directory: Boolean, owner: String, shared: Boolean): Boolean = runCatching {
        val posix = Files.getFileAttributeView(path, PosixFileAttributeView::class.java, LinkOption.NOFOLLOW_LINKS)
        if (posix != null) {
            val attributes = posix.readAttributes()
            val expected = if (shared) sharedPermissions(directory) else privatePermissions(directory)
            val groupMatches = if (!shared) true else {
                val dedicated = policy as? MediaWorkerWorkspacePolicy.DedicatedUnix ?: return@runCatching false
                attributes.group() == dedicated.identity.group
            }
            return@runCatching actualPermissions(attributes) == expected &&
                attributes.owner().name == owner &&
                groupMatches
        }
        val acl = Files.getFileAttributeView(path, AclFileAttributeView::class.java, LinkOption.NOFOLLOW_LINKS)
            ?: return@runCatching false
        acl.owner.name.equals(owner, ignoreCase = true) && acl.acl.isNotEmpty() &&
            acl.acl.filter { it.type() == AclEntryType.ALLOW }
                .all { it.principal().name.equals(owner, ignoreCase = true) }
    }.getOrDefault(false)

    private fun actualPermissions(attributes: java.nio.file.attribute.PosixFileAttributes) = attributes.permissions()

    private fun inspectVerified(path: Path, owner: String, expected: FileIdentity, expectedSize: Long): FileInspection? {
        val channel = openVerified(path, owner, expected) ?: return null
        return channel.use { inspectOpenChannel(it, path, expected, expectedSize) }
    }

    private fun inspectOpenChannel(
        channel: java.nio.channels.SeekableByteChannel,
        path: Path,
        expected: FileIdentity,
        expectedSize: Long,
    ): FileInspection? {
        if (expectedSize <= 0 || channel.size() != expectedSize) return null
        channel.position(0)
        val digest = MessageDigest.getInstance("SHA-256")
        var size = 0L
        val buffer = java.nio.ByteBuffer.allocate(DEFAULT_BUFFER_SIZE)
        while (size < expectedSize) {
            buffer.clear()
            buffer.limit(minOf(buffer.capacity().toLong(), expectedSize - size).toInt())
            val count = channel.read(buffer)
            if (count <= 0) return null
            digest.update(buffer.array(), 0, count)
            size += count
        }
        val growthProbe = java.nio.ByteBuffer.allocate(1)
        if (channel.read(growthProbe) != -1 || channel.size() != expectedSize || identity(path) != expected) return null
        return FileInspection(size, digest.digest().toHex())
    }

    private fun openVerified(path: Path, directoryOwner: String, expected: FileIdentity): java.nio.channels.SeekableByteChannel? =
        runCatching {
            if (identity(path) != expected || !acceptedOwner(expected.owner, directoryOwner) || !expected.regularFile) return null
            val channel = Files.newByteChannel(
                path,
                setOf<java.nio.file.OpenOption>(StandardOpenOption.READ, LinkOption.NOFOLLOW_LINKS),
            )
            if (identity(path) != expected) {
                channel.close()
                return null
            }
            channel
        }.getOrNull()

    private data class FileIdentity(val key: String, val owner: String, val directory: Boolean, val regularFile: Boolean)
    private data class FileInspection(val size: Long, val digest: String)
    private enum class DeleteResult { DELETED, SYMLINK, UNEXPECTED, OWNER, OUTSIDE }
    private class InputLimitExceeded : RuntimeException()

    private companion object {
        const val INPUT = "input.bin"
        const val REQUEST = "request.bin"
        const val RESULT = "result.bin"
        const val OUTPUT = "output.bin"
        const val DIAGNOSTIC = "diagnostic.bin"
        const val QUARANTINE_PREFIX = ".quarantine-"
        val ALLOWED_FILES = setOf(INPUT, REQUEST, RESULT, OUTPUT, DIAGNOSTIC)
        val UUID_NAME = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
    }
}

private fun ByteArray.toHex(): String = joinToString("") { "%02x".format(it) }
