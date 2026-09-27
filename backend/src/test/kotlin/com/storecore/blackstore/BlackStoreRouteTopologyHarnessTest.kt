package com.storecore.blackstore

import io.swagger.v3.parser.OpenAPIV3Parser
import io.swagger.v3.parser.core.models.ParseOptions
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.web.bind.annotation.RequestMethod
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping
import org.testcontainers.containers.PostgreSQLContainer
import java.nio.file.Files
import java.nio.file.Path

@SpringBootTest(properties = ["storecore.installation-guard.enabled=false"])
class BlackStoreRouteTopologyHarnessTest(
    @Autowired @Qualifier("requestMappingHandlerMapping")
    private val handlerMapping: RequestMappingHandlerMapping,
) {
    @Test
    fun `spring exposes exactly one owner for every baseline contract route`() {
        val expected = expectedContractRoutes()
        val actual = handlerMapping.handlerMethods.flatMap { (mapping, handler) ->
            val paths = mapping.pathPatternsCondition?.patterns?.map { it.patternString }
                ?: mapping.patternsCondition?.patterns.orEmpty()
            val methods = mapping.methodsCondition.methods
            paths.filter(::isInScope).flatMap { path ->
                if (methods.isEmpty()) listOf(OwnedRoute("*", path, owner(handler)))
                else methods.map { method -> OwnedRoute(method.name, path, owner(handler)) }
            }
        }
        val diagnostics = verifyRouteInventory(expected, actual)
        assertTrue(diagnostics.isEmpty(), diagnostics.joinToString("\n"))
        assertEquals(8, expected.size, "seven YAML operations plus the served OpenAPI document")
    }

    @Test
    fun `pure verifier reports duplicate owner and missing served OpenAPI route`() {
        val expected = expectedContractRoutes()
        val complete = expected.map { route -> OwnedRoute(route.method, route.path, "BlackStoreIntegrationController") }
        val withDuplicate = complete + OwnedRoute("GET", "$BASE_PATH/catalog", "UnexpectedController")
        val withoutOpenApi = complete.filterNot { it.path == OPENAPI_PATH }
        val duplicateDiagnostics = verifyRouteInventory(expected, withDuplicate)
        assertTrue(duplicateDiagnostics.any { it.contains("duplicate") && it.contains("GET") && it.contains("/catalog") }, duplicateDiagnostics.toString())
        val missingDiagnostics = verifyRouteInventory(expected, withoutOpenApi)
        assertTrue(missingDiagnostics.any { it.contains("missing") && it.contains(OPENAPI_PATH) }, missingDiagnostics.toString())
        assertFalse(missingDiagnostics.any { it.contains("unexpected") }, missingDiagnostics.toString())
    }

    private fun expectedContractRoutes(): Set<RouteKey> {
        val contractPath = repositoryRoot().resolve(CANONICAL_CONTRACT)
        val parsed = OpenAPIV3Parser().readLocation(contractPath.toUri().toString(), null, ParseOptions())
        check(parsed.openAPI != null) { "Could not parse canonical OpenAPI: ${parsed.messages.joinToString("\n")}" }
        check(parsed.messages.isNullOrEmpty()) { "Canonical OpenAPI parser warnings: ${parsed.messages.joinToString("\n")}" }
        val yamlRoutes = parsed.openAPI.paths.flatMap { (path, item) ->
            item.readOperationsMap().keys.map { method -> RouteKey(method.name, path) }
        }.toSet()
        check(yamlRoutes.size == 7) { "Expected seven business operations in canonical YAML, found ${yamlRoutes.size}: $yamlRoutes" }
        check(yamlRoutes.all { it.path.startsWith(BASE_PATH) }) { "Canonical route escaped $BASE_PATH: $yamlRoutes" }
        return yamlRoutes + RouteKey(RequestMethod.GET.name, OPENAPI_PATH)
    }

    private fun verifyRouteInventory(expected: Set<RouteKey>, actual: List<OwnedRoute>): List<String> {
        val diagnostics = mutableListOf<String>()
        val actualKeys = actual.map { RouteKey(it.method, it.path) }.toSet()
        (expected - actualKeys).sortedWith(routeOrder).forEach { diagnostics += "missing ${it.method} ${it.path}" }
        (actualKeys - expected).sortedWith(routeOrder).forEach { diagnostics += "unexpected ${it.method} ${it.path}" }
        actual.groupBy { RouteKey(it.method, it.path) }
            .filterValues { owners -> owners.size != 1 }
            .toSortedMap(routeOrder)
            .forEach { (key, owners) -> diagnostics += "duplicate ${key.method} ${key.path}: ${owners.map { it.owner }.sorted()}" }
        return diagnostics
    }

    private fun isInScope(path: String): Boolean = path == BASE_PATH || path.startsWith("$BASE_PATH/")
    private fun owner(handler: org.springframework.web.method.HandlerMethod): String = "${handler.beanType.simpleName}#${handler.method.name}"

    private fun repositoryRoot(): Path {
        var candidate: Path? = Path.of("").toAbsolutePath().normalize()
        while (candidate != null) {
            if (Files.isRegularFile(candidate.resolve(CANONICAL_CONTRACT))) return candidate
            candidate = candidate.parent
        }
        error("Could not locate repository root containing $CANONICAL_CONTRACT")
    }

    private data class RouteKey(val method: String, val path: String)
    private data class OwnedRoute(val method: String, val path: String, val owner: String)

    companion object {
        private const val BASE_PATH = "/blackstore-integration/v1"
        private const val OPENAPI_PATH = "$BASE_PATH/openapi.yaml"
        private const val CANONICAL_CONTRACT = "sdd/wip/20260921-storecore-pos-integration-contract-v1/2-technical/api/blackstore-integration.openapi.yaml"
        private val routeOrder = compareBy<RouteKey>({ it.path }, { it.method })
        private val postgres = PostgreSQLContainer<Nothing>("postgres:16-alpine")

        @JvmStatic
        @DynamicPropertySource
        fun database(registry: DynamicPropertyRegistry) {
            postgres.start()
            registry.add("spring.datasource.url") { postgres.jdbcUrl }
            registry.add("spring.datasource.username") { postgres.username }
            registry.add("spring.datasource.password") { postgres.password }
        }
    }
}
