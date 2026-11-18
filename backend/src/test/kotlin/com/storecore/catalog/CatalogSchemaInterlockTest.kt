package com.storecore.catalog

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Assumptions.assumeFalse
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.util.jar.JarEntry
import java.util.jar.JarOutputStream

class CatalogSchemaInterlockTest {
    @TempDir lateinit var temporary: Path

    @Test fun `matching artifact and database marker launches the declared jar`() {
        linuxOnly()
        val jar = artifact("current.jar", "3\n")
        val result = run(jar, databaseVersion = "3", extraArguments = listOf("--server.port=0"))
        assertEquals(0, result.exitCode, result.output)
        assertEquals("-jar|$jar|--server.port=0", Files.readString(temporary.resolve("java.log")).trim())
    }

    @Test fun `previous artifact without declaration is denied before database and java`() {
        linuxOnly()
        val result = run(artifact("previous.jar", null), databaseVersion = "3")
        assertEquals(78, result.exitCode)
        assertTrue(result.output.contains("artifact has no catalog compatibility declaration"))
        assertFalse(Files.exists(temporary.resolve("psql.log")))
        assertFalse(Files.exists(temporary.resolve("java.log")))
    }

    @Test fun `previous declared artifact is denied before java against managed media schema`() {
        linuxOnly()
        val result = run(artifact("previous-declared.jar", "2\n"), databaseVersion = "3")
        assertEquals(78, result.exitCode)
        assertTrue(result.output.contains("artifact/database compatibility mismatch"))
        assertFalse(Files.exists(temporary.resolve("java.log")))
    }

    @Test fun `offline migration invokes only the dedicated runner before admission`() {
        linuxOnly()
        val jar = artifact("current.jar", "3\n")
        val result = migrate(jar)
        assertEquals(0, result.exitCode, result.output)
        assertEquals(
            "-Dloader.main=com.storecore.catalog.CatalogSchemaMigrationRunner|-cp|$jar|org.springframework.boot.loader.launch.PropertiesLauncher",
            Files.readString(temporary.resolve("java.log")).trim(),
        )
    }

    @Test fun `offline migration rejects JVM options that can replace its main class`() {
        linuxOnly()
        val jar = artifact("current.jar", "3\n")
        for (name in listOf("JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS")) {
            Files.deleteIfExists(temporary.resolve("java.log"))
            val result = migrate(jar, mapOf(name to "-Dloader.main=com.storecore.StoreCoreApplicationKt"))
            assertEquals(78, result.exitCode, name)
            assertFalse(Files.exists(temporary.resolve("java.log")), name)
        }
    }

    @Test fun `mismatch missing corrupt or unreachable database marker never launches java`() {
        linuxOnly()
        val jar = artifact("current.jar", "3\n")
        for ((databaseVersion, psqlExit) in listOf("1" to 0, "2" to 0, "" to 0, "future" to 0, "3" to 9)) {
            Files.deleteIfExists(temporary.resolve("java.log"))
            val result = run(jar, databaseVersion, psqlExit = psqlExit)
            assertEquals(78, result.exitCode, "$databaseVersion/$psqlExit: ${result.output}")
            assertFalse(Files.exists(temporary.resolve("java.log")))
        }
    }

    @Test fun `invalid artifact declaration and jdbc url fail closed`() {
        linuxOnly()
        val corrupt = run(artifact("corrupt.jar", "future\n"), databaseVersion = "3")
        assertEquals(78, corrupt.exitCode)
        val invalidUrl = run(artifact("current.jar", "3\n"), databaseVersion = "3", databaseUrl = "http://database")
        assertEquals(78, invalidUrl.exitCode)
        assertFalse(Files.exists(temporary.resolve("java.log")))
    }

    @Test fun `runtime datasource and configuration overrides fail before database and java`() {
        linuxOnly()
        val jar = artifact("current.jar", "3\n")
        val arguments = listOf(
            "--spring.datasource.url=jdbc:postgresql://other/storecore",
            "--spring.datasource.hikari.jdbc-url=jdbc:postgresql://other/storecore",
            "--spring.flyway.enabled=false",
            "--spring.config.location=/tmp/other.yml",
            "--spring.application.json={}",
        )
        for (argument in arguments) {
            Files.deleteIfExists(temporary.resolve("psql.log"))
            Files.deleteIfExists(temporary.resolve("java.log"))
            val result = run(jar, databaseVersion = "3", extraArguments = listOf(argument))
            assertEquals(78, result.exitCode, argument)
            assertFalse(Files.exists(temporary.resolve("psql.log")), argument)
            assertFalse(Files.exists(temporary.resolve("java.log")), argument)
        }
        for (name in listOf(
            "SPRING_APPLICATION_JSON",
            "SPRING_DATASOURCE_HIKARI_JDBCURL",
            "SPRING_DATASOURCE_HIKARI_JDBC_URL",
            "SPRING_FLYWAY_URL",
            "SPRING_CONFIG_IMPORT",
            "JAVA_TOOL_OPTIONS",
            "JDK_JAVA_OPTIONS",
            "_JAVA_OPTIONS",
        )) {
            Files.deleteIfExists(temporary.resolve("psql.log"))
            Files.deleteIfExists(temporary.resolve("java.log"))
            val result = run(jar, databaseVersion = "3", extraEnvironment = mapOf(name to "unsafe"))
            assertEquals(78, result.exitCode, name)
            assertFalse(Files.exists(temporary.resolve("psql.log")), name)
            assertFalse(Files.exists(temporary.resolve("java.log")), name)
        }
    }

