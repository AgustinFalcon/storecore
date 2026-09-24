package com.storecore.blackstore.infrastructure.web

import com.storecore.blackstore.BlackStoreLineFailure
import com.storecore.blackstore.BlackStoreSagaException
import com.storecore.blackstore.application.BlackStoreCapabilityDisabled
import com.storecore.blackstore.application.BlackStoreIntegrationException
import com.storecore.blackstore.application.BlackStoreNotModified
import com.storecore.blackstore.application.BlackStoreOperationRetired
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.util.UUID

@RestControllerAdvice
class BlackStoreIntegrationExceptionAdvice {
    @ExceptionHandler(BlackStoreNotModified::class)
    fun notModified(exception: BlackStoreNotModified): ResponseEntity<Void> =
        ResponseEntity.status(304).eTag(exception.etag).build()

    @ExceptionHandler(
        BlackStoreCapabilityDisabled::class,
        BlackStoreOperationRetired::class,
        BlackStoreSagaException::class,
        BlackStoreIntegrationException::class,
    )
    fun rejected(exception: BlackStoreIntegrationException): ResponseEntity<BlackStoreErrorEnvelope> {
        val trace = UUID.randomUUID().toString()
        val message = if (exception is BlackStoreCapabilityDisabled) "Request rejected" else exception.message
        val headers = HttpHeaders()
        val retryAfter = (exception as? BlackStoreSagaException)?.retryAfterSeconds
        if (exception.httpStatus == 429) {
            headers.add("Retry-After", (retryAfter ?: 1).toString())
        }
        val failures = (exception as? BlackStoreSagaException)?.lineFailures
            ?.takeIf { it.isNotEmpty() }
            ?.map { it.toWire() }
        return ResponseEntity.status(exception.httpStatus)
            .headers(headers)
            .body(
                BlackStoreErrorEnvelope(
                    code = exception.httpStatus,
                    data = null,
                    message = message,
                    errorCode = exception.message,
                    retryable = exception.retryable,
                    traceId = trace,
                    lineFailures = failures,
                ),
            )
    }

    private fun BlackStoreLineFailure.toWire() = BlackStoreLineFailureWire(
        variantId = variantId,
        sku = sku,
        requested = requested,
        availableQuantity = availableQuantity,
    )
}

data class BlackStoreErrorEnvelope(
    val code: Int,
    val data: Nothing?,
    val message: String?,
    val errorCode: String?,
    val retryable: Boolean?,
    val traceId: String?,
    val lineFailures: List<BlackStoreLineFailureWire>? = null,
)

data class BlackStoreLineFailureWire(
    val variantId: Long,
    val sku: String,
    val requested: Int,
    val availableQuantity: Int,
)
