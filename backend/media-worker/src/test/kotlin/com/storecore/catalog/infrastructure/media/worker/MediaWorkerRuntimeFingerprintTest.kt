package com.storecore.catalog.infrastructure.media.worker

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipOutputStream

class MediaWorkerRuntimeFingerprintTest {
    @TempDir lateinit var workspace: Path

    @Test
    fun `in-process fallback hashes only a real packaged jar`() {
        val classes = Files.createDirectory(workspace.resolve("classes"))
        val jar = MediaWorkerTestFixtures.minimalJar(workspace.resolve("worker.jar"))
        assertEquals(
            jar.toAbsolutePath().normalize(),
            MediaWorkerRuntimeFingerprint.resolveExecutingJar(classes, jar),
        )
    }

    @Test
    fun `missing directory symlink and non-jar paths fail closed`() {
        val classes = Files.createDirectory(workspace.resolve("classes"))
        val missing = workspace.resolve("missing.jar")
        val directory = Files.createDirectory(workspace.resolve("not-a-worker.jar"))
        val nonJar = Files.writeString(workspace.resolve("plain-text.jar"), "packaged-worker-fixture")
        val emptyZip = workspace.resolve("empty.jar")
        ZipOutputStream(Files.newOutputStream(emptyZip)).use { }

        assertNull(MediaWorkerRuntimeFingerprint.resolveExecutingJar(classes, missing))
        assertNull(MediaWorkerRuntimeFingerprint.resolveExecutingJar(directory, null))
        assertNull(MediaWorkerRuntimeFingerprint.resolveExecutingJar(null, directory))
        assertNull(MediaWorkerRuntimeFingerprint.resolveExecutingJar(null, nonJar))
        assertNull(MediaWorkerRuntimeFingerprint.resolveExecutingJar(null, emptyZip))
    }

    @Test
    fun `symlink jar fails closed without following it`() {
        val target = MediaWorkerTestFixtures.minimalJar(workspace.resolve("real.jar"))
        val linked = workspace.resolve("linked.jar")
        val created = runCatching { Files.createSymbolicLink(linked, target) }.isSuccess
        assumeTrue(created, "host does not permit symlink creation")
        assertNull(MediaWorkerRuntimeFingerprint.resolveExecutingJar(null, linked))
        assertNull(MediaWorkerRuntimeFingerprint.resolveExecutingJar(linked, null))
    }

    @Test
    fun `packaged CodeSource is authoritative and rejects a different property jar`() {
        val packaged = MediaWorkerTestFixtures.minimalJar(workspace.resolve("packaged.jar"))
        val injected = MediaWorkerTestFixtures.minimalJar(workspace.resolve("injected.jar"))
        assertEquals(
            packaged.toAbsolutePath().normalize(),
            MediaWorkerRuntimeFingerprint.resolveExecutingJar(packaged, null),
        )
        assertEquals(
            packaged.toAbsolutePath().normalize(),
            MediaWorkerRuntimeFingerprint.resolveExecutingJar(packaged, packaged),
        )
        assertNull(MediaWorkerRuntimeFingerprint.resolveExecutingJar(packaged, injected))
        assertNull(MediaWorkerRuntimeFingerprint.resolveExecutingJar(packaged, workspace.resolve("missing.jar")))
    }
}
