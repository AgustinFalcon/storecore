package com.storecore

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.extension
import kotlin.streams.asSequence
import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ArchitectureBoundaryTest {
    private val mainRoot = Path.of("src/main/kotlin/com/storecore")
    private val forbiddenDomainImports = listOf("org.springframework", "jakarta.", "javax.persistence")

    @Test
    fun `core domain source does not import frameworks`() {
        val domainSources = domainSources()
        assertTrue(domainSources.isNotEmpty(), "expected at least one core domain source")
        domainSources.forEach { source ->
            val content = Files.readString(source)
            forbiddenDomainImports.forEach { forbidden ->
                assertFalse(content.contains(forbidden), "$source must not depend on $forbidden")
            }
        }
    }

    @Test
    fun `production application does not bind catalog fixtures`() {
        val application = Files.readString(Path.of("src/main/kotlin/com/storecore/StoreCoreApplication.kt"))
        assertFalse(application.contains("InMemory"), "production must not bind an in-memory catalog")
        assertFalse(application.contains("Fixture"), "production must not bind fixture repositories")
    }

    private fun domainSources(): List<Path> =
        Files.walk(mainRoot).use { paths ->
            paths.asSequence()
                .filter { Files.isRegularFile(it) && it.extension == "kt" }
                .filter { source ->
                    val path = source.toString().replace('\\', '/')
                    path.contains("/domain/")
                }
                .toList()
        }
}
