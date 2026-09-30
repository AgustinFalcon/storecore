package com.storecore.identity.infrastructure.web

import com.storecore.identity.application.IdentityUseCases
import com.storecore.identity.domain.CustomerPrincipal
import com.storecore.identity.domain.IdentityRealm
import com.storecore.identity.domain.InternalUserPrincipal
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseCookie
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.time.Duration
import java.util.UUID

@RestController
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
@RequestMapping("/api/v1")
class IdentityController(
    private val identity: IdentityUseCases,
    private val mutations: IdentityMutationCoordinator,
    private val auth: RequestAuth,
) {
    @PostMapping("/customer/auth/register")
    fun registerCustomer(@Valid @RequestBody request: RegisterRequest): ResponseEntity<BaseResponse<PrincipalView>> {
        val issued = identity.registerCustomer(request.email, request.password, request.firstName, request.lastName)
        return issuedResponse(issued, HttpStatus.CREATED, CustomerView(issued.principal as CustomerPrincipal, request.email, request.firstName, request.lastName))
    }

    @PostMapping("/customer/auth/login")
    fun loginCustomer(http: HttpServletRequest, @Valid @RequestBody request: LoginRequest): ResponseEntity<BaseResponse<PrincipalView>> =
        issuedResponse(identity.login(IdentityRealm.CUSTOMER, request.email, request.password, http.remoteAddr ?: "unknown"), HttpStatus.OK)

    @PostMapping("/internal/auth/login")
    fun loginInternal(http: HttpServletRequest, @Valid @RequestBody request: LoginRequest): ResponseEntity<BaseResponse<PrincipalView>> =
        issuedResponse(identity.login(IdentityRealm.USER, request.email, request.password, http.remoteAddr ?: "unknown"), HttpStatus.OK)

    @GetMapping("/customer/auth/csrf")
    fun customerCsrf(http: HttpServletRequest): ResponseEntity<BaseResponse<Unit>> = csrfResponse(auth.customer(http))

    @GetMapping("/internal/auth/csrf")
    fun internalCsrf(http: HttpServletRequest): ResponseEntity<BaseResponse<Unit>> = csrfResponse(auth.internal(http))

    @PostMapping("/customer/auth/logout")
    fun logoutCustomer(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String): ResponseEntity<Void> = logout(http, csrf, IdentityRealm.CUSTOMER)

    @PostMapping("/internal/auth/logout")
    fun logoutInternal(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String): ResponseEntity<Void> = logout(http, csrf, IdentityRealm.USER)

    @GetMapping("/customer/me")
    fun customerMe(http: HttpServletRequest): ResponseEntity<BaseResponse<PrincipalView>> {
        val principal = auth.customer(http)
        val profile = identity.customerProfile(principal)
        return cachedOk(CustomerView(profile.id, profile.email, profile.firstName, profile.lastName))
    }

    @GetMapping("/internal/me")
    fun internalMe(http: HttpServletRequest): ResponseEntity<BaseResponse<PrincipalView>> = cachedOk(internalView(auth.internal(http)))

    @PutMapping("/customer/me")
    fun updateCustomerMe(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @Valid @RequestBody request: CustomerProfileRequest): ResponseEntity<BaseResponse<CustomerProfileView>> {
        auth.requireSameOrigin(http)
        val principal = auth.customer(http)
        val mutation = mutations.execute(principal, csrf) { identity.updateCustomerProfile(principal, request.email, request.firstName, request.lastName, request.phone) }
        val profile = mutation.value
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).header(CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok(CustomerProfileView(profile.id, profile.email, profile.firstName, profile.lastName, profile.phone)))
    }

    @GetMapping("/customer/me/addresses")
    fun addresses(http: HttpServletRequest): ResponseEntity<BaseResponse<List<AddressView>>> = cachedOk(
        identity.customerAddresses(auth.customer(http)).map { AddressView(it.id, it.street, it.number, it.city, it.province, it.postalCode, it.isDefault) },
    )

    @PostMapping("/customer/me/addresses")
    fun addAddress(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @Valid @RequestBody request: AddressRequest): ResponseEntity<BaseResponse<AddressView>> {
        auth.requireSameOrigin(http)
        val principal = auth.customer(http)
        val mutation = mutations.execute(principal, csrf) { identity.addCustomerAddress(principal, request.street, request.number, request.city, request.province, request.postalCode, request.isDefault) }
        val address = mutation.value
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).header(CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok(AddressView(address.id, address.street, address.number, address.city, address.province, address.postalCode, address.isDefault)))
    }

    @PutMapping("/customer/me/addresses/{addressId}")
    fun updateAddress(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable addressId: Long, @Valid @RequestBody request: AddressRequest): ResponseEntity<BaseResponse<AddressView>> {
        auth.requireSameOrigin(http)
        val principal = auth.customer(http)
        val mutation = mutations.execute(principal, csrf) { identity.updateCustomerAddress(principal, addressId, request.street, request.number, request.city, request.province, request.postalCode, request.isDefault) }
        val address = mutation.value
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).header(CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok(AddressView(address.id, address.street, address.number, address.city, address.province, address.postalCode, address.isDefault)))
    }

    @DeleteMapping("/customer/me/addresses/{addressId}")
    fun deleteAddress(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable addressId: Long): ResponseEntity<BaseResponse<Unit>> {
        auth.requireSameOrigin(http)
        val principal = auth.customer(http)
        val mutation = mutations.execute(principal, csrf) { identity.deleteCustomerAddress(principal, addressId) }
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).header(CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok(Unit))
    }

    @PostMapping("/internal/admin/sessions/{sessionId}/revoke")
    fun revokeSession(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable sessionId: UUID, @Valid @RequestBody request: RevokeRequest): ResponseEntity<BaseResponse<Unit>> {
        auth.requireSameOrigin(http)
        val principal = auth.admin(http)
        val mutation = mutations.execute(principal, csrf) { identity.revokeAsAdmin(principal, sessionId, request.reason, request.correlationId) }
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).header(CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok(Unit))
    }

    private fun csrfResponse(principal: com.storecore.identity.domain.AuthenticatedPrincipal): ResponseEntity<BaseResponse<Unit>> =
        ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).header(CSRF_HEADER, identity.rotateCsrf(principal)).body(BaseResponse.ok(Unit))

    private fun logout(http: HttpServletRequest, csrf: String, realm: IdentityRealm): ResponseEntity<Void> {
        auth.requireSameOrigin(http)
        auth.logoutCandidate(http, realm)?.let { mutations.logout(it, csrf) }
        return ResponseEntity.noContent().cacheControl(org.springframework.http.CacheControl.noStore()).header(HttpHeaders.SET_COOKIE, expiredCookie(realm).toString()).build()
    }

    private fun issuedResponse(issued: com.storecore.identity.domain.IssuedCredentials, status: HttpStatus, explicitCustomer: CustomerView? = null): ResponseEntity<BaseResponse<PrincipalView>> {
        val view: PrincipalView = explicitCustomer ?: when (val principal = issued.principal) {
            is CustomerPrincipal -> customerView(principal)
            is InternalUserPrincipal -> internalView(principal)
        }
        return ResponseEntity.status(status).cacheControl(org.springframework.http.CacheControl.noStore())
            .header(HttpHeaders.SET_COOKIE, sessionCookie(issued.principal.realm, issued.sessionToken).toString())
            .header(CSRF_HEADER, issued.csrfToken).body(BaseResponse.ok(view, status.value()))
    }

    private fun <T> cachedOk(data: T): ResponseEntity<BaseResponse<T>> =
        ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).body(BaseResponse.ok(data))

    private fun customerView(principal: CustomerPrincipal) = CustomerView(principal, null, null, null)
    private fun internalView(principal: InternalUserPrincipal) = InternalView(principal.userId, principal.roles.map { it.name }.sorted())
    private fun sessionCookie(realm: IdentityRealm, token: String): ResponseCookie = ResponseCookie.from(cookieName(realm), token).secure(true).httpOnly(true).sameSite("Lax").path("/").maxAge(Duration.ofHours(12)).build()
    private fun expiredCookie(realm: IdentityRealm): ResponseCookie = ResponseCookie.from(cookieName(realm), "").secure(true).httpOnly(true).sameSite("Lax").path("/").maxAge(Duration.ZERO).build()
    private fun cookieName(realm: IdentityRealm) = if (realm == IdentityRealm.CUSTOMER) RequestAuth.CUSTOMER_COOKIE else RequestAuth.INTERNAL_COOKIE

    companion object {
        private const val CSRF_HEADER = RequestAuth.CSRF_HEADER
    }
}

