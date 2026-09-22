package com.storecore.commerce.infrastructure

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
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import javax.sql.DataSource

@RestController
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class MercadoLibreController(private val mercadoLibre: JdbcMercadoLibreService, private val auth: RequestAuth, private val mutations: IdentityMutationCoordinator) {
    @GetMapping("/api/v1/user/mercadolibre/account") fun account(http: HttpServletRequest) = BaseResponse.ok(mercadoLibre.account(auth.operatorOrAdmin(http)))
    @GetMapping("/api/v1/user/mercadolibre/listings") fun listings(http: HttpServletRequest) = BaseResponse.ok(mercadoLibre.listings(auth.operatorOrAdmin(http)))

    @PutMapping("/api/v1/user/mercadolibre/listings/{listingId}")
    fun save(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable listingId: String, @Valid @RequestBody request: ListingRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.operatorOrAdmin(http)
        return csrfOk(mutations.execute(actor, csrf) { mercadoLibre.saveListing(actor, listingId, request.variationId, request.sku) })
    }

    @PostMapping("/api/v1/integrations/mercadolibre/notifications")
    fun notify(@RequestParam(required = false) topic: String?, @RequestParam(required = false) resource: String?, @RequestHeader(value = "x-signature", required = false) signature: String?, @RequestBody(required = false) body: Map<String, Any?>?) =
        BaseResponse.ok(mercadoLibre.notify(topic, resource, body, signature))
}

data class ListingRequest(val listingId: String = "", val variationId: String = "", @field:NotBlank val sku: String)
