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
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import javax.sql.DataSource

@RestController
@RequestMapping("/api/v1")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class OrderController(private val orders: JdbcOrderService, private val auth: RequestAuth, private val mutations: IdentityMutationCoordinator) {
    @GetMapping("/customer/orders") fun mine(http: HttpServletRequest) = BaseResponse.ok(orders.customerOrders(auth.customer(http)).map { it.copy(rmaStatus = null) })
    @GetMapping("/customer/orders/{id}") fun mineOne(http: HttpServletRequest, @PathVariable id: Long) = BaseResponse.ok(orders.customerOrder(auth.customer(http), id).copy(rmaStatus = null))
    @GetMapping("/user/orders") fun admin(http: HttpServletRequest): BaseResponse<Any?> { auth.operatorOrAdmin(http); return BaseResponse.ok(orders.adminOrders()) }
    @GetMapping("/user/orders/{id}") fun adminOne(http: HttpServletRequest, @PathVariable id: Long): BaseResponse<Any?> { auth.operatorOrAdmin(http); return BaseResponse.ok(orders.adminOrder(id)) }

    @PostMapping("/user/orders/{id}/shipments")
    fun ship(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable id: Long, @Valid @RequestBody request: ShipmentRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.operatorOrAdmin(http)
        return csrfOk(mutations.execute(actor, csrf) { orders.ship(actor, id, request.status, request.tracking) })
    }

    @PostMapping("/user/orders/{id}/rma")
    fun rma(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable id: Long, @Valid @RequestBody request: RmaRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.operatorOrAdmin(http)
        return csrfOk(mutations.execute(actor, csrf) { orders.rma(actor, id, request.status) })
    }
}

data class ShipmentRequest(@field:NotBlank val status: String, val tracking: String? = null)
data class RmaRequest(@field:NotBlank val status: String)
