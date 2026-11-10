package com.storecore.commerce.infrastructure

import com.fasterxml.jackson.databind.JsonNode
import com.storecore.commerce.application.StockAdjustmentUseCases
import com.storecore.commerce.domain.*
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.annotation.*
import java.util.UUID

/** Strict numeric parsing prevents Jackson's scalar coercions at the command boundary. */
internal object StockAdjustmentRequestTranslator {
    fun id(raw: String): Long = raw.toLongOrNull()?.takeIf { it > 0 } ?: throw InvalidStockAdjustmentCommand()
    fun uuid(raw: String): UUID = runCatching { UUID.fromString(raw) }.getOrNull()?.takeIf { it.toString().equals(raw, ignoreCase = true) } ?: throw InvalidStockAdjustmentCommand()
    fun command(variantId: String, node: JsonNode): AdjustAvailableStockCommand {
        if (!node.isObject || node.fieldNames().asSequence().toSet() != setOf("commandId", "quantityDelta", "expected", "reason")) throw InvalidStockAdjustmentCommand()
        val expected = node.path("expected")
        if (!expected.isObject || expected.fieldNames().asSequence().toSet() != setOf("available", "reserved", "safety")) throw InvalidStockAdjustmentCommand()
        fun integer(value: JsonNode): Int = value.takeIf { it.isIntegralNumber && it.canConvertToInt() }?.intValue() ?: throw InvalidStockAdjustmentCommand()
        val values = listOf("available", "reserved", "safety").map { integer(expected.path(it)) }
        if (values.any { it < 0 }) throw InvalidStockAdjustmentCommand()
        val reason = node.path("reason").textValue() ?: throw InvalidStockAdjustmentCommand()
        return AdjustAvailableStockCommand.create(uuid(node.path("commandId").textValue() ?: throw InvalidStockAdjustmentCommand()), id(variantId),
            integer(node.path("quantityDelta")), StockBalanceSnapshot(values[0], values[1], values[2]), reason)
    }
}

@RestController
@RequestMapping("/api/v1/user/inventory/{variantId}/adjustments")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class StockAdjustmentController(private val service: StockAdjustmentUseCases, private val auth: RequestAuth, private val mutations: IdentityMutationCoordinator) {
    @PostMapping
    fun adjust(http: HttpServletRequest, @PathVariable variantId: String, @RequestHeader("X-CSRF-Token") csrf: String, @RequestBody request: JsonNode): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http)
        val actor = auth.operatorOrAdmin(http)
        val command = StockAdjustmentRequestTranslator.command(variantId, request)
        val mutation = mutations.execute(actor, csrf) { service.adjust(actor, command) }
        val result = mutation.value
        val status = when (result) {
            is StockAdjustmentExecution.Invalid -> when (result.error) {
                StockAdjustmentRequestError.INVALID_COMMAND -> 400
                StockAdjustmentRequestError.IDEMPOTENCY_CONFLICT -> 409
                StockAdjustmentRequestError.UNKNOWN -> 503
            }
            is StockAdjustmentExecution.Recorded -> when (result.receipt.state) {
                StockAdjustmentState.APPLIED -> 200
                StockAdjustmentState.UNKNOWN -> 503
                StockAdjustmentState.REJECTED -> when (result.receipt.reason) {
                    StockAdjustmentRejection.BALANCE_CHANGED, StockAdjustmentRejection.BALANCE_MISSING -> 409
                    StockAdjustmentRejection.WOULD_MAKE_AVAILABLE_NEGATIVE, StockAdjustmentRejection.QUANTITY_OVERFLOW -> 422
                    StockAdjustmentRejection.UNKNOWN, null -> 503
                }
            }
        }
        val body: BaseResponse<Any?> = when (result) {
            is StockAdjustmentExecution.Recorded -> BaseResponse.ok(result.receipt, status)
            is StockAdjustmentExecution.Invalid -> BaseResponse(status, null, null, result.error.name, false, null)
        }
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore()).header(RequestAuth.CSRF_HEADER, mutation.nextCsrf).body(body)
    }

    @GetMapping("/{commandId}")
    fun lookup(http: HttpServletRequest, @PathVariable variantId: String, @PathVariable commandId: String): ResponseEntity<BaseResponse<StockAdjustmentLookup>> {
        val actor = auth.operatorOrAdmin(http)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(BaseResponse.ok(service.lookup(actor, StockAdjustmentRequestTranslator.id(variantId), StockAdjustmentRequestTranslator.uuid(commandId))))
    }
}

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = [StockAdjustmentController::class])
class StockAdjustmentExceptionAdvice {
    @ExceptionHandler(InvalidStockAdjustmentCommand::class, HttpMessageNotReadableException::class)
    fun invalid(): ResponseEntity<BaseResponse<Any?>> = ResponseEntity.badRequest().cacheControl(CacheControl.noStore()).body(BaseResponse(400, null, null, StockAdjustmentRequestError.INVALID_COMMAND.name, false, null))
}
