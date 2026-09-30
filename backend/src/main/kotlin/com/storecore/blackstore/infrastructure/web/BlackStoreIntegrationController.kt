package com.storecore.blackstore.infrastructure.web

import com.storecore.blackstore.application.BlackStoreForbidden
import com.storecore.blackstore.application.BlackStoreIntegrationService
import com.storecore.blackstore.application.dto.BlackStoreReconcileRequest
import com.storecore.blackstore.application.dto.BlackStoreReservationRequest
import com.storecore.blackstore.domain.VerifiedCompanionPrincipal
import com.storecore.identity.infrastructure.web.BaseResponse
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.core.io.ClassPathResource
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/blackstore-integration/v1")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class BlackStoreIntegrationController(
    private val integration: BlackStoreIntegrationService,
) {
    @GetMapping("/catalog")
    fun catalog(
        @RequestHeader(value = "X-Client-Instance-Id", required = false) clientInstanceId: String?,
        @RequestHeader(value = "If-None-Match", required = false) ifNoneMatch: String?,
        @RequestParam cursor: String?,
        @RequestParam pageSize: Int?,
        @RequestParam includeCost: Boolean = false,
    ): ResponseEntity<BaseResponse<*>> {
        val page = integration.catalog(clientInstanceId, cursor, pageSize, includeCost, ifNoneMatch)
        return ResponseEntity.ok().eTag(page.etag).body(BaseResponse.ok(page))
    }

    @GetMapping("/stock/variants/{variantId}")
    fun stock(
        @RequestHeader(value = "X-Client-Instance-Id", required = false) clientInstanceId: String?,
        @PathVariable variantId: Long,
    ): BaseResponse<*> = BaseResponse.ok(integration.stock(clientInstanceId, variantId))

    @PostMapping("/reservations")
    fun reserve(
        request: HttpServletRequest,
        @RequestHeader(value = "X-Client-Instance-Id", required = false) clientInstanceId: String?,
        @RequestHeader(value = "X-Device-Id", required = false) deviceId: String?,
        @RequestHeader(value = "X-Sale-Id", required = false) saleId: String?,
        @RequestHeader(value = "X-Operation-Id", required = false) operationId: String?,
        @RequestHeader(value = "X-Override-Reason", required = false) overrideReason: String?,
        @RequestHeader(value = "X-Actor-Role", required = false) overrideRole: String?,
        @RequestBody(required = false) body: BlackStoreReservationRequest?,
    ): BaseResponse<*> = BaseResponse.ok(
        integration.reserve(principal(request), clientInstanceId, deviceId, saleId, operationId, body, overrideReason, overrideRole),
    )

    @PostMapping("/reservations/{reservationRef}/commit")
    fun commit(
        request: HttpServletRequest,
        @RequestHeader(value = "X-Client-Instance-Id", required = false) clientInstanceId: String?,
        @RequestHeader(value = "X-Device-Id", required = false) deviceId: String?,
        @RequestHeader(value = "X-Sale-Id", required = false) saleId: String?,
        @RequestHeader(value = "X-Operation-Id", required = false) operationId: String?,
        @PathVariable reservationRef: String,
    ): BaseResponse<*> = BaseResponse.ok(
        integration.commit(principal(request), clientInstanceId, deviceId, saleId, operationId, reservationRef),
    )

    @PostMapping("/reservations/{reservationRef}/release")
    fun release(
        request: HttpServletRequest,
        @RequestHeader(value = "X-Client-Instance-Id", required = false) clientInstanceId: String?,
        @RequestHeader(value = "X-Device-Id", required = false) deviceId: String?,
        @RequestHeader(value = "X-Sale-Id", required = false) saleId: String?,
        @RequestHeader(value = "X-Operation-Id", required = false) operationId: String?,
        @PathVariable reservationRef: String,
    ): BaseResponse<*> = BaseResponse.ok(
        integration.release(principal(request), clientInstanceId, deviceId, saleId, operationId, reservationRef),
    )

    @GetMapping("/operations/{operationId}")
    fun operation(
        request: HttpServletRequest,
        @RequestHeader(value = "X-Client-Instance-Id", required = false) clientInstanceId: String?,
        @RequestHeader(value = "X-Device-Id", required = false) deviceId: String?,
        @RequestHeader(value = "X-Sale-Id", required = false) saleId: String?,
        @RequestHeader(value = "X-Operation-Id", required = false) operationIdHeader: String?,
        @PathVariable operationId: String,
    ): BaseResponse<*> = BaseResponse.ok(
        integration.operation(principal(request), clientInstanceId, deviceId, saleId, operationIdHeader, operationId),
    )

    @PostMapping("/operations/reconcile")
    fun reconcile(
        request: HttpServletRequest,
        @RequestHeader(value = "X-Client-Instance-Id", required = false) clientInstanceId: String?,
        @RequestBody(required = false) body: BlackStoreReconcileRequest?,
    ): BaseResponse<*> = BaseResponse.ok(integration.reconcile(principal(request), clientInstanceId, body))

    private fun principal(request: HttpServletRequest): VerifiedCompanionPrincipal =
        request.getAttribute(VerifiedCompanionPrincipal.REQUEST_ATTR) as? VerifiedCompanionPrincipal
            ?: throw BlackStoreForbidden()

    @GetMapping(value = ["/openapi.yaml"], produces = ["application/yaml", MediaType.TEXT_PLAIN_VALUE])
    fun openApi(): ResponseEntity<String> {
        val yaml = ClassPathResource("openapi/blackstore-integration.openapi.yaml").inputStream.bufferedReader().readText()
        return ResponseEntity.ok().header("X-Contract-Version", "1.0.0-draft").body(yaml)
    }
}
