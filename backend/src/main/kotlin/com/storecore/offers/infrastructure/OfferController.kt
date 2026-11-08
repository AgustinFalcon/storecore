package com.storecore.offers.infrastructure

import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import com.storecore.identity.infrastructure.web.RequestAuth
import com.storecore.offers.application.OfferCostBasisUnavailable
import com.storecore.offers.application.OfferNotFound
import com.storecore.offers.application.OfferTransitionInvalid
import com.storecore.offers.application.OfferUseCases
import com.storecore.offers.application.OfferValidationFailed
import com.storecore.offers.domain.DiscountKind
import com.storecore.offers.domain.OfferDraft
import com.storecore.offers.domain.OfferTransition
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.math.BigDecimal
import java.time.Instant

data class CreateOfferRequest(
    val name: String,
    val priority: Int,
    val startsAt: Instant,
    val endsAt: Instant,
    val discountKind: String,
    val discountValue: BigDecimal,
    val minMarginPercent: BigDecimal,
    val skus: List<String>,
)

data class TransitionOfferRequest(val transition: String)

@RestController
@RequestMapping("/api/v1/user/offers")
class OfferController(
    private val offers: OfferUseCases,
    private val auth: RequestAuth,
    private val capabilities: CapabilityDecisionPort,
    private val mutations: IdentityMutationCoordinator,
) {
    @GetMapping
    fun list(http: HttpServletRequest): ResponseEntity<BaseResponse<Any?>> {
        val actor = auth.admin(http)
        capabilities.decide(MODULE, READ, CapabilityActor.Internal(actor))
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(BaseResponse.ok<Any?>(offers.list()))
    }

    @PostMapping
    fun create(
        http: HttpServletRequest,
        @RequestHeader("X-CSRF-Token") csrf: String,
        @RequestBody request: CreateOfferRequest,
    ): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val draft = OfferDraft(
            request.name, request.priority, request.startsAt, request.endsAt,
            DiscountKind.fromWire(request.discountKind), request.discountValue, request.minMarginPercent, request.skus,
        )
        val mutation = mutations.execute(actor, csrf) {
            capabilities.decide(MODULE, WRITE, CapabilityActor.Internal(actor))
            offers.create(actor, draft)
        }
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
            .header(RequestAuth.CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok<Any?>(mutation.value))
    }

    @PostMapping("/{id}/state")
    fun transition(
        http: HttpServletRequest,
        @RequestHeader("X-CSRF-Token") csrf: String,
        @PathVariable id: Long,
        @RequestBody request: TransitionOfferRequest,
    ): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val command = OfferTransition.fromWire(request.transition)
        val mutation = mutations.execute(actor, csrf) {
            capabilities.decide(MODULE, WRITE, CapabilityActor.Internal(actor))
            offers.transition(actor, id, command)
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .header(RequestAuth.CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok<Any?>(mutation.value))
    }

    private companion object {
        const val MODULE = "MANUAL_PROMOTIONS"
        const val READ = "READ"
        const val WRITE = "WRITE_PRICE"
    }
}

@RestControllerAdvice(assignableTypes = [OfferController::class])
class OfferExceptionAdvice {
    @ExceptionHandler(OfferValidationFailed::class)
    fun invalid() = error(HttpStatus.BAD_REQUEST, "OFFER_VALIDATION_FAILED")

    @ExceptionHandler(OfferCostBasisUnavailable::class)
    fun costBasis() = error(HttpStatus.CONFLICT, "COST_BASIS_UNAVAILABLE")

    @ExceptionHandler(OfferTransitionInvalid::class)
    fun transition() = error(HttpStatus.CONFLICT, "OFFER_TRANSITION_INVALID")

    @ExceptionHandler(OfferNotFound::class)
    fun notFound() = error(HttpStatus.NOT_FOUND, "OFFER_NOT_FOUND")

    private fun error(status: HttpStatus, code: String) = ResponseEntity.status(status).cacheControl(CacheControl.noStore())
        .body(BaseResponse<Nothing>(status.value(), null, "Request rejected", code, false, null))
}
