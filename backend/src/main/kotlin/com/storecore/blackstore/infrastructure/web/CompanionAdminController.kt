package com.storecore.blackstore.infrastructure.web

import com.storecore.blackstore.application.CompanionAdminCommandService
import com.storecore.blackstore.application.CompanionAdminCorrelationRequired
import com.storecore.blackstore.application.CompanionAdminView
import com.storecore.blackstore.domain.CompanionAdminCommand
import com.storecore.blackstore.domain.CompanionAdminOperation
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.CompanionScope
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.RequestAuth
import com.storecore.shared.http.HttpCode
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
import jakarta.validation.constraints.NotNull
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/v1/internal/admin/blackstore-companion")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class CompanionAdminController(
    private val adminCommands: CompanionAdminCommandService,
    private val auth: RequestAuth,
) {
    @PostMapping("/pair")
    fun pair(
        http: HttpServletRequest,
        @RequestHeader("X-CSRF-Token") csrf: String,
        @Valid @RequestBody request: CompanionPairRequest,
    ): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val mutation = adminCommands.pair(
            actor,
            csrf,
            CompanionAdminCommand.Pair(requireCorrelation(request.correlationId), request.clientInstanceId, scopes(request.scopes), request.reason),
        )
        return respond(HttpCode.Ok, publicView(mutation.value), mutation.nextCsrf)
    }

    @PostMapping("/rotate")
    fun rotate(
        http: HttpServletRequest,
        @RequestHeader("X-CSRF-Token") csrf: String,
        @Valid @RequestBody request: CompanionStateRequest,
    ): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val mutation = adminCommands.rotate(
            actor,
            csrf,
            CompanionAdminCommand.Rotate(
                requireCorrelation(request.correlationId),
                request.companionId,
                state(request.expectedState),
                request.expectedCredentialVersion,
                scopes(request.scopes ?: emptyList()),
                request.reason,
            ),
        )
        return respond(HttpCode.Ok, publicView(mutation.value), mutation.nextCsrf)
    }

    @PostMapping("/activate")
    fun activate(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @Valid @RequestBody request: CompanionStateRequest) =
        applyState(http, csrf, request, CompanionAdminOperation.Activate)

    @PostMapping("/suspend")
    fun suspend(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @Valid @RequestBody request: CompanionStateRequest) =
        applyState(http, csrf, request, CompanionAdminOperation.Suspend)

    @PostMapping("/revoke")
    fun revoke(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @Valid @RequestBody request: CompanionStateRequest) =
        applyState(http, csrf, request, CompanionAdminOperation.Revoke)

    @GetMapping("/commands/{correlationId}")
    fun commandStatus(http: HttpServletRequest, @PathVariable correlationId: UUID): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        return respond(HttpCode.Ok, publicView(adminCommands.status(actor, correlationId)))
    }

    private fun applyState(
        http: HttpServletRequest,
        csrf: String,
        request: CompanionStateRequest,
        operation: CompanionAdminOperation,
    ): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val mutation = adminCommands.applyState(
            actor,
            csrf,
            CompanionAdminCommand.ApplyState(
                requireCorrelation(request.correlationId),
                operation,
                request.companionId,
                state(request.expectedState),
                request.expectedCredentialVersion,
                request.reason,
            ),
        )
        return respond(HttpCode.Ok, publicView(mutation.value), mutation.nextCsrf)
    }

    private fun publicView(view: CompanionAdminView): Map<String, Any?> {
        val payload = linkedMapOf<String, Any?>(
            "companionId" to view.companionId,
            "status" to view.status?.wire,
            "credentialVersion" to view.credentialVersion,
            "commandState" to view.commandState,
            "operation" to view.operation,
        )
        if (!view.bearer.isNullOrBlank()) payload["bearer"] = view.bearer
        return payload
    }

    private fun scopes(raw: List<String>): List<CompanionScope> = raw.map { CompanionScope.fromWire(it) }

    private fun state(raw: String): CompanionLifecycleStatus = CompanionLifecycleStatus.fromWire(raw)

    private fun requireCorrelation(correlation: UUID?): UUID = correlation ?: throw CompanionAdminCorrelationRequired()

    private fun respond(code: HttpCode, data: Map<String, Any?>, csrf: String? = null): ResponseEntity<BaseResponse<Map<String, Any?>>> {
        val headers = HttpHeaders()
        csrf?.let { headers.add(RequestAuth.CSRF_HEADER, it) }
        val body = BaseResponse.ok(data, code)
        return ResponseEntity.status(body.code).headers(headers).body(body)
    }
}

data class CompanionPairRequest(
    @field:NotNull val clientInstanceId: UUID,
    @field:NotEmpty val scopes: List<String>,
    @field:NotBlank val reason: String,
    @field:NotNull val correlationId: UUID,
)

data class CompanionStateRequest(
    @field:NotNull val companionId: Long,
    @field:NotBlank val expectedState: String,
    @field:NotNull val expectedCredentialVersion: Int,
    val scopes: List<String>? = null,
    @field:NotBlank val reason: String,
    @field:NotNull val correlationId: UUID,
)
