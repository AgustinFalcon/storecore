package com.storecore.catalog.media

import com.storecore.catalog.application.media.MediaNormalizationArtifact
import com.storecore.catalog.domain.media.ContentDigest
import com.storecore.catalog.domain.media.MediaByteSize
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.infrastructure.media.worker.CgroupVersion
import com.storecore.catalog.infrastructure.media.worker.LinuxIsolationAttestation
import com.storecore.catalog.infrastructure.media.worker.LinuxIsolationProperties
import com.storecore.catalog.infrastructure.media.worker.MediaPublishedInput
import com.storecore.catalog.infrastructure.media.worker.MediaWorkerArchitecture
import com.storecore.catalog.infrastructure.media.worker.MediaWorkerCommand
import com.storecore.catalog.infrastructure.media.worker.MediaWorkerExecution
import com.storecore.catalog.infrastructure.media.worker.MediaWorkerOperatingSystem
import com.storecore.catalog.infrastructure.media.worker.MediaWorkerWorkspaceLease
import com.storecore.catalog.infrastructure.media.worker.SystemdMediaWorkerLauncher
import com.storecore.catalog.infrastructure.media.worker.MediaWorkerUnitController
import com.storecore.catalog.infrastructure.media.worker.MediaWorkerUnitTermination
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.Path

class SystemdMediaWorkerLauncherTest {
    @TempDir lateinit var temp: Path

    @Test
    fun `timeout asks manager to terminate the service before returning`() {
        val fixture = fixture()
        val process = FakeProcess()
        var terminated = false
        val launcher = SystemdMediaWorkerLauncher(fixture.first, MediaWorkerUnitController { _, completed ->
            assertTrue(!completed)
            assertTrue(!process.isAlive)
            terminated = true
            MediaWorkerUnitTermination.Confirmed
        }) { _, _ -> process }
        assertSame(MediaWorkerExecution.TimedOut, launcher.execute(fixture.second, fixture.third, MediaNormalizationLimits.standard()))
        assertTrue(terminated)
    }

    @Test
    fun `unconfirmed manager termination poisons the launcher and prevents another service`() {
        val fixture = fixture()
        var starts = 0
        val launcher = SystemdMediaWorkerLauncher(fixture.first, MediaWorkerUnitController { _, _ ->
            MediaWorkerUnitTermination.Unknown
        }) { _, _ -> starts++; FakeProcess() }
        repeat(2) {
            assertSame(MediaWorkerExecution.TerminationUnknown,
                launcher.execute(fixture.second, fixture.third, MediaNormalizationLimits.standard()))
        }
        assertEquals(1, starts)
    }

    private fun fixture(): Triple<LinuxIsolationAttestation.Matched, MediaWorkerCommand, FakeLease> {
        val root = Files.createDirectories(temp.resolve("root"))
        val workspace = FakeLease(Files.createDirectory(root.resolve("job")))
        val properties = requireNotNull(LinuxIsolationProperties.create(
            MediaWorkerOperatingSystem.LINUX, MediaWorkerArchitecture.AMD64, CgroupVersion.V2,
            Files.writeString(temp.resolve("systemd-run"), "unused"), LinuxIsolationProperties.DEDICATED_USER,
            192L * 1024L * 1024L, 0L, 32L, LinuxIsolationProperties.CPU_QUOTA, root,
        ))
        return Triple(requireNotNull(LinuxIsolationAttestation.Matched.create(properties)),
            requireNotNull(MediaWorkerCommand.create(javaExecutable(), Files.writeString(temp.resolve("worker.jar"), "pk"))), workspace)
    }

    private class FakeProcess : Process() {
        private var alive = true
        override fun getOutputStream() = java.io.ByteArrayOutputStream()
        override fun getInputStream() = java.io.ByteArrayInputStream(byteArrayOf())
        override fun getErrorStream() = java.io.ByteArrayInputStream(byteArrayOf())
        override fun waitFor() = 0
        override fun waitFor(timeout: Long, unit: java.util.concurrent.TimeUnit) = false
        override fun exitValue() = 0
        override fun destroy() { alive = false }
        override fun destroyForcibly(): Process { alive = false; return this }
        override fun isAlive() = alive
    }

