package com.storecore.catalog.media

import com.storecore.catalog.application.media.MediaNormalizationArtifact
import com.storecore.catalog.domain.media.ContentDigest
import com.storecore.catalog.domain.media.MediaByteSize
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.infrastructure.media.worker.*
import com.storecore.catalog.media.worker.supply.ImageIoProviderInventory
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.time.Instant
import java.util.UUID

class MediaWorkerPackagedCapabilityIntegrationTest {
    @TempDir lateinit var temp: Path

    @Test
    fun `factory accepts the real packaged worker inventory and attestation`() {
        val configured = System.getProperty(PACKAGED_JAR_PROPERTY)
        assumeTrue(!configured.isNullOrBlank(), "$PACKAGED_JAR_PROPERTY is required by the packaged-worker gate")
        val jar = Path.of(configured).toAbsolutePath().normalize()
        assumeTrue(Files.isRegularFile(jar), "packaged worker is missing: $jar")
        val inventory = requireNotNull(MediaWorkerDependencyInventory.fromJar(jar))
        val root = Files.createDirectories(temp.resolve("workspaces"))
        val systemdRun = Files.writeString(temp.resolve("systemd-run"), "test")
        val systemctl = Files.writeString(temp.resolve("systemctl"), "test")
        val properties = requireNotNull(LinuxIsolationProperties.create(
            MediaWorkerOperatingSystem.LINUX,
            MediaWorkerArchitecture.AMD64,
            CgroupVersion.V2,
            systemdRun,
            LinuxIsolationProperties.DEDICATED_USER,
            192L * 1024L * 1024L,
            0L,
            32L,
            LinuxIsolationProperties.CPU_QUOTA,
            root,
            systemctl,
        ))
        val isolation = requireNotNull(LinuxIsolationAttestation.Matched.create(properties))
        val vendor = requireNotNull(System.getProperty("java.vendor"))
        val runtimeVersion = requireNotNull(System.getProperty("java.runtime.version"))
        val command = requireNotNull(MediaWorkerCommand.create(javaExecutable(), jar))
        val manager = CompatibleWorkspaceManager(temp)
        val factory = MediaWorkerCapabilityFactory(
            attestor = object : LinuxMediaWorkerIsolationAttestor() {
                override fun attest(workspace: Path?, memoryMaxBytes: Long?, pidsMax: Long?) = isolation
            },
            launcherFor = {
                MediaWorkerLauncher { _, lease, _ ->
                    val request = requireNotNull(MediaWorkerSelfTestCodec.decodeRequest(Files.readAllBytes(lease.request)))
                    val fingerprint = requireNotNull(MediaWorkerRuntimeFingerprint.create(
                        vendor,
                        runtimeVersion,
                        MediaWorkerOperatingSystem.LINUX,
                        MediaWorkerArchitecture.AMD64,
                        inventory.modules,
                        ImageIoProviderInventory.imageIoV1Expected,
                        MediaWorkerRuntimeFingerprint.hashPackagedJar(jar),
                        MediaWorkerRuntimeFingerprint.profileDigest(),
                        MediaWorkerRuntimeFingerprint.corpusDigests(),
                    ))
                    Files.write(
                        lease.result,
                        MediaWorkerSelfTestCodec.encodeReport(
                            requireNotNull(MediaWorkerSelfTestReport.create(request.challengeId, request.nonce(), fingerprint)),
                        ),
                    )
                    MediaWorkerExecution.Completed(0, byteArrayOf(), byteArrayOf())
                }
            },
            approvedRuntime = requireNotNull(ApprovedMediaWorkerRuntime.create(
                vendor,
                runtimeVersion,
                MediaWorkerOperatingSystem.LINUX,
                MediaWorkerArchitecture.AMD64,
            )),
        )
        assertTrue(factory.observe(command, manager, MediaNormalizationLimits.standard(), root) is MediaWorkerCapability.Ready)
    }

    private fun javaExecutable(): Path =
        Path.of(System.getProperty("java.home"), "bin", if (System.getProperty("os.name").startsWith("Windows")) "java.exe" else "java")
            .toAbsolutePath()

    private class CompatibleWorkspaceManager(private val temp: Path) : MediaWorkerWorkspaceManager {
        override fun accessFor(principal: MediaWorkerPrincipal): MediaWorkerWorkspaceAccess =
            if (principal == MediaWorkerPrincipal.DEDICATED_WORKER) MediaWorkerWorkspaceAccess.Compatible
            else MediaWorkerWorkspaceAccess.Unknown
        override fun grantWorker(lease: MediaWorkerWorkspaceLease) = MediaWorkerWorkspaceAccess.Compatible
        override fun create(requestId: UUID): MediaWorkerWorkspaceResult =
            MediaWorkerWorkspaceResult.Created(Lease(Files.createDirectories(temp.resolve(requestId.toString()))))
        override fun sweep(now: Instant, staleAfter: Duration) = MediaWorkerSweepResult.Completed(0)
    }

    private class Lease(override val directory: Path) : MediaWorkerWorkspaceLease {
        override val input = directory.resolve("input.bin")
        override val request = directory.resolve("request.bin")
        override val result = directory.resolve("result.bin")
        override val output = directory.resolve("output.bin")
        override val diagnostic = directory.resolve("diagnostic.bin")
        override fun publishInput(source: InputStream, maxBytes: Long) = null
        override fun readResult(maxBytes: Long): ByteArray? = Files.readAllBytes(result).takeIf { it.size <= maxBytes }
        override fun claimArtifact(expectedSize: MediaByteSize, digest: ContentDigest): MediaNormalizationArtifact? = null
        override fun close() = Unit
    }

    private companion object {
        const val PACKAGED_JAR_PROPERTY = "storecore.media.worker.packagedJar"
    }
}
