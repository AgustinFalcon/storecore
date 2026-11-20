package com.storecore.catalog.infrastructure.media.worker

import java.nio.file.Path
import java.util.UUID
import java.util.concurrent.TimeUnit

class MediaWorkerUnitName private constructor(val value: String) {
    companion object {
        fun create(id: UUID): MediaWorkerUnitName = MediaWorkerUnitName("storecore-media-$id.service")
    }
}

sealed interface MediaWorkerUnitTermination {
    data object Confirmed : MediaWorkerUnitTermination
    data object Unknown : MediaWorkerUnitTermination
}

fun interface MediaWorkerUnitController {
    /** A successful --wait client proves the start was acknowledged before a missing unit is accepted. */
    fun terminate(unit: MediaWorkerUnitName, completedSuccessfully: Boolean): MediaWorkerUnitTermination
}

internal enum class SystemdUnitActiveState {
    INACTIVE, FAILED, OTHER, UNKNOWN;
    val terminal: Boolean get() = this == INACTIVE || this == FAILED
    companion object {
        fun fromWire(raw: String?): SystemdUnitActiveState = when (raw) {
            "inactive" -> INACTIVE
            "failed" -> FAILED
            "active", "activating", "deactivating", "reloading", "refreshing", "maintenance" -> OTHER
            else -> UNKNOWN
        }
    }
}

internal data class SystemctlResult(val exitCode: Int, val output: String)

internal enum class SystemdUnitJobState {
    NONE, UNKNOWN;
    companion object {
        fun fromWire(raw: String?): SystemdUnitJobState = if (raw == "" || raw == "0") NONE else UNKNOWN
    }
}

/** All commands target a single generated unit, never the client PID or a textual shell command. */
class SystemdMediaWorkerUnitController internal constructor(
    private val systemctl: Path,
    private val run: (List<String>) -> SystemctlResult?,
) : MediaWorkerUnitController {
    constructor(systemctl: Path) : this(systemctl, ::runSystemctl)

    override fun terminate(unit: MediaWorkerUnitName, completedSuccessfully: Boolean): MediaWorkerUnitTermination {
        return runCatching {
            // --kill-whom=all covers descendants. stop replaces a pending start job and waits for it.
            command("kill", "--kill-whom=all", "--signal=KILL", unit.value)
            val stopped = command("stop", unit.value)?.exitCode == 0
            val result = command("show", "--property=LoadState,ActiveState,MainPID,ControlPID,ControlGroup,Job", unit.value)
                ?: return MediaWorkerUnitTermination.Unknown
            val fields = result.output.lineSequence().filter { it.contains('=') }
                .map { it.substringBefore('=') to it.substringAfter('=') }.toList()
            if (fields.map { it.first }.distinct().size != fields.size) return MediaWorkerUnitTermination.Unknown
            val values = fields.toMap()
            if (values["LoadState"] == "not-found") {
                // stop success fences an acknowledged start; a vanished client alone does not.
                return if (stopped || completedSuccessfully) MediaWorkerUnitTermination.Confirmed else MediaWorkerUnitTermination.Unknown
            }
            if (!stopped || result.exitCode != 0 || values["LoadState"] != "loaded") return MediaWorkerUnitTermination.Unknown
            val state = SystemdUnitActiveState.fromWire(values["ActiveState"])
            // A stopped control-group service must have released its cgroup, including descendants.
            if (state.terminal && values["MainPID"] == "0" && values["ControlPID"] == "0" &&
                values["ControlGroup"] == "" && SystemdUnitJobState.fromWire(values["Job"]) == SystemdUnitJobState.NONE) {
                MediaWorkerUnitTermination.Confirmed
            } else MediaWorkerUnitTermination.Unknown
        }.onFailure { if (it is InterruptedException) Thread.currentThread().interrupt() }
            .getOrDefault(MediaWorkerUnitTermination.Unknown)
    }

    private fun command(vararg args: String): SystemctlResult? = run(listOf(systemctl.toString(), "--no-ask-password", *args))
}

private fun runSystemctl(arguments: List<String>): SystemctlResult? = runCatching {
    val builder = ProcessBuilder(arguments).redirectError(ProcessBuilder.Redirect.DISCARD)
    builder.environment().clear()
    val process = builder.start()
    process.outputStream.close()
    var bytes: ByteArray? = null
    val reader = Thread {
        bytes = runCatching { process.inputStream.use { it.readNBytes(8_193) } }.getOrNull()
    }.apply { isDaemon = true; start() }
    try {
        if (!process.waitFor(2_000, TimeUnit.MILLISECONDS)) return null
        reader.join(2_000)
        val output = bytes ?: return null
        if (output.size > 8_192) return null
        SystemctlResult(process.exitValue(), output.toString(Charsets.UTF_8))
    } finally {
        if (process.isAlive) process.destroyForcibly()
        runCatching { process.inputStream.close() }
    }
}.onFailure { if (it is InterruptedException) Thread.currentThread().interrupt() }.getOrNull()
