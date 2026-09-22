package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.CheckoutConflict
import com.storecore.commerce.application.CommerceException
import com.storecore.commerce.application.CommerceValidation
import com.storecore.commerce.application.FulfillmentRejected
import com.storecore.commerce.application.InsufficientInventory
import com.storecore.commerce.application.MercadoLibreAccountMissing
import com.storecore.commerce.application.ProfileRejected
import com.storecore.commerce.application.PromoWindowOverlap
import com.storecore.identity.infrastructure.web.BaseResponse
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice

@RestControllerAdvice
class CommerceExceptionAdvice {
    @ExceptionHandler(CheckoutConflict::class, PromoWindowOverlap::class, MercadoLibreAccountMissing::class)
    fun conflict(exception: CommerceException) = error(HttpStatus.CONFLICT, exception.message ?: "CONFLICT", exception.retryable)

    @ExceptionHandler(CommerceValidation::class, ProfileRejected::class, InsufficientInventory::class, FulfillmentRejected::class)
    fun rejected(exception: CommerceException) = error(HttpStatus.BAD_REQUEST, exception.message ?: "REQUEST_VALIDATION_FAILED", false)

    @ExceptionHandler(CommerceException::class)
    fun commerce(exception: CommerceException) = error(HttpStatus.BAD_REQUEST, exception.message ?: "COMMERCE_ERROR", exception.retryable)

    private fun error(status: HttpStatus, code: String, retryable: Boolean) =
        ResponseEntity.status(status).body(BaseResponse<Nothing>(status.value(), null, "Request rejected", code, retryable, null))
}
