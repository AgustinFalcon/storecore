package com.storecore.blackstore.infrastructure.web

import com.storecore.blackstore.application.BlackStoreCapabilityDisabled
import com.storecore.blackstore.application.BlackStoreIntegrationException
import com.storecore.blackstore.application.BlackStoreOperationRetired
import com.storecore.identity.infrastructure.web.BaseResponse
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.util.UUID

@RestControllerAdvice
class BlackStoreIntegrationExceptionAdvice {
    @ExceptionHandler(BlackStoreCapabilityDisabled::class, BlackStoreOperationRetired::class, BlackStoreIntegrationException::class)
    fun rejected(exception: BlackStoreIntegrationException): ResponseEntity<BaseResponse<Nothing>> {
        val trace = UUID.randomUUID().toString()
        return ResponseEntity.status(exception.httpStatus)
            .body(BaseResponse(exception.httpStatus, null, "Request rejected", exception.message, exception.retryable, trace))
    }
}
