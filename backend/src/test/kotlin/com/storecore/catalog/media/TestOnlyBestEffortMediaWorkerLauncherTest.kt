package com.storecore.catalog.media

import com.storecore.catalog.domain.media.MediaDurationLimit
import com.storecore.catalog.domain.media.MediaNormalizationLimits
import com.storecore.catalog.infrastructure.media.worker.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.util.UUID
import java.util.jar.JarEntry
import java.util.jar.JarOutputStream
import javax.tools.ToolProvider

class TestOnlyBestEffortMediaWorkerLauncherTest {
    @TempDir lateinit var temporary: Path

    @Test
    fun `fixed direct launch clears environment and drains bounded stdout and stderr concurrently`() {
        val jar = fakeWorkerJar(temporary.resolve("fake-worker"))
        val lease = workspace()
        Files.writeString(lease.request, "flood")
        val command = requireNotNull(MediaWorkerCommand.create(javaExecutable(), jar))

        val result = TestOnlyBestEffortMediaWorkerLauncher().execute(command, lease, MediaNormalizationLimits.standard())

        assertTrue(result is MediaWorkerExecution.Completed)
        result as MediaWorkerExecution.Completed
        assertEquals(0, result.exitCode)
        val environmentLine = String(result.stdout).lineSequence().first()
        assertTrue(
            environmentLine == "ENV=" || environmentLine.equals("ENV=SystemRoot", ignoreCase = true),
            "only the Windows process API may restore SystemRoot; got $environmentLine",
        )
        assertEquals(65_536, result.stdout.size)
        assertEquals(65_536, result.stderr.size)
        lease.close()
    }

    @Test
    fun `deadline kills worker and reports timeout instead of a partial completion`() {
        val jar = fakeWorkerJar(temporary.resolve("fake-worker"))
        val lease = workspace()
        Files.writeString(lease.request, "sleep")
        val command = requireNotNull(MediaWorkerCommand.create(javaExecutable(), jar))
        val standard = MediaNormalizationLimits.standard()
        val short = requireNotNull(
            MediaNormalizationLimits.create(
                standard.maxInputBytes, standard.maxOutputBytes, standard.minSide, standard.maxSide,
                standard.maxPixels, standard.workerHeapBytes, standard.workspaceBytes,
                MediaDurationLimit.fromWire(150), standard.maxConcurrency, standard.maxDiagnosticBytes,
                standard.maxContainerSegments, standard.maxMetadataBytes,
            ),
        )

        assertSame(MediaWorkerExecution.TimedOut, TestOnlyBestEffortMediaWorkerLauncher().execute(command, lease, short))
        lease.close()
    }

    @Test
    fun `interruption is preserved and the already started worker is killed`() {
        val jar = fakeWorkerJar(temporary.resolve("fake-worker"))
        val lease = workspace()
        Files.writeString(lease.request, "sleep")
        val command = requireNotNull(MediaWorkerCommand.create(javaExecutable(), jar))

        val executingThread = Thread.currentThread()
        val interrupter = Thread {
            val deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(5)
            while (!Files.exists(lease.diagnostic) && System.nanoTime() < deadline) Thread.sleep(10)
            executingThread.interrupt()
        }.also { it.start() }
        val result = TestOnlyBestEffortMediaWorkerLauncher().execute(command, lease, MediaNormalizationLimits.standard())
        assertSame(MediaWorkerExecution.Failed, result)
        assertTrue(Thread.currentThread().isInterrupted)
        Thread.interrupted()
        interrupter.join()
        val pid = Files.readString(lease.diagnostic).trim().toLong()
        assertFalse(ProcessHandle.of(pid).map(ProcessHandle::isAlive).orElse(false))
        lease.close()
    }

    @Test
    fun `child retained before parent exit is terminated after parent exits first`() {
        val jar = fakeWorkerJar(temporary.resolve("fake-worker"))
        val lease = workspace()
        Files.writeString(lease.request, "orphan")
        val command = requireNotNull(MediaWorkerCommand.create(javaExecutable(), jar))

        val result = TestOnlyBestEffortMediaWorkerLauncher().execute(command, lease, MediaNormalizationLimits.standard())

        assertTrue(result is MediaWorkerExecution.Completed)
        val childPid = Files.readString(lease.diagnostic).trim().toLong()
        assertFalse(ProcessHandle.of(childPid).map(ProcessHandle::isAlive).orElse(false))
        lease.close()
    }

