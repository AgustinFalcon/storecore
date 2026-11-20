package com.storecore.catalog.media.worker.supply

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.condition.EnabledIf
import java.nio.file.Files
import java.nio.file.Path

class CycloneDxBomTest {
    @Test
    @EnabledIf("bomExists")
    fun `runtime bom has hashes and allowlisted licenses only`() {
        val bom = Files.readString(bomPath())
        assertTrue(bom.contains("\"bomFormat\" : \"CycloneDX\""), bom)
        assertFalse(bom.contains("\"serialNumber\""), bom)
        val components = libraryComponents(bom)
        assertTrue(components.isNotEmpty(), bom)
        components.forEach { component ->
            assertTrue(Regex("\"alg\"\\s*:\\s*\"SHA-256\"").containsMatchIn(component), component)
            assertTrue(Regex("\"content\"\\s*:\\s*\"[0-9a-f]{64}\"").containsMatchIn(component), component)
            val group = Regex("\"group\"\\s*:\\s*\"([^\"]+)\"").find(component)?.groupValues?.get(1).orEmpty()
            val licenses = Regex("\"id\"\\s*:\\s*\"([^\"]+)\"").findAll(component).map { it.groupValues[1] }.toList()
            assertTrue(licenses.isNotEmpty(), component)
            licenses.forEach { license ->
                val allowed = AllowedComponentLicense.fromWire(license)
                assertNotEquals(AllowedComponentLicense.UNKNOWN, allowed, "unallowlisted license $license in $component")
                if (allowed == AllowedComponentLicense.TWELVEMONKEYS_BSD) {
                    assertTrue(group.startsWith("com.twelvemonkeys"), "BSD SPDX alias limited to TwelveMonkeys: $component")
                }
            }
        }
        assertEquals(
            null,
            ImageIoProviderInventoryResult.Matched.create(emptySet()),
        )
    }

    companion object {
        @JvmStatic
        fun bomExists(): Boolean = Files.isRegularFile(bomPath())

        private fun bomPath(): Path = Path.of("target/bom.json").toAbsolutePath()

        private fun libraryComponents(bom: String): List<String> {
            val start = bom.lastIndexOf("\"components\"")
            if (start < 0) return emptyList()
            return Regex(
                "\\{\\s*\"type\"\\s*:\\s*\"library\".*?(?=\\{\\s*\"type\"\\s*:\\s*\"library\"|\\s*\\]\\s*\\}\\s*$)",
                setOf(RegexOption.DOT_MATCHES_ALL),
            ).findAll(bom.substring(start)).map { it.value }.toList()
        }
    }
}
