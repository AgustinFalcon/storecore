package com.storecore.identity.infrastructure.web

import com.storecore.identity.application.AuthenticationFailed
import com.storecore.identity.application.AccessChallengeRejected
import com.storecore.identity.application.UnifiedOriginRejected
import com.storecore.identity.application.AuthorizationDenied
import com.storecore.identity.application.CsrfInvalid
import com.storecore.identity.application.IdentityException
import com.storecore.identity.application.LoginRateLimited
import com.storecore.identity.application.RegistrationRejected
import com.storecore.identity.application.ResourceNotFound
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.MissingRequestHeaderException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class IdentityExceptionAdvice(private val cookies: IdentityCookieWriter) {
    @ExceptionHandler(LoginRateLimited::class)
    fun loginRateLimited(exception: LoginRateLimited): ResponseEntity<BaseResponse<Nothing>> =
        ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .cacheControl(org.springframework.http.CacheControl.noStore())
            .header("Retry-After", exception.retryAfterSeconds.toString())
            .body(BaseResponse(429, null, "Request rejected", "AUTH_RATE_LIMITED", false, null))

    @ExceptionHandler(AuthenticationFailed::class)
    fun authenticationFailed(): ResponseEntity<BaseResponse<Nothing>> = error(HttpStatus.UNAUTHORIZED, "AUTHENTICATION_FAILED")

    @ExceptionHandler(AccessChallengeRejected::class)
    fun challengeRejected(): ResponseEntity<BaseResponse<Nothing>> = authenticationError()

    @ExceptionHandler(UnifiedOriginRejected::class)
    fun unifiedOriginRejected(): ResponseEntity<BaseResponse<Nothing>> = ResponseEntity.status(HttpStatus.FORBIDDEN)
        .cacheControl(org.springframework.http.CacheControl.noStore())
        .header(org.springframework.http.HttpHeaders.SET_COOKIE, cookies.expireChallenge().toString())
        .body(BaseResponse(403, null, "Request rejected", "CSRF_INVALID", false, null))

    @ExceptionHandler(AuthorizationDenied::class)
    fun authorizationDenied(): ResponseEntity<BaseResponse<Nothing>> = error(HttpStatus.FORBIDDEN, "AUTHORIZATION_DENIED")

    @ExceptionHandler(CsrfInvalid::class)
    fun csrfInvalid(): ResponseEntity<BaseResponse<Nothing>> = error(HttpStatus.FORBIDDEN, "CSRF_INVALID")

    @ExceptionHandler(MissingRequestHeaderException::class)
    fun missingHeader(exception: MissingRequestHeaderException): ResponseEntity<BaseResponse<Nothing>> =
        if (exception.headerName == "X-CSRF-Token") csrfInvalid() else error(HttpStatus.BAD_REQUEST, "REQUEST_VALIDATION_FAILED")

    @ExceptionHandler(ResourceNotFound::class)
    fun notFound(): ResponseEntity<BaseResponse<Nothing>> = error(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND")

    @ExceptionHandler(RegistrationRejected::class)
    fun registrationRejected(): ResponseEntity<BaseResponse<Nothing>> = error(HttpStatus.BAD_REQUEST, "REGISTRATION_REJECTED")

    @ExceptionHandler(IdentityException::class)
    fun identityError(exception: IdentityException): ResponseEntity<BaseResponse<Nothing>> =
        error(HttpStatus.BAD_REQUEST, exception.message ?: "IDENTITY_ERROR")

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun validationFailed(): ResponseEntity<BaseResponse<Nothing>> = error(HttpStatus.BAD_REQUEST, "REQUEST_VALIDATION_FAILED")

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun malformedRequest(): ResponseEntity<BaseResponse<Nothing>> = error(HttpStatus.BAD_REQUEST, "REQUEST_MALFORMED")

    private fun error(status: HttpStatus, errorCode: String) =
        ResponseEntity.status(status).cacheControl(org.springframework.http.CacheControl.noStore())
            .body(BaseResponse<Nothing>(status.value(), null, "Request rejected", errorCode, false, null))

    private fun authenticationError() = ResponseEntity.status(HttpStatus.UNAUTHORIZED)
        .cacheControl(org.springframework.http.CacheControl.noStore())
        .header(org.springframework.http.HttpHeaders.SET_COOKIE, cookies.expireChallenge().toString())
        .body(BaseResponse<Nothing>(401, null, "Request rejected", "AUTHENTICATION_FAILED", false, null))
}