    private fun workspace() =
        ((PrivateMediaWorkerWorkspace(temporary.resolve("workspaces")).create(UUID.randomUUID()) as MediaWorkerWorkspaceResult.Created).lease)

    private fun javaExecutable(): Path {
        val name = if (System.getProperty("os.name").startsWith("Windows", ignoreCase = true)) "java.exe" else "java"
        return Path.of(System.getProperty("java.home"), "bin", name).toAbsolutePath().normalize()
    }

    private fun fakeWorkerJar(base: Path): Path {
        val source = base.resolve("source")
        val classes = base.resolve("classes")
        Files.createDirectories(source.resolve("org/springframework/boot/loader/launch"))
        Files.createDirectories(source.resolve("com/storecore/catalog/infrastructure/media/worker"))
        Files.createDirectories(classes)
        val launcher = source.resolve("org/springframework/boot/loader/launch/PropertiesLauncher.java")
        Files.writeString(
            launcher,
            """package org.springframework.boot.loader.launch;
            public final class PropertiesLauncher {
              public static void main(String[] args) throws Exception {
                Class<?> type = Class.forName(System.getProperty("loader.main"));
                type.getMethod("main", String[].class).invoke(null, (Object) new String[0]);
              }
            }""".trimIndent(),
        )
        val worker = source.resolve("com/storecore/catalog/infrastructure/media/worker/MediaNormalizerWorkerMainKt.java")
        Files.writeString(
            worker,
            """package com.storecore.catalog.infrastructure.media.worker;
            import java.nio.file.*;
            public final class MediaNormalizerWorkerMainKt {
              public static void main(String[] args) throws Exception {
                if (args.length == 1 && args[0].equals("child")) { Thread.sleep(30000); return; }
                String mode = Files.readString(Path.of("request.bin"));
                if (mode.equals("sleep")) {
                  Files.writeString(Path.of("diagnostic.bin"), Long.toString(ProcessHandle.current().pid()), StandardOpenOption.CREATE_NEW);
                  Thread.sleep(30000); return;
                }
                if (mode.equals("orphan")) {
                  String java = Path.of(System.getProperty("java.home"), "bin", System.getProperty("os.name").toLowerCase().startsWith("windows") ? "java.exe" : "java").toString();
                  Process child = new ProcessBuilder(java, "-cp", System.getProperty("java.class.path"), MediaNormalizerWorkerMainKt.class.getName(), "child").start();
                  Files.writeString(Path.of("diagnostic.bin"), Long.toString(child.pid()), StandardOpenOption.CREATE_NEW);
                  Thread.sleep(200); return;
                }
                java.util.List<String> keys = new java.util.ArrayList<>(System.getenv().keySet());
                java.util.Collections.sort(keys, String.CASE_INSENSITIVE_ORDER);
                System.out.print("ENV=" + String.join(",", keys) + "\n");
                byte[] block = new byte[8192]; java.util.Arrays.fill(block, (byte)'x');
                for (int i = 0; i < 20; i++) { System.out.write(block); System.err.write(block); }
              }
            }""".trimIndent(),
        )
        val compiler = ToolProvider.getSystemJavaCompiler()
        assertNotNull(compiler, "tests require a JDK")
        assertEquals(0, compiler.run(null, null, null, "-d", classes.toString(), launcher.toString(), worker.toString()))
        val jar = base.resolve("fake-worker.jar")
        JarOutputStream(Files.newOutputStream(jar)).use { output ->
            Files.walk(classes).use { paths ->
                paths.filter(Files::isRegularFile).forEach { file ->
                    val name = classes.relativize(file).toString().replace('\\', '/')
                    output.putNextEntry(JarEntry(name))
                    Files.copy(file, output)
                    output.closeEntry()
                }
            }
        }
        return jar.toAbsolutePath().normalize()
    }
}
