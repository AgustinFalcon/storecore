package com.storecore.catalog.infrastructure.media.worker

import java.nio.file.FileSystems
import java.nio.file.Path
import java.nio.file.attribute.GroupPrincipal
import java.nio.file.attribute.UserPrincipal
import java.time.Duration
import java.time.Instant
import java.util.UUID

class WorkerUnixIdentity private constructor(
    val user: UserPrincipal,
    val group: GroupPrincipal,
) {
    companion object {
        fun create(user: UserPrincipal?, group: GroupPrincipal?): WorkerUnixIdentity? =
            if (user == null || group == null) null else WorkerUnixIdentity(user, group)

        fun lookup(account: String = LinuxIsolationProperties.DEDICATED_USER): WorkerUnixIdentity? =
            runCatching {
                val service = FileSystems.getDefault().userPrincipalLookupService
                create(service.lookupPrincipalByName(account), service.lookupPrincipalByGroupName(account))
            }.getOrNull()
    }
}

sealed interface MediaWorkerWorkspacePolicy {
    data object PrivateBackend : MediaWorkerWorkspacePolicy
    class DedicatedUnix private constructor(val identity: WorkerUnixIdentity) : MediaWorkerWorkspacePolicy {
        companion object {
            fun create(identity: WorkerUnixIdentity?): DedicatedUnix? = identity?.let(::DedicatedUnix)
        }
    }
}

/** Productive Linux handoff: backend owner + dedicated worker group, never a Windows Ready path. */
class DedicatedUnixMediaWorkerWorkspace(
    root: Path,
    identity: WorkerUnixIdentity? = WorkerUnixIdentity.lookup(),
) : MediaWorkerWorkspaceManager {
    private val policy = MediaWorkerWorkspacePolicy.DedicatedUnix.create(identity)
    private val delegate = policy?.let { PrivateMediaWorkerWorkspace(root, it) }

    override fun accessFor(principal: MediaWorkerPrincipal): MediaWorkerWorkspaceAccess =
        delegate?.accessFor(principal) ?: when (principal) {
            MediaWorkerPrincipal.DEDICATED_WORKER -> MediaWorkerWorkspaceAccess.Unavailable
            MediaWorkerPrincipal.UNKNOWN -> MediaWorkerWorkspaceAccess.Unknown
        }

    override fun create(requestId: UUID): MediaWorkerWorkspaceResult =
        delegate?.create(requestId) ?: MediaWorkerWorkspaceResult.Unavailable

    override fun sweep(now: Instant, staleAfter: Duration): MediaWorkerSweepResult =
        delegate?.sweep(now, staleAfter) ?: MediaWorkerSweepResult.Unknown

    override fun grantWorker(lease: MediaWorkerWorkspaceLease): MediaWorkerWorkspaceAccess =
        delegate?.grantWorker(lease) ?: MediaWorkerWorkspaceAccess.Unavailable
}
