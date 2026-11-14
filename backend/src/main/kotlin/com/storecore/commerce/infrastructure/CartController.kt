package com.storecore.commerce.infrastructure

import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.commerce.domain.PaymentCurrency
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID
import javax.sql.DataSource

@RestController
@RequestMapping("/api/v1/customer")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class CartController(private val carts: JdbcCartService, private val auth: RequestAuth, private val mutations: IdentityMutationCoordinator) {
    @GetMapping("/cart") fun cart(http: HttpServletRequest) = BaseResponse.ok(carts.read(auth.customer(http)))

    @PutMapping("/cart/items")
    fun putItem(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @Valid @RequestBody request: CartItemRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val customer = auth.customer(http)
        return csrfOk(mutations.execute(customer, csrf) { carts.putItem(customer, request.sku, request.quantity) })
    }

    @PostMapping("/checkout")
    fun checkout(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @Valid @RequestBody request: CheckoutRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val customer = auth.customer(http)
        return csrfOk(mutations.execute(customer, csrf) { carts.checkout(customer, UUID.fromString(request.idempotencyKey), request.addressId?.toLongOrNull()?.takeIf { it>0 } ?: if(request.addressId==null) null else throw com.storecore.commerce.application.CommerceValidation("DELIVERY_SELECTION_INVALID"), PaymentCurrency.fromWire(request.currency),com.storecore.commerce.domain.DeliveryMode.fromWire(request.deliveryMode),request.deliveryConfigurationVersion.takeIf { it.isIntegralNumber && it.canConvertToInt() }?.intValue() ?: throw com.storecore.commerce.application.CommerceValidation("DELIVERY_SELECTION_INVALID"),request.cartRevision,request.addressRevision?.let { runCatching { java.time.Instant.parse(it) }.getOrElse { throw com.storecore.commerce.application.CommerceValidation("DELIVERY_SELECTION_INVALID") } }) })
    }
}

data class CartItemRequest(@field:NotBlank val sku: String, val quantity: Int)
data class CheckoutRequest(@field:NotBlank val idempotencyKey: String, val addressId: String? = null, @field:NotBlank val currency: String, val deliveryMode:String? = null, val deliveryConfigurationVersion:com.fasterxml.jackson.databind.JsonNode = com.fasterxml.jackson.databind.node.MissingNode.getInstance(), @field:NotBlank val cartRevision:String, val addressRevision:String? = null)
