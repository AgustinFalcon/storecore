package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.annotation.JsonAnySetter
import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.domain.*
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.math.BigDecimal
import java.time.Instant

@RestController
@RequestMapping("/api/v1/user/promos")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class PromoController(private val promos: JdbcPromoService, private val auth: RequestAuth, private val mutations: IdentityMutationCoordinator) {
    @GetMapping fun list(http: HttpServletRequest, @RequestParam(defaultValue = "0") page: Int, @RequestParam(defaultValue = "25") size: Int) =
        BaseResponse.ok(promos.list(auth.admin(http), page, size))

    @PostMapping
    fun save(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @Valid @RequestBody request: PromoRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.admin(http)
        return csrfOk(mutations.execute(actor, csrf) { promos.save(actor, request.listingSku, PriceCurrency.fromWire(request.currency),
            PriceScope.fromWire(request.priceScope), request.desiredPrice, request.effectivePromoPrice, parseInstant(request.validFrom), parseInstant(request.validTo), PriceWriter.fromWire(request.writer)) })
    }
    @PostMapping("/{id}/state")
    fun transition(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable id: Long,
        @RequestBody request: PricePolicyTransitionRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.admin(http)
        return csrfOk(mutations.execute(actor, csrf) { promos.transition(actor, id, PricePolicyTransition.fromWire(request.transition)) })
    }
    private fun parseInstant(raw: String): Instant = try { Instant.parse(raw) } catch (_: java.time.format.DateTimeParseException) { throw CommerceValidation("PRICE_POLICY_WINDOW_INVALID") }
}

data class PromoRequest(@field:NotBlank val listingSku: String, @field:NotBlank val currency: String, val priceScope: String = "DEFAULT",
    val desiredPrice: BigDecimal, val effectivePromoPrice: BigDecimal? = null, @field:NotBlank val validFrom: String,
    @field:NotBlank val validTo: String, val writer: String = "MANUAL") {
    @JsonAnySetter fun rejectUnsupported(name: String, value: Any?) { throw CommerceValidation("PRICE_POLICY_UNSUPPORTED_FIELD") }
}
data class PricePolicyTransitionRequest(val transition: String? = null) {
    @JsonAnySetter fun rejectUnsupported(name: String, value: Any?) { throw CommerceValidation("PRICE_POLICY_UNSUPPORTED_FIELD") }
}
