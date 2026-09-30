package com.storecore.blackstore

import io.swagger.v3.parser.OpenAPIV3Parser
import io.swagger.v3.parser.core.models.ParseOptions
import com.storecore.blackstore.infrastructure.web.CompanionAdminController
import com.storecore.configuration.infrastructure.web.CapabilityController
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

    @Test
    fun `spring inventory includes only the exact capability routes and their expected owners`() {
        val expected = expectedCapabilityRoutes()
        val actual = handlerMapping.handlerMethods.flatMap { (mapping, handler) ->
            val paths = mapping.pathPatternsCondition?.patterns?.map { it.patternString }
                ?: mapping.patternsCondition?.patterns.orEmpty()
            val methods = mapping.methodsCondition.methods
            paths.filter(::isCapabilityRoute).flatMap { path ->
                if (methods.isEmpty()) listOf(OwnedRoute("*", path, owner(handler), mapping.toString()))
                else methods.map { method -> OwnedRoute(method.name, path, owner(handler), mapping.toString()) }
            }
        }
        val diagnostics = verifyCapabilityRouteInventory(expected, actual)
        assertTrue(diagnostics.isEmpty(), diagnostics.joinToString("\n"))
        assertEquals(7, expected.size, "four mutation routes, list, status and abort")
        assertEquals(
            setOf("changeState", "createKill", "removeKill", "replaceKill", "commandStatus", "abortCommand"),
            expected.values.map { it.substringAfter('#') }.filter { it != "list" }.toSet(),
            "capability command routes stay in the inventory",
        )
        assertEquals(
            setOf("changeState", "createKill", "removeKill", "replaceKill", "commandStatus", "abortCommand"),
            CapabilityController::class.java.declaredMethods.map { it.name }
                .filter { it in expected.values.map { owner -> owner.substringAfter('#') } && it != "list" }.toSet(),
            "mapped capability methods exist on the controller",
        )
        val root = repositoryRoot()
        val controllerSource = Files.readString(root.resolve("backend/src/main/kotlin/com/storecore/configuration/infrastructure/web/CapabilityController.kt"))
        val serviceSource = Files.readString(root.resolve("backend/src/main/kotlin/com/storecore/configuration/infrastructure/JdbcCapabilityService.kt"))
        val controllerCalls = mapOf(
            "changeState" to "adminCommands.changeState(",
            "createKill" to "adminCommands.createKill(",
            "removeKill" to "adminCommands.removeKill(",
            "replaceKill" to "adminCommands.replaceKill(",
        )
        val sqlCallers = mapOf(
            "capability_tx_c_execute" to "SELECT capability_tx_c_execute(",
        )
        controllerCalls.forEach { (method, call) ->
            val methodStart = controllerSource.indexOf("fun $method(")
            assertTrue(methodStart >= 0, "CapabilityController.$method must exist")
            val nextMapping = controllerSource.indexOf("\n    @", methodStart + 1)
            val methodEnd = if (nextMapping >= 0) nextMapping else controllerSource.indexOf("\n}", methodStart).takeIf { it >= 0 } ?: controllerSource.length
            assertTrue(controllerSource.substring(methodStart, methodEnd).contains(call), "CapabilityController.$method must delegate to $call")
        }
        sqlCallers.forEach { (routine, call) ->
            assertTrue(serviceSource.contains(call), "JdbcCapabilityService must call $routine through $call")
        }
        assertFalse(serviceSource.contains("SELECT capability_admin_change_configuration("))
        assertFalse(serviceSource.contains("SELECT capability_admin_create_kill_switch("))
        assertFalse(serviceSource.contains("SELECT capability_admin_remove_kill_switch("))
        assertFalse(serviceSource.contains("SELECT capability_admin_replace_kill_switch("))
    }

    @Test
    fun `spring inventory includes companion admin routes and httpcode envelope`() {
        val expected = expectedCompanionAdminRoutes()
        val actual = handlerMapping.handlerMethods.flatMap { (mapping, handler) ->
            val paths = mapping.pathPatternsCondition?.patterns?.map { it.patternString }
                ?: mapping.patternsCondition?.patterns.orEmpty()
            val methods = mapping.methodsCondition.methods
            paths.filter(::isCompanionAdminRoute).flatMap { path ->
                if (methods.isEmpty()) listOf(OwnedRoute("*", path, owner(handler)))
                else methods.map { method -> OwnedRoute(method.name, path, owner(handler)) }
            }
        }
        val diagnostics = verifyCapabilityRouteInventory(expected, actual)
        assertTrue(diagnostics.isEmpty(), diagnostics.joinToString("\n"))
        assertEquals(6, expected.size, "pair rotate activate suspend revoke and status")
        assertEquals(
            setOf("pair", "rotate", "activate", "suspend", "revoke", "commandStatus"),
            CompanionAdminController::class.java.declaredMethods.map { it.name }
                .filter { it in expected.values.map { owner -> owner.substringAfter('#') } }.toSet(),
        )
        val root = repositoryRoot()
        val controller = Files.readString(root.resolve("backend/src/main/kotlin/com/storecore/blackstore/infrastructure/web/CompanionAdminController.kt"))
        val adapter = Files.readString(root.resolve("backend/src/main/kotlin/com/storecore/blackstore/infrastructure/JdbcCompanionAdminCommands.kt"))
        val envelope = Files.readString(root.resolve("backend/src/main/kotlin/com/storecore/identity/infrastructure/web/IdentityController.kt"))
        assertTrue(controller.contains("BaseResponse.ok(data, code)"))
        assertTrue(controller.contains("HttpCode.Ok"))
        assertTrue(adapter.contains("companion_admin_prepare_command("))
        assertTrue(adapter.contains("companion_admin_attach_secret("))
        assertTrue(adapter.contains("companion_admin_pair("))
        assertTrue(envelope.contains("fun <T> ok(data: T, code: com.storecore.shared.http.HttpCode)"))
        assertTrue(envelope.contains("fun <T> error("))
        assertFalse(adapter.contains("IdentityMutationCoordinator"))
    }

    @Test
    fun `capability topology verifier detects a header-conditioned duplicate and an unexpected route`() {
        val expected = expectedCapabilityRoutes()
        val complete = expected.map { (route, expectedOwner) -> OwnedRoute(route.method, route.path, expectedOwner) }
        val stateRoute = RouteKey("POST", "$CAPABILITY_PATH/{module}/state")
        val duplicateWithRequestCondition = OwnedRoute(
            stateRoute.method,
            stateRoute.path,
            "ConditionalController#changeStateForHeader",
            "headers=[X-Source=admin]",
        )
        val unexpected = OwnedRoute("PATCH", "$CAPABILITY_PATH/unplanned", "UnexpectedController#unplanned", "params=[mode=internal]")

        val diagnostics = verifyCapabilityRouteInventory(expected, complete + duplicateWithRequestCondition + unexpected)
        assertTrue(diagnostics.any { it.contains("duplicate POST $CAPABILITY_PATH/{module}/state") }, diagnostics.toString())
        assertTrue(diagnostics.any { it.contains("unexpected PATCH $CAPABILITY_PATH/unplanned") }, diagnostics.toString())
        assertTrue(diagnostics.any { it.contains("ConditionalController#changeStateForHeader") }, diagnostics.toString())
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

    private fun verifyCapabilityRouteInventory(expected: Map<RouteKey, String>, actual: List<OwnedRoute>): List<String> {
        val diagnostics = mutableListOf<String>()
        val actualKeys = actual.map { RouteKey(it.method, it.path) }.toSet()
        (expected.keys - actualKeys).sortedWith(routeOrder).forEach { diagnostics += "missing ${it.method} ${it.path}" }
        (actualKeys - expected.keys).sortedWith(routeOrder).forEach { diagnostics += "unexpected ${it.method} ${it.path}" }
        actual.groupBy { RouteKey(it.method, it.path) }
            .filterValues { mappings -> mappings.size != 1 }
            .toSortedMap(routeOrder)
            .forEach { (key, mappings) -> diagnostics += "duplicate ${key.method} ${key.path}: ${mappings.map { it.description() }.sorted()}" }
        actual.forEach { route ->
            val key = RouteKey(route.method, route.path)
            val expectedOwner = expected[key]
            if (expectedOwner != null && route.owner != expectedOwner) {
                diagnostics += "wrong owner ${key.method} ${key.path}: expected $expectedOwner, got ${route.description()}"
            }
        }
        return diagnostics
    }

    private fun isInScope(path: String): Boolean = path == BASE_PATH || path.startsWith("$BASE_PATH/")
    private fun isCapabilityRoute(path: String): Boolean = path == CAPABILITY_PATH || path.startsWith("$CAPABILITY_PATH/")
    private fun isCompanionAdminRoute(path: String): Boolean = path == COMPANION_ADMIN_PATH || path.startsWith("$COMPANION_ADMIN_PATH/")
    private fun owner(handler: org.springframework.web.method.HandlerMethod): String = "${handler.beanType.simpleName}#${handler.method.name}"

    private fun expectedCapabilityRoutes(): Map<RouteKey, String> = linkedMapOf(
        RouteKey("GET", CAPABILITY_PATH) to "CapabilityController#list",
        RouteKey("POST", "$CAPABILITY_PATH/{module}/state") to "CapabilityController#changeState",
        RouteKey("POST", "$CAPABILITY_PATH/{module}/kills") to "CapabilityController#createKill",
        RouteKey("POST", "$CAPABILITY_PATH/{module}/kills/{id}/remove") to "CapabilityController#removeKill",
        RouteKey("POST", "$CAPABILITY_PATH/{module}/kills/{id}/replace") to "CapabilityController#replaceKill",
        RouteKey("GET", "$CAPABILITY_PATH/commands/{correlationId}") to "CapabilityController#commandStatus",
        RouteKey("POST", "$CAPABILITY_PATH/commands/{correlationId}/abort") to "CapabilityController#abortCommand",
    )

    private fun expectedCompanionAdminRoutes(): Map<RouteKey, String> = linkedMapOf(
        RouteKey("POST", "$COMPANION_ADMIN_PATH/pair") to "CompanionAdminController#pair",
        RouteKey("POST", "$COMPANION_ADMIN_PATH/rotate") to "CompanionAdminController#rotate",
        RouteKey("POST", "$COMPANION_ADMIN_PATH/activate") to "CompanionAdminController#activate",
        RouteKey("POST", "$COMPANION_ADMIN_PATH/suspend") to "CompanionAdminController#suspend",
        RouteKey("POST", "$COMPANION_ADMIN_PATH/revoke") to "CompanionAdminController#revoke",
        RouteKey("GET", "$COMPANION_ADMIN_PATH/commands/{correlationId}") to "CompanionAdminController#commandStatus",
    )

    private fun repositoryRoot(): Path {
        var candidate: Path? = Path.of("").toAbsolutePath().normalize()
        while (candidate != null) {
            if (Files.isRegularFile(candidate.resolve(CANONICAL_CONTRACT))) return candidate
            candidate = candidate.parent
        }
        error("Could not locate repository root containing $CANONICAL_CONTRACT")
    }

    private data class RouteKey(val method: String, val path: String)
    private data class OwnedRoute(val method: String, val path: String, val owner: String, val conditions: String = "") {
        fun description() = if (conditions.isBlank()) owner else "$owner [$conditions]"
    }

    companion object {
        private const val BASE_PATH = "/blackstore-integration/v1"
        private const val OPENAPI_PATH = "$BASE_PATH/openapi.yaml"
        private const val CAPABILITY_PATH = "/api/v1/user/capabilities"
        private const val COMPANION_ADMIN_PATH = "/api/v1/internal/admin/blackstore-companion"
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
