package com.storecore.identity.infrastructure.web

import com.fasterxml.jackson.databind.JsonNode
import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*

data class RecoveryKindView(val kind: String)
@com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
data class RecoveryInspectionView(val kind: String, val expiresAt: java.time.Instant?)

@RestController
@RequestMapping("/api/v1")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class RecoveryController(
    private val recovery: RecoveryUseCases, private val auth: RequestAuth,
    private val addresses: ClientAddressResolver, private val cookies: IdentityCookieWriter,
) {
    @PostMapping("/customer/auth/recovery/requests", consumes = ["application/json"])
    fun requestCustomer(http: HttpServletRequest, @RequestBody body: JsonNode) = request(RecoveryRealm.CUSTOMER, http, body)
    @PostMapping("/internal/auth/recovery/requests", consumes = ["application/json"])
    fun requestUser(http: HttpServletRequest, @RequestBody body: JsonNode) = request(RecoveryRealm.USER, http, body)
    @PostMapping("/customer/auth/recovery/inspect", consumes = ["application/json"])
    fun inspectCustomer(http: HttpServletRequest, @RequestBody body: JsonNode) = inspect(RecoveryRealm.CUSTOMER, http, body)
    @PostMapping("/internal/auth/recovery/inspect", consumes = ["application/json"])
    fun inspectUser(http: HttpServletRequest, @RequestBody body: JsonNode) = inspect(RecoveryRealm.USER, http, body)
    @PostMapping("/customer/auth/recovery/complete", consumes = ["application/json"])
    fun completeCustomer(http: HttpServletRequest, @RequestBody body: JsonNode) = complete(RecoveryRealm.CUSTOMER, http, body)
    @PostMapping("/internal/auth/recovery/complete", consumes = ["application/json"])
    fun completeUser(http: HttpServletRequest, @RequestBody body: JsonNode) = complete(RecoveryRealm.USER, http, body)

    private fun request(realm: RecoveryRealm, http: HttpServletRequest, body: JsonNode): ResponseEntity<BaseResponse<RecoveryKindView>> {
        auth.requireSameOrigin(http)
        fields(body, setOf("email"))
        val result = recovery.request(realm, text(body, "email", 320), addresses.resolve(http))
        return ResponseEntity.status(202).cacheControl(CacheControl.noStore()).body(BaseResponse.ok(RecoveryKindView(result.name), 202))
    }
    private fun inspect(realm: RecoveryRealm, http: HttpServletRequest, body: JsonNode): ResponseEntity<BaseResponse<RecoveryInspectionView>> {
        auth.requireSameOrigin(http)
        fields(body, setOf("token"))
        val result = recovery.inspect(realm, text(body, "token", 256), addresses.resolve(http))
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(BaseResponse.ok(RecoveryInspectionView(result.status.name, result.expiresAt)))
    }
    private fun complete(realm: RecoveryRealm, http: HttpServletRequest, body: JsonNode): ResponseEntity<BaseResponse<RecoveryKindView>> {
        auth.requireSameOrigin(http)
        fields(body, setOf("token", "newPassword"))
        val result = recovery.complete(realm, text(body, "token", 256), text(body, "newPassword", 256), addresses.resolve(http))
        val response = ResponseEntity.ok().cacheControl(CacheControl.noStore())
        if (result == RecoveryCompletionResult.COMPLETED) response.header(HttpHeaders.SET_COOKIE, cookies.expireSession(realm.identityRealm!!).toString())
        return response.body(BaseResponse.ok(RecoveryKindView(result.name)))
    }
    private fun fields(body: JsonNode, expected: Set<String>) {
        if (!body.isObject || body.fieldNames().asSequence().toSet() != expected) throw RecoveryRequestInvalid()
    }
    private fun text(body: JsonNode, name: String, max: Int): String {
        val value = body[name]
        if (value == null || !value.isTextual || value.textValue().length > max) throw RecoveryRequestInvalid()
        return value.textValue()
    }
}

@RestControllerAdvice(assignableTypes = [RecoveryController::class])
class RecoveryExceptionAdvice {
    @ExceptionHandler(RecoveryUnavailable::class)
    fun unavailable(exception: RecoveryUnavailable) = error(503, exception.message!!, true)
    @ExceptionHandler(RecoveryPasswordRejected::class)
    fun passwordPolicy(exception: RecoveryPasswordRejected) = error(422, exception.message!!, false)
    @ExceptionHandler(RecoveryRequestInvalid::class)
    fun invalid(exception: RecoveryRequestInvalid) = error(400, exception.message!!, false)
    @ExceptionHandler(RecoveryRateLimited::class)
    fun limited(exception: RecoveryRateLimited): ResponseEntity<BaseResponse<Nothing>> =
        ResponseEntity.status(429).cacheControl(CacheControl.noStore()).header("Retry-After", exception.retryAfterSeconds.toString())
            .body(BaseResponse(429, null, "Request rejected", exception.message, true, null))
    private fun error(status: Int, code: String, retryable: Boolean) =
        ResponseEntity.status(status).cacheControl(CacheControl.noStore()).body(BaseResponse<Nothing>(status, null, "Request rejected", code, retryable, null))
}