    private fun linuxOnly() = assumeFalse(System.getProperty("os.name").startsWith("Windows"), "Linux deployment wrapper")

    private fun artifact(name: String, version: String?): Path {
        val path = temporary.resolve(name)
        JarOutputStream(Files.newOutputStream(path)).use { jar ->
            if (version != null) {
                jar.putNextEntry(JarEntry("BOOT-INF/classes/catalog-schema-compatibility-version.txt"))
                jar.write(version.toByteArray())
                jar.closeEntry()
            }
        }
        return path
    }

    private fun run(jar: Path, databaseVersion: String, psqlExit: Int = 0,
                    databaseUrl: String = "jdbc:postgresql://database/storecore",
                    extraArguments: List<String> = emptyList(),
                    extraEnvironment: Map<String, String> = emptyMap()): ProcessResult {
        val psql = executable("psql.sh", """#!/usr/bin/env sh
printf '%s' "${'$'}@" > "${temporary.resolve("psql.log")}"
printf '%s\n' '${databaseVersion.replace("'", "")}'
exit $psqlExit
""")
        val java = executable("java.sh", """#!/usr/bin/env sh
first=1
for argument in "${'$'}@"; do
  if [ "${'$'}first" -eq 0 ]; then printf '|'; fi
  printf '%s' "${'$'}argument"
  first=0
done > "${temporary.resolve("java.log")}"
""")
        val command = mutableListOf("sh", "scripts/run-with-catalog-schema-interlock.sh", jar.toString())
        command.addAll(extraArguments)
        val process = ProcessBuilder(command).directory(Path.of(".").toAbsolutePath().normalize().toFile())
            .redirectErrorStream(true).apply {
                listOf(
                    "SPRING_APPLICATION_JSON",
                    "SPRING_DATASOURCE_HIKARI_JDBCURL",
                    "SPRING_DATASOURCE_HIKARI_JDBC_URL",
                    "SPRING_FLYWAY_URL",
                    "SPRING_CONFIG_IMPORT",
                    "JAVA_TOOL_OPTIONS",
                    "JDK_JAVA_OPTIONS",
                    "_JAVA_OPTIONS",
                )
                    .forEach(environment()::remove)
                environment()["STORECORE_DB_URL"] = databaseUrl
                environment()["STORECORE_DB_USERNAME"] = "storecore"
                environment()["STORECORE_DB_PASSWORD"] = "secret"
                environment()["STORECORE_PSQL_BIN"] = psql.toString()
                environment()["STORECORE_JAVA_BIN"] = java.toString()
                environment().putAll(extraEnvironment)
            }.start()
        val output = process.inputStream.bufferedReader().readText()
        return ProcessResult(process.waitFor(), output)
    }

    private fun migrate(jar: Path, extraEnvironment: Map<String, String> = emptyMap()): ProcessResult {
        val java = executable("migrate-java.sh", """#!/usr/bin/env sh
first=1
for argument in "${'$'}@"; do
  if [ "${'$'}first" -eq 0 ]; then printf '|'; fi
  printf '%s' "${'$'}argument"
  first=0
done > "${temporary.resolve("java.log")}"
""")
        val process = ProcessBuilder("sh", "scripts/migrate-catalog-schema.sh", jar.toString())
            .directory(Path.of(".").toAbsolutePath().normalize().toFile())
            .redirectErrorStream(true).apply {
                listOf("JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS")
                    .forEach(environment()::remove)
                environment()["STORECORE_DB_URL"] = "jdbc:postgresql://database/storecore"
                environment()["STORECORE_DB_USERNAME"] = "storecore"
                environment()["STORECORE_DB_PASSWORD"] = "secret"
                environment()["STORECORE_JAVA_BIN"] = java.toString()
                environment().putAll(extraEnvironment)
            }.start()
        val output = process.inputStream.bufferedReader().readText()
        return ProcessResult(process.waitFor(), output)
    }

    private fun executable(name: String, body: String): Path = temporary.resolve(name).also {
        Files.writeString(it, body)
        it.toFile().setExecutable(true)
    }

    private data class ProcessResult(val exitCode: Int, val output: String)
}
