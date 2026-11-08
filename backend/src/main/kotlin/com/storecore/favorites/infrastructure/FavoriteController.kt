package com.storecore.favorites.infrastructure

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.favorites.application.FavoriteLimitReached
import com.storecore.favorites.application.FavoriteProductUnavailable
import com.storecore.favorites.application.FavoriteUseCases
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/v1/customer/favorites")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class FavoriteController(private val favorites: FavoriteUseCases, private val auth: RequestAuth, private val capabilities: CapabilityDecisionPort, private val mutations: IdentityMutationCoordinator) {
    @GetMapping fun list(http: HttpServletRequest): ResponseEntity<BaseResponse<Any?>> {
        val customer = auth.customer(http)
        capabilities.decide("FAVORITES", "READ", CapabilityActor.Customer(customer))
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
            .body(BaseResponse.ok<Any?>(favorites.list(customer)))
    }

    @PutMapping("/{sku}")
    fun add(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable sku: String): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http)
        val customer = auth.customer(http)
        capabilities.decide("FAVORITES", "MANAGE", CapabilityActor.Customer(customer))
        val mutation = mutations.execute(customer, csrf) { favorites.add(customer, sku) }
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
            .header(RequestAuth.CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok<Any?>(mutation.value))
    }

    @DeleteMapping("/{sku}")
    fun remove(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable sku: String): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http)
        val customer = auth.customer(http)
        capabilities.decide("FAVORITES", "MANAGE", CapabilityActor.Customer(customer))
        val mutation = mutations.execute(customer, csrf) { favorites.remove(customer, sku) }
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
            .header(RequestAuth.CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok<Any?>(mutation.value))
    }
}

@RestControllerAdvice(assignableTypes = [FavoriteController::class])
class FavoriteExceptionAdvice {
    @ExceptionHandler(FavoriteProductUnavailable::class)
    fun unavailable() = ResponseEntity.status(HttpStatus.NOT_FOUND).cacheControl(org.springframework.http.CacheControl.noStore()).body(BaseResponse<Nothing>(404, null, "Request rejected", "PRODUCT_NOT_AVAILABLE", false, null))
    @ExceptionHandler(FavoriteLimitReached::class)
    fun limit() = ResponseEntity.status(HttpStatus.CONFLICT).cacheControl(org.springframework.http.CacheControl.noStore()).body(BaseResponse<Nothing>(409, null, "Request rejected", "LIMIT_REACHED", false, null))
}
