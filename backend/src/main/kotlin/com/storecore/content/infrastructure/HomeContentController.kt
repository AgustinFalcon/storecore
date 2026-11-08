package com.storecore.content.infrastructure

import com.fasterxml.jackson.databind.JsonNode
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.content.application.*
import com.storecore.content.domain.HomeCompositionView
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.time.Instant

data class ReplaceHomeContentRequest(val expectedRevision: Long, val sections: List<ReplaceHomeSectionRequest>)
data class ReplaceHomeSectionRequest(val key: String, val kind: String, val active: Boolean, val sortOrder: Int, val content: JsonNode)
data class HomeCompositionResponse(val revision: Long, val sections: List<HomeSectionResponse>)
data class HomeSectionResponse(val key: String, val kind: String, val active: Boolean, val sortOrder: Int, val content: Any, val updatedAt: Instant)

@RestController
@RequestMapping("/api/v1")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class HomeContentController(
    private val content: HomeContentUseCases,
    private val wire: HomeContentWireMapper,
    private val auth: RequestAuth,
    private val capabilities: CapabilityDecisionPort,
    private val mutations: IdentityMutationCoordinator,
) {
    @GetMapping("/content/home")
    fun publicHome(): ResponseEntity<BaseResponse<HomeCompositionResponse>> {
        capabilities.decide("STOREFRONT", "SERVE", CapabilityActor.Public)
        return ResponseEntity.ok(BaseResponse.ok(response(content.publicComposition())))
    }

    @GetMapping("/user/content/home")
    fun adminHome(http: HttpServletRequest): ResponseEntity<BaseResponse<HomeCompositionResponse>> {
        val actor = auth.admin(http)
        capabilities.decide("CATALOG", "READ", CapabilityActor.Internal(actor))
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(BaseResponse.ok(response(content.adminComposition())))
    }

    @PutMapping("/user/content/home")
    fun replace(
        http: HttpServletRequest,
        @RequestHeader(RequestAuth.CSRF_HEADER) csrf: String,
        @RequestBody request: ReplaceHomeContentRequest,
    ): ResponseEntity<BaseResponse<HomeCompositionResponse>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val sections = request.sections.map { wire.request(it.key, it.kind, it.active, it.sortOrder, it.content) }
        val mutation = mutations.execute(actor, csrf) {
            capabilities.decide("CATALOG", "MANAGE", CapabilityActor.Internal(actor))
            content.replace(actor, request.expectedRevision, sections)
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .header(RequestAuth.CSRF_HEADER, mutation.nextCsrf)
            .body(BaseResponse.ok(response(mutation.value)))
    }

    private fun response(composition: HomeCompositionView) = HomeCompositionResponse(
        composition.revision,
        composition.sections.map { HomeSectionResponse(it.key, it.kind.wire, it.active, it.sortOrder, wire.wireContent(it.content), it.updatedAt) },
    )
}

@RestControllerAdvice(assignableTypes = [HomeContentController::class])
class HomeContentExceptionAdvice {
    @ExceptionHandler(HomeContentInvalid::class)
    fun invalid() = error(HttpStatus.BAD_REQUEST, "HOME_CONTENT_INVALID")

    @ExceptionHandler(HomeContentReferenceNotFound::class)
    fun missingReference() = error(HttpStatus.BAD_REQUEST, "HOME_CONTENT_REFERENCE_NOT_FOUND")

    @ExceptionHandler(HomeContentRevisionConflict::class)
    fun revisionConflict() = error(HttpStatus.CONFLICT, "HOME_CONTENT_REVISION_CONFLICT")

    private fun error(status: HttpStatus, code: String) = ResponseEntity.status(status).cacheControl(CacheControl.noStore())
        .body(BaseResponse<Nothing>(status.value(), null, "Request rejected", code, false, null))
}
