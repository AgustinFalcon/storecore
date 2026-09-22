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
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.math.BigDecimal
import java.time.Instant
import javax.sql.DataSource

@RestController
@RequestMapping("/api/v1/user/promos")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class PromoController(private val promos: JdbcPromoService, private val auth: RequestAuth, private val mutations: IdentityMutationCoordinator) {
    @GetMapping fun list(http: HttpServletRequest) = BaseResponse.ok(promos.list(auth.admin(http)))

    @PostMapping
    fun save(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @Valid @RequestBody request: PromoRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.admin(http)
        return csrfOk(mutations.execute(actor, csrf) { promos.save(actor, request.listingSku, request.currency, Instant.parse(request.validFrom), Instant.parse(request.validTo), request.priority, request.margin, request.approvedBy, request.approvedAt?.let(Instant::parse), request.writer) })
    }
}

data class PromoRequest(val id: String? = null, @field:NotBlank val listingSku: String, @field:NotBlank val currency: String, @field:NotBlank val validFrom: String, @field:NotBlank val validTo: String, val priority: Int = 0, val margin: BigDecimal = BigDecimal.ZERO, val approvedBy: String? = null, val approvedAt: String? = null, val writer: String = "MANUAL")