    @Test
    fun `productive argv is systemd-run then java jar with cgroup properties`() {
        val root = Files.createDirectories(temp.resolve("root"))
        val workspace = FakeLease(Files.createDirectories(root.resolve(java.util.UUID.randomUUID().toString())))
        val systemd = Files.writeString(temp.resolve("systemd-run"), "unused")
        val java = javaExecutable()
        val jar = Files.writeString(temp.resolve("worker.jar"), "pk")
        val command = requireNotNull(MediaWorkerCommand.create(java, jar))
        val properties = requireNotNull(
            LinuxIsolationProperties.create(
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
            ),
        )
        val argv = requireNotNull(SystemdMediaWorkerLauncher.commandLine(properties, command, workspace, MediaNormalizationLimits.standard()))
        assertEquals(systemd.toAbsolutePath().normalize().toString(), argv.first())
        assertTrue(argv.first().endsWith("systemd-run"))
        val separator = argv.indexOf("--")
        assertTrue(separator > 0)
        assertEquals(command.javaExecutable.toString(), argv[separator + 1])
        assertEquals("-jar", argv[separator + 5])
        assertTrue(argv.contains("--property=KillMode=control-group"))
        assertTrue(argv.contains("--property=Type=exec"))
        assertTrue(argv.contains("--property=RuntimeMaxSec=12000ms"))
        assertTrue(argv.single { it.startsWith("--unit=") }.matches(Regex("--unit=storecore-media-[0-9a-f-]{36}\\.service")))
        assertTrue(argv.contains("--property=NoNewPrivileges=yes"))
        assertTrue(argv.contains("--property=MemorySwapMax=0"))
        assertTrue(argv.contains("--property=IPAddressDeny=any"))
        assertNull(argv.firstOrNull { argv.indexOf(it) == 0 && (it == "java" || it.endsWith("java.exe")) })
    }

    @Test
    fun `launcher never falls back to a raw java process`() {
        val root = Files.createDirectories(temp.resolve("root"))
        val workspace = FakeLease(Files.createDirectories(root.resolve("job")))
        val systemd = Files.writeString(temp.resolve("systemd-run"), "unused")
        val properties = requireNotNull(
            LinuxIsolationProperties.create(
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
            ),
        )
        val isolation = requireNotNull(LinuxIsolationAttestation.Matched.create(properties))
        val launcher = SystemdMediaWorkerLauncher(isolation) { arguments, _ ->
            assertTrue(arguments.first().endsWith("systemd-run"))
            throw IllegalStateException("systemd-run missing")
        }
        val command = requireNotNull(MediaWorkerCommand.create(javaExecutable(), Files.writeString(temp.resolve("worker.jar"), "pk")))
        assertSame(
            MediaWorkerExecution.IsolationUnavailable,
            launcher.execute(command, workspace, MediaNormalizationLimits.standard()),
        )
    }

    @Test
    fun `workspace outside the attested root is rejected`() {
        val attested = Files.createDirectories(temp.resolve("attested"))
        val other = FakeLease(Files.createDirectories(temp.resolve("other").resolve("job")))
        val properties = requireNotNull(
            LinuxIsolationProperties.create(
                MediaWorkerOperatingSystem.LINUX,
                MediaWorkerArchitecture.AMD64,
                CgroupVersion.V2,
                Files.writeString(temp.resolve("systemd-run"), "unused"),
                LinuxIsolationProperties.DEDICATED_USER,
                192L * 1024L * 1024L,
                0L,
                32L,
                LinuxIsolationProperties.CPU_QUOTA,
                attested,
            ),
        )
        val command = requireNotNull(MediaWorkerCommand.create(javaExecutable(), Files.writeString(temp.resolve("worker.jar"), "pk")))
        assertNull(SystemdMediaWorkerLauncher.commandLine(properties, command, other, MediaNormalizationLimits.standard()))
        assertNotNull(properties)
    }

    private fun javaExecutable(): Path {
        val binary = if (System.getProperty("os.name").startsWith("Windows")) "java.exe" else "java"
        return Path.of(System.getProperty("java.home"), "bin", binary).toAbsolutePath()
    }

    private class FakeLease(root: Path) : MediaWorkerWorkspaceLease {
        override val directory: Path = root
        override val input: Path = directory.resolve("input.bin")
        override val request: Path = directory.resolve("request.bin")
        override val result: Path = directory.resolve("result.bin")
        override val output: Path = directory.resolve("output.bin")
        override val diagnostic: Path = directory.resolve("diagnostic.bin")
        override fun publishInput(source: InputStream, maxBytes: Long): MediaPublishedInput? = null
        override fun readResult(maxBytes: Long): ByteArray? = null
        override fun claimArtifact(expectedSize: MediaByteSize, digest: ContentDigest): MediaNormalizationArtifact? = null
        override fun close() = Unit
    }
}
