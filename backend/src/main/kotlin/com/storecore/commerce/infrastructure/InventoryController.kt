package com.storecore.commerce.infrastructure

import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/user/inventory")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class InventoryController(
    private val inventory: JdbcInventoryService,
    private val auth: RequestAuth,
    private val mutations: IdentityMutationCoordinator,
    private val capabilities: CapabilityDecisionPort,
) {
    @GetMapping
    fun list(http: HttpServletRequest): BaseResponse<Any?> {
        val actor = auth.operatorOrAdmin(http)
        capabilities.decide("MANUAL_FULFILLMENT", "READ", CapabilityActor.Internal(actor))
        return BaseResponse.ok(inventory.list())
    }

    @PostMapping("/adjust")
    fun adjust(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @Valid @RequestBody request: InventoryAdjustRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http)
        val actor = auth.operatorOrAdmin(http)
        return csrfOk(mutations.execute(actor, csrf) {
            capabilities.decide("MANUAL_FULFILLMENT", "MANAGE", CapabilityActor.Internal(actor))
            inventory.setAvailableQuantity(inventory.variantIdBySku(request.sku), request.availableQuantity, "USER:${actor.userId}", request.reason)
        })
    }
}

data class InventoryAdjustRequest(
    @field:NotBlank val sku: String,
    @field:Min(0) val availableQuantity: Int,
    @field:NotBlank @field:Size(max = 500) val reason: String,
)
