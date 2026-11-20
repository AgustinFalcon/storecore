package com.storecore.catalog.infrastructure.media.worker

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream

class MediaWorkerDependencyInventoryTest {
    @Test
    fun `filtered runtime inventory exposes the exact closed dependency set`() {
        val inventory = requireNotNull(MediaWorkerDependencyInventory.load())
        assertEquals(9, inventory.modules.size)
        assertEquals("1.9.25", inventory.modules.single { it.module == "org.jetbrains.kotlin:kotlin-stdlib" }.version)
        assertEquals("13.0", inventory.modules.single { it.module == "org.jetbrains:annotations" }.version)
        assertTrue(inventory.modules.filter { it.module.startsWith("com.twelvemonkeys.") }.all { it.version == "3.15.3" })
    }

    @Test
    fun `missing duplicate extra and unfiltered inventory values fail closed`() {
        assertNull(MediaWorkerDependencyInventory.load { null })
        assertNull(decode("inventory.version=1\nmodule.count=1\nmodule.0.coordinate=org.jetbrains.kotlin:kotlin-stdlib\nmodule.0.version=1.9.25\n"))
        assertNull(validInventory().replace("module.8.coordinate=com.twelvemonkeys.imageio:imageio-webp", "module.8.coordinate=org.jetbrains.kotlin:kotlin-stdlib").let(::decode))
        assertNull(validInventory().replace("module.8.version=3.15.3", "module.8.version=\${twelvemonkeys.version}").let(::decode))
    }

    private fun decode(value: String): MediaWorkerDependencyInventory? =
        MediaWorkerDependencyInventory.decode(ByteArrayInputStream(value.toByteArray()))

    private fun validInventory(): String = requireNotNull(
        MediaWorkerDependencyInventory::class.java.classLoader.getResourceAsStream(MediaWorkerDependencyInventory.RESOURCE),
    ).bufferedReader().use { it.readText() }
}
