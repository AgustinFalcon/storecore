package com.storecore.catalog.infrastructure.media.worker

import com.storecore.catalog.domain.media.MediaNormalizationLimits
import java.io.InputStream
import java.nio.file.Files
import java.nio.file.LinkOption
import java.time.Duration
import java.util.concurrent.TimeUnit

/**
 * Test-only evidence adapter for controlled helper processes.
 *
 * Java ProcessHandle polling is best-effort and is not an operating-system containment boundary.
 * Production intentionally has no concrete launcher until a verifiable job/cgroup implementation exists.
 */
class TestOnlyBestEffortMediaWorkerLauncher(
    private val terminationGrace: Duration = Duration.ofMillis(250),
) : MediaWorkerLauncher {
    override fun execute(
        command: MediaWorkerCommand,
        workspace: MediaWorkerWorkspaceLease,
        limits: MediaNormalizationLimits,
    ): MediaWorkerExecution {
        if (!safeExecutable(command.javaExecutable) || !safeJar(command.applicationJar) || !safeWorkspace(workspace)) {
            return MediaWorkerExecution.IsolationUnavailable
        }
        val arguments = listOf(
            command.javaExecutable.toString(),
            "-Xmx${limits.workerHeapBytes.value}",
            "-XX:MaxDirectMemorySize=${limits.maxOutputBytes.value}",
            "-Djava.io.tmpdir=${workspace.directory}",
            "-Dloader.main=${MediaWorkerCommand.WORKER_MAIN}",
            "-cp",
            command.applicationJar.toString(),
            PROPERTIES_LAUNCHER,
        )
        var process: Process? = null
        var stdout: BoundedDrain? = null
        var stderr: BoundedDrain? = null
        val trackedDescendants = linkedMapOf<Long, ProcessHandle>()
        return try {
            val builder = ProcessBuilder(arguments)
                .directory(workspace.directory.toFile())
                .redirectInput(ProcessBuilder.Redirect.PIPE)
            builder.environment().clear()
            val started = builder.start()
            process = started
            started.outputStream.close()
            val cap = minOf(limits.maxDiagnosticBytes.value, MAX_DIAGNOSTIC_BYTES.toLong()).toInt()
            val outDrain = BoundedDrain(started.inputStream, cap, "media-worker-stdout").also { it.start() }
            val errDrain = BoundedDrain(started.errorStream, cap, "media-worker-stderr").also { it.start() }
            stdout = outDrain
            stderr = errDrain
            val deadline = System.nanoTime() + limits.timeout.value.toNanos()
            var timedOut = false
            while (started.isAlive) {
                captureDescendants(started, trackedDescendants)
                val remaining = deadline - System.nanoTime()
                if (remaining <= 0) {
                    timedOut = true
                    break
                }
                Thread.sleep(minOf(POLL_MILLIS, TimeUnit.NANOSECONDS.toMillis(remaining).coerceAtLeast(1)))
            }
            captureDescendants(started, trackedDescendants)
            if (timedOut) {
                val terminated = terminateTracked(started, trackedDescendants.values)
                outDrain.join(JOIN_MILLIS)
                errDrain.join(JOIN_MILLIS)
                if (terminated) MediaWorkerExecution.TimedOut else MediaWorkerExecution.Failed
            } else {
                val descendantsTerminated = terminateTracked(null, trackedDescendants.values)
                outDrain.join(JOIN_MILLIS)
                errDrain.join(JOIN_MILLIS)
                if (!descendantsTerminated || outDrain.isAlive || errDrain.isAlive || !outDrain.succeeded || !errDrain.succeeded) {
                    MediaWorkerExecution.Failed
                } else {
                    MediaWorkerExecution.Completed(started.exitValue(), outDrain.bytes(), errDrain.bytes())
                }
            }
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
            MediaWorkerExecution.Failed
        } catch (_: Exception) {
            MediaWorkerExecution.Failed
        } finally {
            val preserveInterrupt = Thread.currentThread().isInterrupted
            if (preserveInterrupt) Thread.interrupted()
            process?.let { started ->
                captureDescendants(started, trackedDescendants)
                terminateTracked(started.takeIf { it.isAlive }, trackedDescendants.values)
                runCatching { started.outputStream.close() }
                runCatching { started.inputStream.close() }
                runCatching { started.errorStream.close() }
            }
            stdout?.let { if (it.isAlive) runCatching { it.join(JOIN_MILLIS) } }
            stderr?.let { if (it.isAlive) runCatching { it.join(JOIN_MILLIS) } }
            if (preserveInterrupt) Thread.currentThread().interrupt()
        }
    }

    private fun safeExecutable(path: java.nio.file.Path): Boolean =
        path.isAbsolute && path == path.normalize() && Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)

    private fun safeJar(path: java.nio.file.Path): Boolean =
        path.isAbsolute && path == path.normalize() && Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)

    private fun safeWorkspace(workspace: MediaWorkerWorkspaceLease): Boolean =
        workspace.directory.isAbsolute && workspace.directory == workspace.directory.normalize() &&
            Files.isDirectory(workspace.directory, LinkOption.NOFOLLOW_LINKS) &&
            listOf(workspace.input, workspace.request, workspace.result, workspace.output, workspace.diagnostic)
                .all { it.toAbsolutePath().normalize().parent == workspace.directory }

    private fun captureDescendants(process: Process, tracked: MutableMap<Long, ProcessHandle>) {
        process.toHandle().descendants().forEach { tracked.putIfAbsent(it.pid(), it) }
    }

    private fun terminateTracked(process: Process?, known: Collection<ProcessHandle>): Boolean {
        val handles = linkedMapOf<Long, ProcessHandle>()
        known.forEach { handles[it.pid()] = it }
        process?.toHandle()?.descendants()?.forEach { handles[it.pid()] = it }
        handles.values.toList().asReversed().filter(ProcessHandle::isAlive).forEach { it.destroy() }
        process?.destroy()
        val deadline = System.nanoTime() + terminationGrace.toNanos()
        while ((process?.isAlive == true || handles.values.any(ProcessHandle::isAlive)) && System.nanoTime() < deadline) {
            Thread.sleep(POLL_MILLIS)
        }
        process?.toHandle()?.descendants()?.forEach { handles[it.pid()] = it }
        handles.values.toList().asReversed().filter(ProcessHandle::isAlive).forEach { it.destroyForcibly() }
        if (process?.isAlive == true) process.destroyForcibly()
        val forcedDeadline = System.nanoTime() + terminationGrace.toNanos()
        while ((process?.isAlive == true || handles.values.any(ProcessHandle::isAlive)) && System.nanoTime() < forcedDeadline) {
            Thread.sleep(POLL_MILLIS)
        }
        return process?.isAlive != true && handles.values.none(ProcessHandle::isAlive)
    }

    private class BoundedDrain(
        private val source: InputStream,
        private val cap: Int,
        name: String,
    ) : Thread(name) {
        private val captured = java.io.ByteArrayOutputStream(cap.coerceAtMost(8_192))
        @Volatile var succeeded = false
            private set
        init { isDaemon = true }
        override fun run() {
            runCatching { source.use {
                val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                while (true) {
                    val count = it.read(buffer)
                    if (count < 0) break
                    val remaining = cap - captured.size()
                    if (remaining > 0) captured.write(buffer, 0, minOf(remaining, count))
                }
            } }.onSuccess { succeeded = true }
        }
        fun bytes(): ByteArray = captured.toByteArray()
    }

    private companion object {
        const val PROPERTIES_LAUNCHER = "org.springframework.boot.loader.launch.PropertiesLauncher"
        const val MAX_DIAGNOSTIC_BYTES = 65_536
        const val JOIN_MILLIS = 2_000L
        const val POLL_MILLIS = 5L
    }
}
