package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.MediaNormalizationLimits
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.LinkOption.NOFOLLOW_LINKS
import java.nio.file.Path
import java.util.concurrent.TimeUnit
import java.util.UUID

class SystemdMediaWorkerLauncher(
    private val isolation: LinuxIsolationAttestation.Matched,
    private val unitController: MediaWorkerUnitController = SystemdMediaWorkerUnitController(isolation.properties.systemctl),
    private val processStarter: (List<String>, Path) -> Process = ::launchSystemdRun,
) : MediaWorkerLauncher {
    private enum class Availability { AVAILABLE, TERMINATION_UNKNOWN }
    private var availability = Availability.AVAILABLE

    @Synchronized
    override fun execute(
        command: MediaWorkerCommand,
        workspace: MediaWorkerWorkspaceLease,
        limits: MediaNormalizationLimits,
    ): MediaWorkerExecution {
        if (availability != Availability.AVAILABLE) return MediaWorkerExecution.TerminationUnknown
        val unit = MediaWorkerUnitName.create(UUID.randomUUID())
        val argv = commandLine(isolation.properties, command, workspace, limits, unit) ?: return MediaWorkerExecution.IsolationUnavailable
        var process: Process? = null
        var stdout: BoundedDrain? = null
        var stderr: BoundedDrain? = null
        var interrupted = false
        val execution = try {
            val started = processStarter(argv, workspace.directory)
            process = started
            started.outputStream.close()
            val cap = minOf(limits.maxDiagnosticBytes.value, MAX_DIAGNOSTIC_BYTES.toLong()).toInt()
            val outDrain = BoundedDrain(started.inputStream, cap).also { it.start() }
            val errDrain = BoundedDrain(started.errorStream, cap).also { it.start() }
            stdout = outDrain
            stderr = errDrain
            val finished = started.waitFor(limits.timeout.value.toMillis(), TimeUnit.MILLISECONDS)
            if (!finished) {
                MediaWorkerExecution.TimedOut
            } else {
                outDrain.join(JOIN_MILLIS)
                errDrain.join(JOIN_MILLIS)
                if (!outDrain.succeeded || !errDrain.succeeded) MediaWorkerExecution.Failed
                else MediaWorkerExecution.Completed(started.exitValue(), outDrain.bytes(), errDrain.bytes())
            }
        } catch (_: InterruptedException) {
            interrupted = true
            MediaWorkerExecution.Failed
        } catch (_: Exception) {
            MediaWorkerExecution.IsolationUnavailable
        } finally {
            process?.let { started ->
                if (started.isAlive) started.destroyForcibly()
                runCatching { started.outputStream.close() }
                runCatching { started.inputStream.close() }
                runCatching { started.errorStream.close() }
            }
        }
        // Clear interruption while asking the manager to terminate the unit; restore it for the caller.
        interrupted = Thread.interrupted() || interrupted
        val terminated = if (process == null) MediaWorkerUnitTermination.Confirmed else runCatching {
            unitController.terminate(unit, execution is MediaWorkerExecution.Completed && execution.exitCode == 0)
        }.getOrDefault(MediaWorkerUnitTermination.Unknown)
        stdout?.let { if (it.isAlive) runCatching { it.join(JOIN_MILLIS) } }
        stderr?.let { if (it.isAlive) runCatching { it.join(JOIN_MILLIS) } }
        if (interrupted) Thread.currentThread().interrupt()
        if (terminated != MediaWorkerUnitTermination.Confirmed) {
            availability = Availability.TERMINATION_UNKNOWN
            return MediaWorkerExecution.TerminationUnknown
        }
        return execution
    }

    companion object {
        private const val MAX_DIAGNOSTIC_BYTES = 65_536
        private const val JOIN_MILLIS = 2_000L

        internal fun commandLine(
            properties: LinuxIsolationProperties,
            command: MediaWorkerCommand,
            workspace: MediaWorkerWorkspaceLease,
            limits: MediaNormalizationLimits,
            unit: MediaWorkerUnitName = MediaWorkerUnitName.create(UUID.randomUUID()),
        ): List<String>? {
            if (properties.systemdRun.fileName.toString() != "systemd-run") return null
            if (!safeExecutable(command.javaExecutable) || !safeJar(command.applicationJar) || !safeWorkspace(workspace, properties.workspace)) {
                return null
            }
            val directory = workspace.directory.toAbsolutePath().normalize()
            return listOf(
                properties.systemdRun.toString(),
                "--quiet",
                "--unit=${unit.value}",
                "--wait",
                "--pipe",
                "--working-directory=$directory",
                "--uid=${properties.dedicatedUser}",
                "--property=Type=exec",
                "--property=KillMode=control-group",
                "--property=RuntimeMaxSec=${limits.timeout.value.toMillis()}ms",
                "--property=TimeoutStopSec=2s",
                "--property=SendSIGKILL=yes",
                "--property=KillSignal=SIGKILL",
                "--property=NoNewPrivileges=yes",
                "--property=PrivateDevices=yes",
                "--property=PrivateTmp=yes",
                "--property=ProtectSystem=strict",
                "--property=ProtectHome=yes",
                "--property=ProtectProc=invisible",
                "--property=RestrictSUIDSGID=yes",
                "--property=LockPersonality=yes",
                "--property=RestrictNamespaces=yes",
                "--property=SystemCallArchitectures=native",
                "--property=RestrictAddressFamilies=AF_UNIX",
                "--property=IPAddressDeny=any",
                "--property=DevicePolicy=closed",
                "--property=CapabilityBoundingSet=",
                "--property=AmbientCapabilities=",
                "--property=NoExecPaths=$directory",
                "--property=UMask=0007",
                "--property=MemoryMax=${properties.memoryMaxBytes}",
                "--property=MemorySwapMax=${properties.memorySwapMaxBytes}",
                "--property=MemoryOOMGroup=yes",
                "--property=TasksMax=${properties.pidsMax}",
                "--property=CPUQuota=${properties.cpuQuota}",
                "--property=LimitCORE=0",
                "--property=LimitFSIZE=${limits.workspaceBytes.value + limits.maxOutputBytes.value}",
                "--property=LimitNOFILE=64",
                "--property=LimitNPROC=${properties.pidsMax}",
                "--property=ReadWritePaths=$directory",
                "--property=InaccessiblePaths=/home",
                "--setenv=HOME=$directory",
                "--",
                command.javaExecutable.toString(),
                "-Xmx${limits.workerHeapBytes.value}",
                "-XX:MaxDirectMemorySize=${limits.maxOutputBytes.value}",
                "-Djava.io.tmpdir=$directory",
                "-jar",
                command.applicationJar.toString(),
            )
        }

        private fun safeExecutable(path: Path): Boolean =
            path.isAbsolute && path == path.normalize() && Files.isRegularFile(path, NOFOLLOW_LINKS) && !Files.isSymbolicLink(path)

        private fun safeJar(path: Path): Boolean =
            path.isAbsolute && path == path.normalize() && Files.isRegularFile(path, NOFOLLOW_LINKS) && !Files.isSymbolicLink(path)

        private fun safeWorkspace(workspace: MediaWorkerWorkspaceLease, attestedRoot: Path): Boolean {
            val directory = workspace.directory.toAbsolutePath().normalize()
            if (directory.parent != attestedRoot.toAbsolutePath().normalize()) return false
            return directory.isAbsolute &&
                Files.isDirectory(directory, NOFOLLOW_LINKS) &&
                !Files.isSymbolicLink(directory) &&
                listOf(workspace.input, workspace.request, workspace.result, workspace.output, workspace.diagnostic)
                    .all { it.toAbsolutePath().normalize().parent == directory }
        }
    }

    private class BoundedDrain(
        private val source: InputStream,
        private val cap: Int,
    ) : Thread("media-worker-systemd-drain") {
        private val captured = java.io.ByteArrayOutputStream(cap.coerceAtMost(8_192))
        @Volatile var succeeded = false
            private set
        init { isDaemon = true }
        override fun run() {
            runCatching {
                source.use {
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val count = it.read(buffer)
                        if (count < 0) break
                        val remaining = cap - captured.size()
                        if (remaining > 0) captured.write(buffer, 0, minOf(remaining, count))
                    }
                }
            }.onSuccess { succeeded = true }
        }
        fun bytes(): ByteArray = captured.toByteArray()
    }
}

private fun launchSystemdRun(arguments: List<String>, workspace: Path): Process {
    if (arguments.isEmpty() || !arguments[0].endsWith("systemd-run")) {
        throw IllegalStateException("media worker production launch requires systemd-run")
    }
    val builder = ProcessBuilder(arguments)
        .directory(workspace.toFile())
        .redirectInput(ProcessBuilder.Redirect.PIPE)
    builder.environment().clear()
    return builder.start()
}
