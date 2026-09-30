package com.storecore.configuration.infrastructure.web

import com.storecore.configuration.application.CapabilityAdminCommandService
import com.storecore.configuration.application.CapabilityAdministrationPort
import com.storecore.configuration.application.CapabilityCorrelationRequired
import com.storecore.configuration.domain.CapabilityAdminCommand
import com.storecore.configuration.domain.CapabilityState
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
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

@RestController
@RequestMapping("/api/v1/user/capabilities")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class CapabilityController(
    private val capabilities: CapabilityAdministrationPort,
    private val adminCommands: CapabilityAdminCommandService,
    private val auth: RequestAuth,
) {
    @GetMapping
    fun list(http: HttpServletRequest): BaseResponse<List<Map<String, Any?>>> {
        auth.operatorOrAdmin(http)
        return BaseResponse.ok(capabilities.list().map { mapOf("module" to it.module, "state" to it.state.name, "configVersion" to it.configVersion) })
    }

    @PostMapping("/{module}/state")
    fun changeState(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable module: String, @Valid @RequestBody request: CapabilityStateRequest): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val mutation = adminCommands.changeState(
            actor,
            csrf,
            CapabilityAdminCommand.ChangeState(request.correlationId, module, request.expectedConfigVersion ?: 0, CapabilityState.valueOf(request.state), request.reason),
        )
        return ResponseEntity.ok().header(RequestAuth.CSRF_HEADER, mutation.nextCsrf)
            .body(BaseResponse.ok(mapOf("module" to mutation.value.module, "state" to mutation.value.state.name, "configVersion" to mutation.value.configVersion)))
    }

    @PostMapping("/{module}/kills")
    fun createKill(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable module: String, @Valid @RequestBody request: KillRequest): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val mutation = adminCommands.createKill(
            actor,
            csrf,
            CapabilityAdminCommand.KillCreate(request.correlationId, module, request.action, request.owner, request.reason, Instant.parse(request.expiresAt), request.ticket),
        )
        return ResponseEntity.ok().header(RequestAuth.CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok(mapOf("id" to mutation.value)))
    }

    @PostMapping("/{module}/kills/{id}/remove")
    fun removeKill(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable module: String, @PathVariable id: Long, @Valid @RequestBody request: KillCloseRequest): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val mutation = adminCommands.removeKill(actor, csrf, CapabilityAdminCommand.KillRemove(request.correlationId, module, id, request.reason))
        return ResponseEntity.ok().header(RequestAuth.CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok(mutation.value))
    }

    @PostMapping("/{module}/kills/{id}/replace")
    fun replaceKill(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable module: String, @PathVariable id: Long, @Valid @RequestBody request: KillRequest): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val mutation = adminCommands.replaceKill(
            actor,
            csrf,
            CapabilityAdminCommand.KillReplace(request.correlationId, module, id, request.owner, request.reason, Instant.parse(request.expiresAt), request.ticket),
        )
        return ResponseEntity.ok().header(RequestAuth.CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok(mapOf("id" to mutation.value)))
    }

    @GetMapping("/commands/{correlationId}")
    fun commandStatus(http: HttpServletRequest, @PathVariable correlationId: UUID): BaseResponse<Map<String, Any?>> {
        val actor = auth.admin(http)
        val result = adminCommands.status(actor, correlationId)
        return BaseResponse.ok(mapOf("correlationId" to correlationId, "result" to result))
    }

    @PostMapping("/commands/{correlationId}/abort")
    fun abortCommand(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable correlationId: UUID): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val mutation = adminCommands.abort(actor, csrf, correlationId)
        return ResponseEntity.ok().header(RequestAuth.CSRF_HEADER, mutation.nextCsrf)
            .body(BaseResponse.ok(mapOf("correlationId" to correlationId, "result" to mutation.value)))
    }
}

data class CapabilityStateRequest(
    @field:NotBlank val state: String,
    val expectedConfigVersion: Int? = null,
    val reason: String = "ADMIN_STATE_CHANGE",
    @field:NotNull val correlationId: UUID,
)
data class KillRequest(
    @field:NotBlank val action: String,
    @field:NotBlank val owner: String,
    @field:NotBlank val reason: String,
    @field:NotBlank val expiresAt: String,
    @field:NotBlank val ticket: String,
    @field:NotNull val correlationId: UUID,
)
data class KillCloseRequest(@field:NotBlank val reason: String, @field:NotNull val correlationId: UUID)
