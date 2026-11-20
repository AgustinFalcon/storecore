package com.storecore.catalog.infrastructure.media.worker

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipFile

class PackagedMediaWorkerInventoryIT {
    @Test
    fun `shaded worker contains authoritative resolved inventory and real Kotlin classes`() {
        val jar = Path.of(requireNotNull(System.getProperty("storecore.media.worker.packagedJar")))
        assertTrue(Files.isRegularFile(jar), "packaged worker jar is required")
        ZipFile(jar.toFile()).use { zip ->
            val entry = requireNotNull(zip.getEntry(MediaWorkerDependencyInventory.RESOURCE))
            val inventory = requireNotNull(zip.getInputStream(entry).use(MediaWorkerDependencyInventory::decode))
            assertEquals("1.9.25", inventory.modules.single { it.module == "org.jetbrains.kotlin:kotlin-stdlib" }.version)
            assertTrue(zip.getEntry("kotlin/KotlinVersion.class") != null, "shaded jar must contain the Kotlin runtime")
            val text = zip.getInputStream(entry).bufferedReader().use { it.readText() }
            assertFalse(text.contains("\${"), "Maven placeholders must be resolved in the packaged artifact")
        }
    }
}