data class BaseResponse<T>(val code: Int, val data: T?, val message: String?, val errorCode: String?, val retryable: Boolean?, val traceId: String?) {
    companion object {
        fun <T> ok(data: T, code: Int = 200) = BaseResponse(code, data, null, null, null, null)
        fun <T> ok(data: T, code: com.storecore.shared.http.HttpCode) = ok(data, code.status)
        fun <T> created(data: T) = ok(data, com.storecore.shared.http.HttpCode.Created)
        fun <T> error(
            code: com.storecore.shared.http.HttpCode,
            errorCode: String,
            message: String = "Request rejected",
            retryable: Boolean = false,
            traceId: String = java.util.UUID.randomUUID().toString(),
        ) = BaseResponse<T>(code.status, null, message, errorCode, retryable, traceId)
    }
}
data class RegisterRequest(@field:NotBlank val email: String, @field:NotBlank val password: String, @field:NotBlank val firstName: String, @field:NotBlank val lastName: String)
data class LoginRequest(@field:NotBlank val email: String, @field:NotBlank val password: String)
data class AddressRequest(@field:NotBlank val street: String, @field:NotBlank val number: String, @field:NotBlank val city: String, @field:NotBlank val province: String, @field:NotBlank val postalCode: String, val isDefault: Boolean)
data class CustomerProfileRequest(@field:NotBlank val email: String, @field:NotBlank val firstName: String, @field:NotBlank val lastName: String, val phone: String?)
data class RevokeRequest(@field:NotBlank val reason: String, val correlationId: UUID)
sealed interface PrincipalView
data class CustomerView(val id: Long, val email: String?, val firstName: String?, val lastName: String?) : PrincipalView { constructor(principal: CustomerPrincipal, email: String?, firstName: String?, lastName: String?) : this(principal.customerId, email, firstName, lastName) }
data class InternalView(val id: Long, val roles: List<String>) : PrincipalView
data class CustomerProfileView(val id: Long, val email: String, val firstName: String, val lastName: String, val phone: String?)
data class AddressView(val id: Long, val street: String, val number: String, val city: String, val province: String, val postalCode: String, val isDefault: Boolean)
