package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.media.worker.supply.ImageIoProviderInventory
import java.security.SecureRandom
import java.util.UUID

class MediaWorkerCapabilityFactory(
    private val attestor: LinuxMediaWorkerIsolationAttestor = LinuxMediaWorkerIsolationAttestor(),
    private val launcherFor: (LinuxIsolationAttestation.Matched) -> MediaWorkerLauncher = { SystemdMediaWorkerLauncher(it) },
    private val approvedRuntime: ApprovedMediaWorkerRuntime? = null,
    private val random: SecureRandom = SecureRandom(),
) {
    fun observe(
        command: MediaWorkerCommand?,
        workspaces: MediaWorkerWorkspaceManager?,
        limits: MediaNormalizationLimits?,
        workspaceRoot: java.nio.file.Path?,
    ): MediaWorkerCapability {
        if (command == null || workspaces == null || limits == null || workspaceRoot == null) return MediaWorkerCapability.Unknown
        val processMemory = limits.processMemoryBytes() ?: return MediaWorkerCapability.Unknown
        val isolation = attestor.attest(workspaceRoot, processMemory.value)
        val matched = isolation as? LinuxIsolationAttestation.Matched ?: return when (isolation) {
            LinuxIsolationAttestation.Unknown -> MediaWorkerCapability.Unknown
            else -> MediaWorkerCapability.Unavailable
        }
        val runtime = approvedRuntime ?: return MediaWorkerCapability.Unavailable
        if (runtime.operatingSystem != matched.properties.operatingSystem ||
            runtime.architecture != matched.properties.architecture
        ) return MediaWorkerCapability.Unavailable
        when (workspaces.accessFor(MediaWorkerPrincipal.DEDICATED_WORKER)) {
            MediaWorkerWorkspaceAccess.Compatible -> Unit
            MediaWorkerWorkspaceAccess.Unavailable -> return MediaWorkerCapability.Unavailable
            MediaWorkerWorkspaceAccess.Unknown -> return MediaWorkerCapability.Unknown
        }
        val launcher = launcherFor(matched)
        val challenge = UUID.randomUUID()
        val nonce = ByteArray(32).also(random::nextBytes)
        val request = MediaWorkerSelfTestRequest.create(challenge, nonce) ?: return MediaWorkerCapability.Unknown
        val workspace = when (val created = workspaces.create(challenge)) {
            is MediaWorkerWorkspaceResult.Created -> created.lease
            MediaWorkerWorkspaceResult.Unavailable -> return MediaWorkerCapability.Unavailable
            MediaWorkerWorkspaceResult.Unknown -> return MediaWorkerCapability.Unknown
        }
        val lease = workspace
        var closeLease = true
        try {
            val written = lease.writeRequest(MediaWorkerSelfTestCodec.encodeRequest(request))
            if (!written) return MediaWorkerCapability.Unknown
            when (workspaces.grantWorker(lease)) {
                MediaWorkerWorkspaceAccess.Compatible -> Unit
                MediaWorkerWorkspaceAccess.Unavailable -> return MediaWorkerCapability.Unavailable
                MediaWorkerWorkspaceAccess.Unknown -> return MediaWorkerCapability.Unknown
            }
            return when (val execution = launcher.execute(command, lease, limits)) {
                is MediaWorkerExecution.Completed -> if (execution.exitCode == 0) {
                    val report = MediaWorkerSelfTestCodec.decodeReport(lease.readResult(16_384) ?: return MediaWorkerCapability.Unknown)
                    val expected = expectedFingerprint(command, matched, runtime) ?: return MediaWorkerCapability.Unavailable
                    val attestation = MediaWorkerAttestationEvaluator.evaluate(
                        MediaWorkerSelfTestExpectation.create(challenge, nonce, expected),
                        report,
                    )
                    if (attestation !is MediaWorkerAttestationResult.Matched) return MediaWorkerCapability.Unavailable
                    val normalizer = IsolatedJvmMediaByteNormalizer(workspaces, launcher, command)
                    MediaWorkerCapability.Ready.create(normalizer, matched, attestation)
                        ?: MediaWorkerCapability.Unknown
                } else {
                    MediaWorkerCapability.Unavailable
                }
                MediaWorkerExecution.IsolationUnavailable -> MediaWorkerCapability.Unavailable
                MediaWorkerExecution.Unknown -> MediaWorkerCapability.Unknown
                MediaWorkerExecution.TerminationUnknown -> {
                    closeLease = false
                    when (runCatching { lease.retainUnsafe() }.getOrDefault(MediaWorkerWorkspaceRetention.Unknown)) {
                        MediaWorkerWorkspaceRetention.Retained -> MediaWorkerCapability.Unavailable
                        MediaWorkerWorkspaceRetention.Unavailable -> MediaWorkerCapability.Unavailable
                        MediaWorkerWorkspaceRetention.Unknown -> MediaWorkerCapability.Unknown
                    }
                }
                MediaWorkerExecution.TimedOut, MediaWorkerExecution.Failed -> MediaWorkerCapability.Unavailable
            }
        } finally {
            if (closeLease) lease.close()
        }
    }

    private fun expectedFingerprint(
        command: MediaWorkerCommand,
        isolation: LinuxIsolationAttestation.Matched,
        runtime: ApprovedMediaWorkerRuntime,
    ): MediaWorkerRuntimeFingerprint? {
        if (runtime.operatingSystem != isolation.properties.operatingSystem ||
            runtime.architecture != isolation.properties.architecture
        ) return null
        val jarDigest = MediaWorkerRuntimeFingerprint.hashPackagedJar(command.applicationJar) ?: return null
        val versions = MediaWorkerDependencyInventory.fromJar(command.applicationJar)?.modules ?: return null
        val providers = ImageIoProviderInventory.imageIoV1Expected
        return MediaWorkerRuntimeFingerprint.create(
            runtime.javaVendor,
            runtime.javaRuntimeVersion,
            runtime.operatingSystem,
            runtime.architecture,
            versions,
            providers,
            jarDigest,
            MediaWorkerRuntimeFingerprint.profileDigest(),
            MediaWorkerRuntimeFingerprint.corpusDigests(),
        )
    }

}
