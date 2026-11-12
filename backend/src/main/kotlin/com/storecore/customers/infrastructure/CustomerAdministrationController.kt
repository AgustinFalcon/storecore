package com.storecore.customers.infrastructure

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import com.storecore.customers.application.CustomerAdministrationUseCases
import com.storecore.customers.application.CustomerNotFound
import com.storecore.customers.application.CustomerSearchInvalid
import com.storecore.customers.application.CustomerStateInvalid
import com.storecore.customers.domain.CustomerAccountState
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.CacheControl
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

data class ChangeCustomerStateRequest(val state: String)

@RestController
@RequestMapping("/api/v1/user/customers")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class CustomerAdministrationController(
    private val customers: CustomerAdministrationUseCases,
    private val auth: RequestAuth,
    private val mutations: IdentityMutationCoordinator,
) {
    @GetMapping
    fun search(
        http: HttpServletRequest,
        @RequestParam(required = false) query: String?,
        @RequestParam(required = false) state: String?,
        @RequestParam(required = false) page: Int?,
    ): ResponseEntity<BaseResponse<Any?>> {
        auth.operatorOrAdmin(http)
        val stateType = state?.let(CustomerAccountState::fromWire)
        return ok(customers.search(query, stateType, page))
    }

    @GetMapping("/{id}")
    fun find(http: HttpServletRequest, @PathVariable id: Long): ResponseEntity<BaseResponse<Any?>> {
        auth.operatorOrAdmin(http)
        return ok(customers.find(id))
    }

    @PostMapping("/{id}/state")
    fun changeState(
        http: HttpServletRequest,
        @RequestHeader("X-CSRF-Token") csrf: String,
        @PathVariable id: Long,
        @RequestBody request: ChangeCustomerStateRequest,
    ): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val target = CustomerAccountState.fromWire(request.state)
        val mutation = mutations.executeForCustomer(actor, csrf, id) { customers.changeState(actor, id, target) }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header(RequestAuth.CSRF_HEADER, mutation.nextCsrf)
            .body(BaseResponse.ok<Any?>(mutation.value))
    }

    private fun ok(data: Any): ResponseEntity<BaseResponse<Any?>> =
        ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(BaseResponse.ok<Any?>(data))
}

@RestControllerAdvice(assignableTypes = [CustomerAdministrationController::class])
class CustomerAdministrationExceptionAdvice {
    @ExceptionHandler(CustomerSearchInvalid::class)
    fun invalidSearch() = error(HttpStatus.BAD_REQUEST, "CUSTOMER_SEARCH_INVALID")

    @ExceptionHandler(CustomerStateInvalid::class)
    fun invalidState() = error(HttpStatus.BAD_REQUEST, "CUSTOMER_STATE_INVALID")

    @ExceptionHandler(CustomerNotFound::class)
    fun notFound() = error(HttpStatus.NOT_FOUND, "CUSTOMER_NOT_FOUND")

    private fun error(status: HttpStatus, code: String) = ResponseEntity.status(status).cacheControl(CacheControl.noStore())
        .body(BaseResponse<Nothing>(status.value(), null, "Request rejected", code, false, null))
}
