package com.storecore.identity.infrastructure.web

import com.fasterxml.jackson.annotation.JsonInclude
import com.fasterxml.jackson.databind.JsonNode
import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.time.Instant

enum class EmailOwnershipViewState {
    VERIFIED, UNKNOWN;
    companion object {
        fun of(state: EmailOwnershipState) = when (state) {
            EmailOwnershipState.VERIFIED -> VERIFIED
            EmailOwnershipState.Unknown -> UNKNOWN
        }
    }
}
data class EmailOwnershipView(val ownership: EmailOwnershipViewState)
data class EmailVerificationRequestView(val kind: VerificationRequestState, val cooldownSeconds: Long)
data class EmailVerificationCompletionView(val kind: EmailVerificationCompletion)
@JsonInclude(JsonInclude.Include.NON_NULL)
data class EmailVerificationInspectionView(val kind: EmailVerificationStatus, val expiresAt: Instant?)
class EmailVerificationRequestInvalid : RuntimeException("EMAIL_VERIFICATION_REQUEST_INVALID")

@RestController
@RequestMapping("/api/v1")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class EmailVerificationController(
    private val verification: EmailVerificationUseCases, private val auth: RequestAuth,
    private val mutations: IdentityMutationCoordinator, private val addresses: ClientAddressResolver,
) {
    @GetMapping("/customer/auth/email-verification")
    fun customerState(http: HttpServletRequest) = state(auth.customer(http))
    @GetMapping("/internal/auth/email-verification")
    fun userState(http: HttpServletRequest) = state(auth.internal(http))

    @PostMapping("/customer/auth/email-verification/requests", consumes = ["application/json"])
    fun requestCustomer(http: HttpServletRequest, @RequestHeader(RequestAuth.CSRF_HEADER) csrf: String, @RequestBody body: JsonNode) =
        request(http, csrf, body) { auth.customer(http) }
    @PostMapping("/internal/auth/email-verification/requests", consumes = ["application/json"])
    fun requestUser(http: HttpServletRequest, @RequestHeader(RequestAuth.CSRF_HEADER) csrf: String, @RequestBody body: JsonNode) =
        request(http, csrf, body) { auth.internal(http) }

    @PostMapping("/customer/auth/email-verification/inspect", consumes = ["application/json"])
    fun inspectCustomer(http: HttpServletRequest, @RequestBody body: JsonNode) = inspect(RecoveryRealm.CUSTOMER, http, body)
    @PostMapping("/internal/auth/email-verification/inspect", consumes = ["application/json"])
    fun inspectUser(http: HttpServletRequest, @RequestBody body: JsonNode) = inspect(RecoveryRealm.USER, http, body)
    @PostMapping("/customer/auth/email-verification/complete", consumes = ["application/json"])
    fun completeCustomer(http: HttpServletRequest, @RequestBody body: JsonNode) = complete(RecoveryRealm.CUSTOMER, http, body)
    @PostMapping("/internal/auth/email-verification/complete", consumes = ["application/json"])
    fun completeUser(http: HttpServletRequest, @RequestBody body: JsonNode) = complete(RecoveryRealm.USER, http, body)

    private fun state(principal: AuthenticatedPrincipal) = ResponseEntity.ok().cacheControl(CacheControl.noStore())
        .body(BaseResponse.ok(EmailOwnershipView(EmailOwnershipViewState.of(verification.ownership(principal)))))

    private fun request(http: HttpServletRequest, csrf: String, body: JsonNode, principal: () -> AuthenticatedPrincipal): ResponseEntity<BaseResponse<EmailVerificationRequestView>> {
        auth.requireSameOrigin(http)
        fields(body, emptySet())
        val actor = principal()
        val mutation = mutations.execute(actor, csrf) { verification.request(actor) }
        return ResponseEntity.status(202).cacheControl(CacheControl.noStore()).header(RequestAuth.CSRF_HEADER, mutation.nextCsrf)
            .body(BaseResponse.ok(EmailVerificationRequestView(mutation.value, EmailVerificationPolicy.COOLDOWN_SECONDS), 202))
    }

    private fun inspect(realm: RecoveryRealm, http: HttpServletRequest, body: JsonNode): ResponseEntity<BaseResponse<EmailVerificationInspectionView>> {
        auth.requireSameOrigin(http)
        val result = verification.inspect(realm, token(body), addresses.resolve(http))
        val status = if (result.status == EmailVerificationStatus.Unknown) EmailVerificationStatus.INVALID_LINK else result.status
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(BaseResponse.ok(EmailVerificationInspectionView(status, if (status == EmailVerificationStatus.READY) result.expiresAt else null)))
    }

    private fun complete(realm: RecoveryRealm, http: HttpServletRequest, body: JsonNode): ResponseEntity<BaseResponse<EmailVerificationCompletionView>> {
        auth.requireSameOrigin(http)
        val result = verification.complete(realm, token(body), addresses.resolve(http))
        val kind = if (result == EmailVerificationCompletion.Unknown) EmailVerificationCompletion.INVALID_LINK else result
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(BaseResponse.ok(EmailVerificationCompletionView(kind)))
    }

    private fun fields(body: JsonNode, expected: Set<String>) {
        if (!body.isObject || body.fieldNames().asSequence().toSet() != expected) throw EmailVerificationRequestInvalid()
    }
    private fun token(body: JsonNode): String {
        fields(body, setOf("token"))
        val value = body["token"]
        if (!value.isTextual || value.textValue().length > 256) throw EmailVerificationRequestInvalid()
        return value.textValue()
    }
}

@RestControllerAdvice(assignableTypes = [EmailVerificationController::class])
class EmailVerificationExceptionAdvice {
    @ExceptionHandler(EmailVerificationUnavailable::class)
    fun unavailable() = error(503, "EMAIL_VERIFICATION_UNAVAILABLE", true)
    @ExceptionHandler(EmailVerificationRequestInvalid::class)
    fun invalid() = error(400, "EMAIL_VERIFICATION_REQUEST_INVALID", false)
    @ExceptionHandler(EmailVerificationRateLimited::class)
    fun limited(exception: EmailVerificationRateLimited): ResponseEntity<BaseResponse<Nothing>> =
        ResponseEntity.status(429).cacheControl(CacheControl.noStore()).header("Retry-After", exception.retryAfterSeconds.toString())
            .body(BaseResponse(429, null, "Request rejected", "EMAIL_VERIFICATION_RATE_LIMITED", true, null))
    private fun error(status: Int, code: String, retryable: Boolean) = ResponseEntity.status(status).cacheControl(CacheControl.noStore())
        .body(BaseResponse<Nothing>(status, null, "Request rejected", code, retryable, null))
}
