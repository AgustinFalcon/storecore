package com.storecore.blackstore.infrastructure.web

import com.storecore.blackstore.application.CompanionAdminCommandAborted
import com.storecore.blackstore.application.CompanionAdminCorrelationRequired
import com.storecore.blackstore.application.CompanionAdminException
import com.storecore.blackstore.application.CompanionAdminPayloadConflict
import com.storecore.blackstore.application.CompanionAdminPoolMissing
import com.storecore.blackstore.application.CompanionAdminSessionDenied
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.shared.http.HttpCode
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class CompanionAdminExceptionAdvice {
    @ExceptionHandler(CompanionAdminPoolMissing::class)
    fun poolMissing(): ResponseEntity<BaseResponse<Nothing>> =
        error(HttpCode.ServiceUnavailable, "COMPANION_ADMIN_POOL_MISSING", retryable = true)

    @ExceptionHandler(CompanionAdminPayloadConflict::class)
    fun payload(): ResponseEntity<BaseResponse<Nothing>> = error(HttpCode.Conflict, "COMPANION_ADMIN_PAYLOAD_CONFLICT")

    @ExceptionHandler(CompanionAdminSessionDenied::class)
    fun session(): ResponseEntity<BaseResponse<Nothing>> = error(HttpCode.Forbidden, "COMPANION_ADMIN_SESSION_DENIED")

    @ExceptionHandler(CompanionAdminCommandAborted::class)
    fun aborted(): ResponseEntity<BaseResponse<Nothing>> = error(HttpCode.Conflict, "COMPANION_ADMIN_COMMAND_ABORTED")

    @ExceptionHandler(CompanionAdminCorrelationRequired::class)
    fun correlation(): ResponseEntity<BaseResponse<Nothing>> = error(HttpCode.BadRequest, "COMPANION_ADMIN_CORRELATION_REQUIRED")

    @ExceptionHandler(CompanionAdminException::class)
    fun generic(exception: CompanionAdminException): ResponseEntity<BaseResponse<Nothing>> =
        error(HttpCode.Conflict, exception.message ?: "COMPANION_ADMIN_DENIED")

    private fun error(code: HttpCode, errorCode: String, retryable: Boolean = false): ResponseEntity<BaseResponse<Nothing>> {
        val body = BaseResponse.error<Nothing>(code, errorCode, retryable = retryable)
        return ResponseEntity.status(body.code).body(body)
    }
}
