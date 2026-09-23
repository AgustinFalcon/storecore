package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.CheckoutConflict
import com.storecore.commerce.application.CommerceException
import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.application.FulfillmentRejected
import com.storecore.commerce.application.InsufficientInventory
import com.storecore.commerce.application.InvalidWebhookSignature
import com.storecore.commerce.application.LegacyMpNotificationRetired
import com.storecore.commerce.application.MercadoLibreAccountMissing
import com.storecore.commerce.application.ProfileRejected
import com.storecore.commerce.application.PromoWindowOverlap
import com.storecore.commerce.application.WebhookPayloadTooLarge
import com.storecore.commerce.application.WebhookRateLimited
import com.storecore.identity.infrastructure.web.BaseResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class CommerceExceptionAdvice {
    @ExceptionHandler(InvalidWebhookSignature::class)
    fun invalidSignature() =
        ResponseEntity.status(HttpStatus.UNAUTHORIZED)
            .body(BaseResponse<Nothing>(401, null, "Request rejected", "INVALID_WEBHOOK_SIGNATURE", false, null))

    @ExceptionHandler(LegacyMpNotificationRetired::class)
    fun legacyNotificationRetired() =
        ResponseEntity.status(HttpStatus.GONE)
            .body(BaseResponse<Nothing>(410, null, "Gone", "LEGACY_MP_NOTIFICATION_RETIRED", false, null))

    @ExceptionHandler(WebhookRateLimited::class)
    fun rateLimited(exception: WebhookRateLimited) =
        ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
            .header("Retry-After", exception.retryAfterSeconds.toString())
            .body(BaseResponse<Nothing>(429, null, "Request rejected", "WEBHOOK_RATE_LIMITED", true, null))

    @ExceptionHandler(CheckoutConflict::class, PromoWindowOverlap::class, MercadoLibreAccountMissing::class)
    fun conflict(exception: CommerceException) = error(HttpStatus.CONFLICT, exception.message ?: "CONFLICT", exception.retryable)

    @ExceptionHandler(CommerceValidation::class, ProfileRejected::class, InsufficientInventory::class, FulfillmentRejected::class, WebhookPayloadTooLarge::class)
    fun rejected(exception: CommerceException) = error(HttpStatus.BAD_REQUEST, exception.message ?: "REQUEST_VALIDATION_FAILED", false)

    @ExceptionHandler(CommerceException::class)
    fun commerce(exception: CommerceException) = error(HttpStatus.BAD_REQUEST, exception.message ?: "COMMERCE_ERROR", exception.retryable)

    private fun error(status: HttpStatus, code: String, retryable: Boolean) =
        ResponseEntity.status(status).body(BaseResponse<Nothing>(status.value(), null, "Request rejected", code, retryable, null))
}
