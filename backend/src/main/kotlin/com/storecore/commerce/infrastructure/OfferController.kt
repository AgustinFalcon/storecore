package com.storecore.commerce.infrastructure

import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotEmpty
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
import java.math.BigDecimal

@RestController
@RequestMapping("/api/v1/user/offers")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class OfferController(
    private val offers: JdbcOfferService,
    private val auth: RequestAuth,
    private val mutations: IdentityMutationCoordinator,
) {
    @GetMapping
    fun list(http: HttpServletRequest): BaseResponse<Any?> {
        val actor = auth.operatorOrAdmin(http)
        return BaseResponse.ok(offers.list(actor))
    }

    @PostMapping
    fun save(
        http: HttpServletRequest,
        @RequestHeader("X-CSRF-Token") csrf: String,
        @Valid @RequestBody request: OfferRequest,
    ): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http)
        val actor = auth.operatorOrAdmin(http)
        val mutation = mutations.execute(actor, csrf) {
            offers.save(
                actor,
                OfferWrite(
                    request.name,
                    request.status,
                    request.priority,
                    request.startsAt,
                    request.endsAt,
                    request.discountType,
                    request.discountValue,
                    request.minMarginPercent,
                    request.skus,
                ),
            )
        }
        return csrfOk(mutation)
    }

    @PostMapping("/{id}/status")
    fun changeStatus(
        http: HttpServletRequest,
        @RequestHeader("X-CSRF-Token") csrf: String,
        @PathVariable id: Long,
        @Valid @RequestBody request: OfferStatusRequest,
    ): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http)
        val actor = auth.operatorOrAdmin(http)
        val mutation = mutations.execute(actor, csrf) { offers.changeStatus(actor, id, request.status) }
        return csrfOk(mutation)
    }
}

data class OfferStatusRequest(
    @field:NotBlank val status: String,
)

data class OfferRequest(
    @field:NotBlank val name: String,
    @field:NotBlank val status: String,
    val priority: Int = 0,
    @field:NotBlank val startsAt: String,
    @field:NotBlank val endsAt: String,
    @field:NotBlank val discountType: String,
    @field:NotNull val discountValue: BigDecimal?,
    @field:NotNull val minMarginPercent: BigDecimal?,
    @field:NotEmpty val skus: List<String> = emptyList(),
)
