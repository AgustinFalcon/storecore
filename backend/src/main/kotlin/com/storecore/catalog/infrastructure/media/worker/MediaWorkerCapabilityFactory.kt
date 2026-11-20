package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.media.worker.supply.ImageIoProviderInventory
import java.nio.file.Files
import java.nio.file.StandardOpenOption.CREATE_NEW
import java.nio.file.StandardOpenOption.WRITE
import java.security.SecureRandom
import java.util.UUID
import java.util.zip.ZipFile

class MediaWorkerCapabilityFactory(
    private val attestor: LinuxMediaWorkerIsolationAttestor = LinuxMediaWorkerIsolationAttestor(),
    private val launcherFor: (LinuxIsolationAttestation.Matched) -> MediaWorkerLauncher = { SystemdMediaWorkerLauncher(it) },
    private val random: SecureRandom = SecureRandom(),
) {
    fun observe(
        command: MediaWorkerCommand?,
        workspaces: MediaWorkerWorkspaceManager?,
        limits: MediaNormalizationLimits?,
        workspaceRoot: java.nio.file.Path?,
    ): MediaWorkerCapability {
        if (command == null || workspaces == null || limits == null || workspaceRoot == null) return MediaWorkerCapability.Unknown
        val isolation = attestor.attest(workspaceRoot, limits.workerHeapBytes.value)
        val matched = isolation as? LinuxIsolationAttestation.Matched ?: return when (isolation) {
            LinuxIsolationAttestation.Unknown -> MediaWorkerCapability.Unknown
            else -> MediaWorkerCapability.Unavailable
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
        workspace.use { lease ->
            val written = runCatching {
                Files.write(lease.request, MediaWorkerSelfTestCodec.encodeRequest(request), CREATE_NEW, WRITE)
                true
            }.getOrDefault(false)
            if (!written) return MediaWorkerCapability.Unknown
            return when (val execution = launcher.execute(command, lease, limits)) {
                is MediaWorkerExecution.Completed -> if (execution.exitCode == 0) {
                    val report = MediaWorkerSelfTestCodec.decodeReport(lease.readResult(16_384) ?: return MediaWorkerCapability.Unknown)
                    val expected = expectedFingerprint(command, report) ?: return MediaWorkerCapability.Unavailable
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
                MediaWorkerExecution.TimedOut, MediaWorkerExecution.Failed -> MediaWorkerCapability.Unavailable
            }
        }
    }

    private fun expectedFingerprint(
        command: MediaWorkerCommand,
        report: MediaWorkerSelfTestReport?,
    ): MediaWorkerRuntimeFingerprint? {
        if (report == null) return null
        val jarDigest = MediaWorkerRuntimeFingerprint.hashPackagedJar(command.applicationJar) ?: return null
        val versions = moduleVersionsFromJar(command.applicationJar) ?: return null
        val providers = ImageIoProviderInventory.imageIoV1Expected
        return MediaWorkerRuntimeFingerprint.create(
            report.fingerprint.javaVendor,
            report.fingerprint.javaRuntimeVersion,
            report.fingerprint.operatingSystem,
            report.fingerprint.architecture,
            versions,
            providers,
            jarDigest,
            MediaWorkerRuntimeFingerprint.profileDigest(),
            MediaWorkerRuntimeFingerprint.corpusDigests(),
        )
    }

    private fun moduleVersionsFromJar(jar: java.nio.file.Path): List<MediaWorkerModuleVersion>? = runCatching {
        ZipFile(jar.toFile()).use { zip ->
            val versions = listOf(
                "org.jetbrains.kotlin" to "kotlin-stdlib",
                "org.jetbrains" to "annotations",
                "com.twelvemonkeys.common" to "common-image",
                "com.twelvemonkeys.common" to "common-io",
                "com.twelvemonkeys.common" to "common-lang",
                "com.twelvemonkeys.imageio" to "imageio-core",
                "com.twelvemonkeys.imageio" to "imageio-jpeg",
                "com.twelvemonkeys.imageio" to "imageio-metadata",
                "com.twelvemonkeys.imageio" to "imageio-webp",
            ).map { (group, module) ->
                val entry = zip.getEntry("META-INF/maven/$group/$module/pom.properties") ?: return@use null
                val version = zip.getInputStream(entry).use { java.util.Properties().apply { load(it) }.getProperty("version") }
                    ?: return@use null
                if (group.startsWith("com.twelvemonkeys.") && version != MediaWorkerRuntimeFingerprint.TWELVEMONKEYS_VERSION) {
                    return@use null
                }
                MediaWorkerModuleVersion("$group:$module", version)
            }
            versions.sortedBy { it.module }
        }
    }.getOrNull()
}
