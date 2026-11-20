package com.storecore.catalog.media.worker.supply

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

class MediaWorkerSupplyChainTest {
    @Test
    fun `runtime tree pins TwelveMonkeys 3_15_3 without ranges or extra imageio modules`() {
        val tree = Files.readString(runtimeTree())
        assertFalse(tree.contains("[") && tree.contains(","), tree)
        assertFalse(Regex("imageio-(bmp|tiff|psd|hdr|pnm|sgi|tga|thumbsdb|batik|svg)", RegexOption.IGNORE_CASE).containsMatchIn(tree), tree)
        assertEquals(3, Regex("com\\.twelvemonkeys\\.imageio:imageio-(?:core|jpeg|webp):jar:3\\.15\\.3").findAll(tree).map { it.value }.toSet().size, tree)
        assertTrue(tree.contains("com.twelvemonkeys.imageio:imageio-metadata:jar:3.15.3"), tree)
        assertTrue(tree.contains("com.twelvemonkeys.common:common-lang:jar:3.15.3"), tree)
        assertTrue(tree.contains("com.twelvemonkeys.common:common-io:jar:3.15.3"), tree)
        assertTrue(tree.contains("com.twelvemonkeys.common:common-image:jar:3.15.3"), tree)
        assertTrue(tree.contains("org.jetbrains.kotlin:kotlin-stdlib:jar:1.9.25"), tree)
        assertFalse(tree.contains("org.springframework"), tree)
        assertFalse(tree.contains("com.fasterxml.jackson"), tree)
    }

    @Test
    fun `spring backend pom does not activate TwelveMonkeys`() {
        val backendPom = Files.readString(moduleRoot().resolve("../pom.xml").normalize())
        assertFalse(backendPom.contains("twelvemonkeys"), backendPom)
        assertFalse(backendPom.contains("storecore-media-worker"), backendPom)
    }

    @Test
    fun `media-worker pom pins exact versions and forbids ranges`() {
        val pom = Files.readString(moduleRoot().resolve("pom.xml"))
        assertTrue(pom.contains("<twelvemonkeys.version>3.15.3</twelvemonkeys.version>"), pom)
        assertTrue(pom.contains("<kotlin.version>1.9.25</kotlin.version>"), pom)
        assertFalse(Regex("<twelvemonkeys\\.version>\\[|<kotlin\\.version>\\[|<junit\\.jupiter\\.version>\\[").containsMatchIn(pom), pom)
        assertFalse(Regex("<artifactId>imageio-(?:core|jpeg|webp)</artifactId>\\s*<version>\\[").containsMatchIn(pom), pom)
        assertTrue(pom.contains("<dependencyConvergence/>"), pom)
        assertTrue(pom.contains("<banDynamicVersions"), pom)
        assertTrue(pom.contains("cyclonedx-maven-plugin"), pom)
    }

    private fun runtimeTree(): Path {
        val path = moduleRoot().resolve("target/runtime-tree.txt")
        assertTrue(Files.isRegularFile(path), "missing $path; generate-test-resources must run")
        return path
    }

    private fun moduleRoot(): Path {
        var current = Path.of("").toAbsolutePath()
        while (current != null) {
            val candidate = current.resolve("pom.xml")
            if (Files.isRegularFile(candidate) && Files.readString(candidate).contains("<artifactId>storecore-media-worker</artifactId>")) {
                return current
            }
            current = current.parent
        }
        throw IllegalStateException("media-worker module root not found")
    }
}
