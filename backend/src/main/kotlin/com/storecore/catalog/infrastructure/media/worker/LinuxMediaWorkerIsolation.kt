package com.storecore.catalog.infrastructure.media.worker

import java.nio.file.Files
import java.nio.file.LinkOption.NOFOLLOW_LINKS
import java.nio.file.Path
import java.nio.file.attribute.PosixFileAttributeView
import java.nio.file.attribute.PosixFilePermission

enum class CgroupVersion(val wire: String) {
    V2("cgroupv2"),
    UNKNOWN("unknown");

    companion object {
        fun fromWire(raw: String?): CgroupVersion =
            entries.firstOrNull { it.wire == raw && it != UNKNOWN } ?: UNKNOWN
    }
}

class LinuxIsolationProperties private constructor(
    val operatingSystem: MediaWorkerOperatingSystem,
    val architecture: MediaWorkerArchitecture,
    val cgroupVersion: CgroupVersion,
    val systemdRun: Path,
    val systemctl: Path,
    val dedicatedUser: String,
    val memoryMaxBytes: Long,
    val memorySwapMaxBytes: Long,
    val pidsMax: Long,
    val cpuQuota: String,
    val workspace: Path,
) {
    companion object {
        const val DEDICATED_USER = "storecore-media-worker"
        const val CPU_QUOTA = "100%"

        fun create(
            operatingSystem: MediaWorkerOperatingSystem,
            architecture: MediaWorkerArchitecture,
            cgroupVersion: CgroupVersion,
            systemdRun: Path?,
            dedicatedUser: String?,
            memoryMaxBytes: Long?,
            memorySwapMaxBytes: Long?,
            pidsMax: Long?,
            cpuQuota: String?,
            workspace: Path?,
            systemctl: Path? = systemdRun?.resolveSibling("systemctl"),
        ): LinuxIsolationProperties? {
            if (operatingSystem != MediaWorkerOperatingSystem.LINUX) return null
            if (architecture != MediaWorkerArchitecture.AMD64 && architecture != MediaWorkerArchitecture.ARM64) return null
            if (cgroupVersion != CgroupVersion.V2) return null
            if (systemdRun == null || dedicatedUser != DEDICATED_USER) return null
            if (memoryMaxBytes == null || memoryMaxBytes <= 0L) return null
            if (memorySwapMaxBytes != 0L) return null
            if (pidsMax == null || pidsMax <= 0L) return null
            if (cpuQuota != CPU_QUOTA) return null
            val absoluteWorkspace = workspace?.toAbsolutePath()?.normalize() ?: return null
            val absoluteSystemd = runCatching { systemdRun.toAbsolutePath().normalize() }.getOrNull() ?: return null
            val absoluteSystemctl = systemctl?.toAbsolutePath()?.normalize() ?: return null
            if (absoluteSystemctl.fileName.toString() != "systemctl") return null
            if (!absoluteWorkspace.isAbsolute || !Files.isDirectory(absoluteWorkspace, NOFOLLOW_LINKS)) return null
            return LinuxIsolationProperties(
                operatingSystem,
                architecture,
                cgroupVersion,
                absoluteSystemd,
                absoluteSystemctl,
                dedicatedUser,
                memoryMaxBytes,
                memorySwapMaxBytes,
                pidsMax,
                cpuQuota,
                absoluteWorkspace,
            )
        }
    }
}

sealed interface LinuxIsolationAttestation {
    class Matched private constructor(val properties: LinuxIsolationProperties) : LinuxIsolationAttestation {
        companion object {
            fun create(properties: LinuxIsolationProperties?): Matched? = properties?.let(::Matched)
        }
    }

    data object Unavailable : LinuxIsolationAttestation
    data object Unknown : LinuxIsolationAttestation
}

open class LinuxMediaWorkerIsolationAttestor(
    private val osName: () -> String? = { System.getProperty("os.name") },
    private val osArch: () -> String? = { System.getProperty("os.arch") },
    private val cgroupControllers: Path = Path.of("/sys/fs/cgroup/cgroup.controllers"),
    private val systemdRunCandidates: List<Path> = listOf(Path.of("/usr/bin/systemd-run"), Path.of("/bin/systemd-run")),
    private val systemctlCandidates: List<Path> = listOf(Path.of("/usr/bin/systemctl"), Path.of("/bin/systemctl")),
) {
    open fun attest(
        workspace: Path?,
        memoryMaxBytes: Long?,
        pidsMax: Long? = 32L,
    ): LinuxIsolationAttestation {
        val os = MediaWorkerOperatingSystem.fromWire(osName())
        val arch = MediaWorkerArchitecture.fromWire(osArch())
        if (os == MediaWorkerOperatingSystem.UNKNOWN || arch == MediaWorkerArchitecture.UNKNOWN) {
            return LinuxIsolationAttestation.Unknown
        }
        if (os == MediaWorkerOperatingSystem.WINDOWS) return LinuxIsolationAttestation.Unavailable
        if (os != MediaWorkerOperatingSystem.LINUX) return LinuxIsolationAttestation.Unavailable
        val systemdRun = systemdRunCandidates.firstNotNullOfOrNull { ownedExecutable(it, "systemd-run") } ?: return LinuxIsolationAttestation.Unavailable
        val systemctl = systemctlCandidates.firstNotNullOfOrNull { ownedExecutable(it, "systemctl") } ?: return LinuxIsolationAttestation.Unavailable
        if (!cgroupV2()) return LinuxIsolationAttestation.Unavailable
        val properties = LinuxIsolationProperties.create(
            os,
            arch,
            CgroupVersion.V2,
            systemdRun,
            LinuxIsolationProperties.DEDICATED_USER,
            memoryMaxBytes,
            0L,
            pidsMax,
            LinuxIsolationProperties.CPU_QUOTA,
            workspace,
            systemctl,
        ) ?: return LinuxIsolationAttestation.Unavailable
        return LinuxIsolationAttestation.Matched.create(properties) ?: LinuxIsolationAttestation.Unknown
    }

    private fun cgroupV2(): Boolean {
        if (!Files.isRegularFile(cgroupControllers, NOFOLLOW_LINKS) || Files.isSymbolicLink(cgroupControllers)) return false
        return runCatching { Files.readString(cgroupControllers) }.getOrNull()?.isNotBlank() == true
    }

    private fun ownedExecutable(path: Path, name: String): Path? {
        val absolute = runCatching { path.toAbsolutePath().normalize() }.getOrNull() ?: return null
        if (absolute.fileName.toString() != name) return null
        if (!Files.isRegularFile(absolute, NOFOLLOW_LINKS) || Files.isSymbolicLink(absolute)) return null
        if (!Files.isExecutable(absolute)) return null
        val view = Files.getFileAttributeView(absolute, PosixFileAttributeView::class.java, NOFOLLOW_LINKS) ?: return null
        val attributes = runCatching { view.readAttributes() }.getOrNull() ?: return null
        if (attributes.owner().name != "root") return null
        val permissions = attributes.permissions()
        if (PosixFilePermission.OTHERS_WRITE in permissions || PosixFilePermission.GROUP_WRITE in permissions) return null
        return absolute
    }
}
