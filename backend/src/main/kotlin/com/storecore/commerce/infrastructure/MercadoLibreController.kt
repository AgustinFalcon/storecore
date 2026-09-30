package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.CreateListingMappingCommand
import com.storecore.commerce.application.CreateListingMappingUseCase
import com.storecore.commerce.application.ListingLifecycleCommand
import com.storecore.commerce.application.ListingLifecycleUseCase
import com.storecore.commerce.domain.ListingLifecycleAction
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
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
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class MercadoLibreController(
    private val mercadoLibre: JdbcMercadoLibreService,
    private val createListingMapping: CreateListingMappingUseCase,
    private val listingLifecycle: ListingLifecycleUseCase,
    private val auth: RequestAuth,
    private val mutations: IdentityMutationCoordinator,
) {
    @GetMapping("/api/v1/user/mercadolibre/account") fun account(http: HttpServletRequest) = BaseResponse.ok(mercadoLibre.account(auth.operatorOrAdmin(http)))
    @GetMapping("/api/v1/user/mercadolibre/listings") fun listings(http: HttpServletRequest) = BaseResponse.ok(mercadoLibre.listings(auth.operatorOrAdmin(http)))

    @PutMapping("/api/v1/user/mercadolibre/listings/{listingId}")
    fun save(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable listingId: String, @Valid @RequestBody request: ListingRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.operatorOrAdmin(http)
        return csrfOk(
            mutations.execute(actor, csrf) {
                createListingMapping.execute(
                    actor,
                    CreateListingMappingCommand(request.accountId, listingId, request.variationId, request.sku),
                )
            },
        )
    }

    @PostMapping("/api/v1/user/mercadolibre/listings/{listingId}/activate")
    fun activate(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable listingId: String, @Valid @RequestBody request: ListingLifecycleRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.operatorOrAdmin(http)
        return csrfOk(mutations.execute(actor, csrf) {
            listingLifecycle.execute(actor, ListingLifecycleCommand(request.accountId, listingId, request.variationId, ListingLifecycleAction.Activate))
            mercadoLibre.listings(actor)
        })
    }

    @PostMapping("/api/v1/user/mercadolibre/listings/{listingId}/pause")
    fun pause(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable listingId: String, @Valid @RequestBody request: ListingLifecycleRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.operatorOrAdmin(http)
        return csrfOk(mutations.execute(actor, csrf) {
            listingLifecycle.execute(actor, ListingLifecycleCommand(request.accountId, listingId, request.variationId, ListingLifecycleAction.Pause))
            mercadoLibre.listings(actor)
        })
    }

    @PostMapping("/api/v1/user/mercadolibre/listings/{listingId}/confirm-mapping")
    fun confirmMapping(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable listingId: String, @Valid @RequestBody request: ListingLifecycleRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.operatorOrAdmin(http)
        return csrfOk(mutations.execute(actor, csrf) {
            listingLifecycle.execute(actor, ListingLifecycleCommand(request.accountId, listingId, request.variationId, ListingLifecycleAction.ConfirmMapping))
            mercadoLibre.listings(actor)
        })
    }

    @PostMapping("/api/v1/integrations/mercadolibre/notifications")
    fun notify(http: HttpServletRequest, @RequestParam(required = false) topic: String?, @RequestParam(required = false) resource: String?, @RequestHeader(value = "x-signature", required = false) signature: String?, @RequestBody(required = false) body: Map<String, Any?>?) =
        BaseResponse.ok(mercadoLibre.notify(http.remoteAddr, topic, resource, body, signature))
}

data class ListingLifecycleRequest(
    @field:NotNull val accountId: Long? = null,
    val variationId: String = "",
)

data class ListingRequest(
    val listingId: String = "",
    val variationId: String = "",
    @field:NotBlank val sku: String,
    @field:NotNull val accountId: Long? = null,
)
