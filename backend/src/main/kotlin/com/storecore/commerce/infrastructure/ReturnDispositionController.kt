package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.domain.*
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.UUID

data class ReturnDispositionLineRequest(val returnItemId: String? = null, val restockQuantity: Int? = null, val damagedQuantity: Int? = null, val rejectedQuantity: Int? = null, val damageReason: String? = null, val rejectionReason: String? = null, val observation: String? = null) {
    fun toDomain(): ReturnDispositionLine {
        val item = returnItemId?.toLongOrNull()?.takeIf { it > 0 } ?: throw CommerceValidation("RMA_INVALID_ITEM_ID")
        return ReturnDispositionLine(item, DispositionQuantities(restockQuantity ?: throw CommerceValidation("RMA_INVALID_PARTITION"), damagedQuantity ?: throw CommerceValidation("RMA_INVALID_PARTITION"), rejectedQuantity ?: throw CommerceValidation("RMA_INVALID_PARTITION")), damageReason?.let(DamageReason::fromWire), rejectionReason?.let(RejectionReason::fromWire), observation?.trim()?.takeIf { it.isNotEmpty() })
    }
}
data class ReturnDispositionRequest(val idempotencyKey: UUID? = null, val lines: List<ReturnDispositionLineRequest>? = null) {
    fun toDomain() = ReturnDispositionCommand(idempotencyKey ?: throw CommerceValidation("RMA_IDEMPOTENCY_KEY_REQUIRED"), lines?.takeIf { it.isNotEmpty() && it.size <= 500 }?.map { it.toDomain() } ?: throw CommerceValidation("RMA_ITEM_SET_MISMATCH"))
}

@RestController
@RequestMapping("/api/v1/user/orders/{orderId}/return-disposition")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class ReturnDispositionController(private val service: JdbcReturnDispositionService, private val auth: RequestAuth, private val mutations: IdentityMutationCoordinator) {
    @GetMapping
    fun read(http: HttpServletRequest, @PathVariable orderId: Long): ResponseEntity<BaseResponse<Any?>> = ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(BaseResponse.ok(service.read(auth.operatorOrAdmin(http), orderId)))
    @PostMapping
    fun confirm(http: HttpServletRequest, @PathVariable orderId: Long, @RequestHeader("X-CSRF-Token") csrf: String, @RequestBody request: ReturnDispositionRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http)
        val actor = auth.operatorOrAdmin(http)
        return csrfOk(mutations.execute(actor, csrf) { service.confirm(actor, orderId, request.toDomain()) })
    }
}
