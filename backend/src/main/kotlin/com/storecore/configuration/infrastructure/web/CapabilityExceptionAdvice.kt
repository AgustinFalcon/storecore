package com.storecore.configuration.infrastructure.web

import com.storecore.configuration.application.CapabilityActorNotAuthorized
import com.storecore.configuration.application.CapabilityAdminPayloadConflict
import com.storecore.configuration.application.CapabilityAdminPoolMissing
import com.storecore.configuration.application.CapabilityAdminSessionDenied
import com.storecore.configuration.application.CapabilityConfigVersionConflict
import com.storecore.configuration.application.CapabilityCorrelationRequired
import com.storecore.configuration.application.CapabilityException
import com.storecore.identity.infrastructure.web.BaseResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class CapabilityExceptionAdvice {
    @ExceptionHandler(CapabilityActorNotAuthorized::class)
    fun actor(): ResponseEntity<BaseResponse<Nothing>> = error(HttpStatus.FORBIDDEN, "CAPABILITY_ACTOR_NOT_AUTHORIZED")

    @ExceptionHandler(CapabilityConfigVersionConflict::class)
    fun conflict(): ResponseEntity<BaseResponse<Nothing>> = error(HttpStatus.CONFLICT, "CAPABILITY_CONFIG_VERSION_CONFLICT")

    @ExceptionHandler(CapabilityCorrelationRequired::class)
    fun correlation(): ResponseEntity<BaseResponse<Nothing>> = error(HttpStatus.BAD_REQUEST, "CAPABILITY_CORRELATION_REQUIRED")

    @ExceptionHandler(CapabilityAdminPoolMissing::class)
    fun poolMissing(): ResponseEntity<BaseResponse<Nothing>> = error(HttpStatus.SERVICE_UNAVAILABLE, "CAPABILITY_ADMIN_POOL_MISSING")

    @ExceptionHandler(CapabilityAdminPayloadConflict::class)
    fun payloadConflict(): ResponseEntity<BaseResponse<Nothing>> = error(HttpStatus.CONFLICT, "CAPABILITY_PAYLOAD_CONFLICT")

    @ExceptionHandler(CapabilityAdminSessionDenied::class)
    fun sessionDenied(): ResponseEntity<BaseResponse<Nothing>> = error(HttpStatus.FORBIDDEN, "CAPABILITY_SESSION_DENIED")

    @ExceptionHandler(CapabilityException::class)
    fun capability(exception: CapabilityException): ResponseEntity<BaseResponse<Nothing>> =
        error(HttpStatus.CONFLICT, exception.message ?: "CAPABILITY_DENIED")

    private fun error(status: HttpStatus, code: String) =
        ResponseEntity.status(status).body(BaseResponse<Nothing>(status.value(), null, "Request rejected", code, false, null))
}
