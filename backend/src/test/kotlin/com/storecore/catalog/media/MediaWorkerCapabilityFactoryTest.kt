package com.storecore.catalog.media

import com.storecore.catalog.application.media.MediaNormalizationArtifact
import com.storecore.catalog.domain.media.ContentDigest
import com.storecore.catalog.domain.media.MediaByteSize
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.infrastructure.media.worker.*
import com.storecore.catalog.media.worker.supply.ImageIoProviderInventory
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class MediaWorkerCapabilityFactoryTest {
    @TempDir lateinit var temp: Path

    @Test
    fun `Windows and missing isolation stay Unavailable and never Ready`() {
        val root = Files.createDirectories(temp.resolve("workspaces"))
        val command = requireNotNull(
            MediaWorkerCommand.create(javaExecutable(), packagedJar(temp.resolve("worker.jar"))),
        )
        val factory = MediaWorkerCapabilityFactory()
        val result = factory.observe(command, manager(), MediaNormalizationLimits.standard(), root)
        assertSame(MediaWorkerCapability.Unavailable, result)
        assertEquals(MediaWorkerCapabilityState.UNAVAILABLE, result.state)
    }

    @Test
    fun `null runtime identity is Unknown`() {
        val factory = MediaWorkerCapabilityFactory(
            attestor = LinuxMediaWorkerIsolationAttestor(osName = { "Linux" }, osArch = { "amd64" }),
        )
        assertSame(MediaWorkerCapability.Unknown, factory.observe(null, null, null, null))
    }

    @Test
    fun `attested Linux isolation plus matching sandbox SELF_TEST becomes Ready`() {
        val root = Files.createDirectories(temp.resolve("workspaces"))
        val jar = packagedJar(temp.resolve("storecore-media-worker.jar"))
        val command = requireNotNull(MediaWorkerCommand.create(javaExecutable(), jar))
        val isolation = requireNotNull(matchedIsolation(root))
        val factory = MediaWorkerCapabilityFactory(
            attestor = object : LinuxMediaWorkerIsolationAttestor() {
                override fun attest(workspace: Path?, memoryMaxBytes: Long?, pidsMax: Long?) = isolation
            },
            launcherFor = {
                MediaWorkerLauncher { _, lease, _ ->
                    val request = requireNotNull(MediaWorkerSelfTestCodec.decodeRequest(Files.readAllBytes(lease.request)))
                    val fingerprint = requireNotNull(
                        MediaWorkerRuntimeFingerprint.create(
                            "Eclipse Adoptium",
                            "21.0.13+9",
                            MediaWorkerOperatingSystem.LINUX,
                            MediaWorkerArchitecture.AMD64,
                            moduleVersions(),
                            ImageIoProviderInventory.imageIoV1Expected,
                            MediaWorkerRuntimeFingerprint.hashPackagedJar(jar),
                            MediaWorkerRuntimeFingerprint.profileDigest(),
                            MediaWorkerRuntimeFingerprint.corpusDigests(),
                        ),
                    )
                    val report = requireNotNull(
                        MediaWorkerSelfTestReport.create(request.challengeId, request.nonce(), fingerprint),
                    )
                    Files.write(lease.result, MediaWorkerSelfTestCodec.encodeReport(report))
                    MediaWorkerExecution.Completed(0, byteArrayOf(), byteArrayOf())
                }
            },
            approvedRuntime = approvedRuntime(),
        )
        val capability = factory.observe(command, manager(), MediaNormalizationLimits.standard(), root)
        assertTrue(capability is MediaWorkerCapability.Ready)
        assertEquals(MediaWorkerCapabilityState.READY, capability.state)
    }

    @Test
    fun `runtime drift from the independently approved profile never becomes Ready`() {
        val root = Files.createDirectories(temp.resolve("drift-workspaces"))
        val jar = packagedJar(temp.resolve("drift-worker.jar"))
        val command = requireNotNull(MediaWorkerCommand.create(javaExecutable(), jar))
        val isolation = requireNotNull(matchedIsolation(root))
        val observed = listOf(
            ObservedRuntime("Unexpected Vendor", "21.0.13+9", MediaWorkerOperatingSystem.LINUX, MediaWorkerArchitecture.AMD64),
            ObservedRuntime("Eclipse Adoptium", "21.0.14+1", MediaWorkerOperatingSystem.LINUX, MediaWorkerArchitecture.AMD64),
            ObservedRuntime("Eclipse Adoptium", "21.0.13+9", MediaWorkerOperatingSystem.WINDOWS, MediaWorkerArchitecture.AMD64),
            ObservedRuntime("Eclipse Adoptium", "21.0.13+9", MediaWorkerOperatingSystem.LINUX, MediaWorkerArchitecture.ARM64),
        )
        observed.forEach { drift ->
            val factory = MediaWorkerCapabilityFactory(
                attestor = object : LinuxMediaWorkerIsolationAttestor() {
                    override fun attest(workspace: Path?, memoryMaxBytes: Long?, pidsMax: Long?) = isolation
                },
                launcherFor = {
                    MediaWorkerLauncher { _, lease, _ ->
                        val request = requireNotNull(MediaWorkerSelfTestCodec.decodeRequest(Files.readAllBytes(lease.request)))
                        val fingerprint = requireNotNull(MediaWorkerRuntimeFingerprint.create(
                            drift.vendor,
                            drift.version,
                            drift.os,
                            drift.architecture,
                            moduleVersions(),
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
                approvedRuntime = approvedRuntime(),
            )
            assertSame(MediaWorkerCapability.Unavailable, factory.observe(command, manager(), MediaNormalizationLimits.standard(), root))
        }
    }

    @Test
    fun `attested isolation without systemd execution stays Unavailable`() {
        val root = Files.createDirectories(temp.resolve("workspaces"))
        val command = requireNotNull(MediaWorkerCommand.create(javaExecutable(), packagedJar(temp.resolve("worker.jar"))))
        val isolation = requireNotNull(matchedIsolation(root))
        val factory = MediaWorkerCapabilityFactory(
            attestor = object : LinuxMediaWorkerIsolationAttestor() {
                override fun attest(workspace: Path?, memoryMaxBytes: Long?, pidsMax: Long?) = isolation
            },
            launcherFor = { MediaWorkerLauncher { _, _, _ -> MediaWorkerExecution.IsolationUnavailable } },
        )
        assertSame(
            MediaWorkerCapability.Unavailable,
            factory.observe(command, manager(), MediaNormalizationLimits.standard(), root),
        )
    }

    private fun manager(): MediaWorkerWorkspaceManager = object : MediaWorkerWorkspaceManager {
        override fun create(requestId: UUID) = MediaWorkerWorkspaceResult.Created(FakeLease(temp.resolve(requestId.toString())))
        override fun sweep(now: java.time.Instant, staleAfter: java.time.Duration) = MediaWorkerSweepResult.Completed(0)
        override fun accessFor(principal: MediaWorkerPrincipal): MediaWorkerWorkspaceAccess =
            if (principal == MediaWorkerPrincipal.DEDICATED_WORKER) MediaWorkerWorkspaceAccess.Compatible
            else MediaWorkerWorkspaceAccess.Unknown
    }

    private fun approvedRuntime(
        vendor: String = "Eclipse Adoptium",
        version: String = "21.0.13+9",
        os: MediaWorkerOperatingSystem = MediaWorkerOperatingSystem.LINUX,
        architecture: MediaWorkerArchitecture = MediaWorkerArchitecture.AMD64,
    ): ApprovedMediaWorkerRuntime = requireNotNull(ApprovedMediaWorkerRuntime.create(vendor, version, os, architecture))

    private data class ObservedRuntime(
        val vendor: String,
        val version: String,
        val os: MediaWorkerOperatingSystem,
        val architecture: MediaWorkerArchitecture,
    )

    private fun matchedIsolation(root: Path): LinuxIsolationAttestation.Matched? {
        val systemd = Files.writeString(temp.resolve("systemd-run"), "#!/bin/sh\n")
        val properties = LinuxIsolationProperties.create(
            MediaWorkerOperatingSystem.LINUX,
            MediaWorkerArchitecture.AMD64,
            CgroupVersion.V2,
            systemd,
            LinuxIsolationProperties.DEDICATED_USER,
            192L * 1024L * 1024L,
            0L,
            32L,
            LinuxIsolationProperties.CPU_QUOTA,
            root,
        )
        return LinuxIsolationAttestation.Matched.create(properties)
    }

    private fun packagedJar(path: Path): Path {
        ZipOutputStream(Files.newOutputStream(path)).use { zip ->
            zip.putNextEntry(ZipEntry("META-INF/MANIFEST.MF"))
            zip.write("Manifest-Version: 1.0\n".toByteArray())
            zip.closeEntry()
            zip.putNextEntry(ZipEntry(MediaWorkerDependencyInventory.RESOURCE))
            val modules = moduleVersions()
            val inventory = buildString {
                appendLine("inventory.version=1")
                appendLine("module.count=${modules.size}")
                modules.forEachIndexed { index, module ->
                    appendLine("module.$index.coordinate=${module.module}")
                    appendLine("module.$index.version=${module.version}")
                }
            }
            zip.write(inventory.toByteArray())
            zip.closeEntry()
        }
        return path
    }

    private fun moduleVersions() = listOf(
        MediaWorkerModuleVersion("com.twelvemonkeys.common:common-image", "3.15.3"),
        MediaWorkerModuleVersion("com.twelvemonkeys.common:common-io", "3.15.3"),
        MediaWorkerModuleVersion("com.twelvemonkeys.common:common-lang", "3.15.3"),
        MediaWorkerModuleVersion("com.twelvemonkeys.imageio:imageio-core", "3.15.3"),
        MediaWorkerModuleVersion("com.twelvemonkeys.imageio:imageio-jpeg", "3.15.3"),
        MediaWorkerModuleVersion("com.twelvemonkeys.imageio:imageio-metadata", "3.15.3"),
        MediaWorkerModuleVersion("com.twelvemonkeys.imageio:imageio-webp", "3.15.3"),
        MediaWorkerModuleVersion("org.jetbrains.kotlin:kotlin-stdlib", "1.9.25"),
        MediaWorkerModuleVersion("org.jetbrains:annotations", "13.0"),
    )

    private fun javaExecutable(): Path {
        val binary = if (System.getProperty("os.name").startsWith("Windows")) "java.exe" else "java"
        return Path.of(System.getProperty("java.home"), "bin", binary).toAbsolutePath()
    }

    private class FakeLease(root: Path) : MediaWorkerWorkspaceLease {
        override val directory: Path = Files.createDirectories(root)
        override val input: Path = directory.resolve("input.bin")
        override val request: Path = directory.resolve("request.bin")
        override val result: Path = directory.resolve("result.bin")
        override val output: Path = directory.resolve("output.bin")
        override val diagnostic: Path = directory.resolve("diagnostic.bin")
        override fun publishInput(source: InputStream, maxBytes: Long) = null
        override fun readResult(maxBytes: Long): ByteArray? =
            Files.readAllBytes(result).takeIf { it.size.toLong() <= maxBytes }
        override fun claimArtifact(expectedSize: MediaByteSize, digest: ContentDigest): MediaNormalizationArtifact? = null
        override fun close() = Unit
    }
}
