package com.storecore.configuration.infrastructure.web

import com.storecore.configuration.application.CapabilityAdministrationPort
import com.storecore.configuration.application.CapabilityConfigInvalid
import com.storecore.configuration.application.CapabilityConfigurationMissing
import com.storecore.configuration.domain.CapabilityModuleView
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.domain.InstallationCapabilityModule
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Instant
import java.util.UUID
import javax.sql.DataSource

@RestController
@RequestMapping("/api/v1/user/capabilities")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class CapabilityController(
    private val capabilities: CapabilityAdministrationPort,
    private val auth: RequestAuth,
    private val mutations: IdentityMutationCoordinator,
) {
    @GetMapping
    fun list(http: HttpServletRequest): BaseResponse<List<Map<String, Any?>>> {
        auth.operatorOrAdmin(http)
        return BaseResponse.ok(consoleCapabilityPayload(capabilities.list()))
    }

    @PostMapping("/{module}/state")
    fun changeState(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable module: String, @Valid @RequestBody request: CapabilityStateRequest): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        requireConsoleModule(module)
        val mutation = mutations.execute(actor, csrf) {
            capabilities.changeState(actor, module, requireCapabilityState(request.state), request.expectedConfigVersion, request.reason, request.correlationId ?: UUID.randomUUID())
            capabilities.list().first { it.module.wire == module }
        }
        return ResponseEntity.ok().header(RequestAuth.CSRF_HEADER, mutation.nextCsrf)
            .body(BaseResponse.ok(capabilityPayload(mutation.value)))
    }

    @PostMapping("/{module}/kills")
    fun createKill(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable module: String, @Valid @RequestBody request: KillRequest): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        requireConsoleModule(module)
        val mutation = mutations.execute(actor, csrf) {
            capabilities.createKill(actor, module, request.action, request.owner, request.reason, Instant.parse(request.expiresAt), request.ticket, request.correlationId)
        }
        return ResponseEntity.ok().header(RequestAuth.CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok(mapOf("id" to mutation.value)))
    }

    @PostMapping("/{module}/kills/{id}/remove")
    fun removeKill(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable module: String, @PathVariable id: Long, @Valid @RequestBody request: KillCloseRequest): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val capabilityModule = requireConsoleModule(module)
        val mutation = mutations.execute(actor, csrf) {
            capabilities.removeKill(actor, capabilityModule, id, request.reason, request.correlationId)
            mapOf("id" to id, "removed" to true)
        }
        return ResponseEntity.ok().header(RequestAuth.CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok(mutation.value))
    }

    @PostMapping("/{module}/kills/{id}/replace")
    fun replaceKill(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable module: String, @PathVariable id: Long, @Valid @RequestBody request: KillRequest): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val capabilityModule = requireConsoleModule(module)
        val mutation = mutations.execute(actor, csrf) {
            capabilities.replaceKill(actor, capabilityModule, id, request.owner, request.reason, Instant.parse(request.expiresAt), request.ticket, request.correlationId)
        }
        return ResponseEntity.ok().header(RequestAuth.CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok(mapOf("id" to mutation.value)))
    }
}

data class CapabilityStateRequest(@field:NotBlank val state: String, val expectedConfigVersion: Int? = null, val reason: String = "ADMIN_STATE_CHANGE", val correlationId: UUID? = null)
data class KillRequest(@field:NotBlank val action: String, @field:NotBlank val owner: String, @field:NotBlank val reason: String, @field:NotBlank val expiresAt: String, @field:NotBlank val ticket: String, val correlationId: UUID)
data class KillCloseRequest(@field:NotBlank val reason: String, val correlationId: UUID)

internal fun consoleCapabilityPayload(capabilities: List<CapabilityModuleView>): List<Map<String, Any?>> =
    capabilities
        .filter { it.module.visibleOnConsole }
        .map(::capabilityPayload)

internal fun capabilityPayload(capability: CapabilityModuleView): Map<String, Any?> =
    mapOf(
        "module" to capability.module.wire,
        "state" to capability.state.wire,
        "configVersion" to capability.configVersion,
    )

internal fun requireConsoleModule(module: String): InstallationCapabilityModule =
    InstallationCapabilityModule.fromWire(module).takeIf { it.visibleOnConsole }
        ?: throw CapabilityConfigurationMissing()

internal fun requireCapabilityState(state: String): CapabilityState =
    CapabilityState.fromWire(state).takeIf { it.isKnown }
        ?: throw CapabilityConfigInvalid()
