package com.storecore.commerce.infrastructure.mporders

import com.storecore.identity.infrastructure.web.BaseResponse
import jakarta.servlet.http.HttpServletRequest
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/payments/mercadopago/orders")
@ConditionalOnMpOrdersAdapter
class MpOrderNotificationController(
    private val inbox: MpOrderInboxService,
) {
    @PostMapping("/notifications")
    fun notify(
        http: HttpServletRequest,
        @RequestParam("data.id", required = false) queryDataId: String?,
        @RequestParam("type", required = false) queryType: String?,
        @RequestBody(required = false) body: Map<String, Any?>?,
    ): BaseResponse<Map<String, Any?>> = BaseResponse.ok(
        inbox.receive(
            sourceIp = http.remoteAddr,
            xSignature = http.getHeader("x-signature"),
            xRequestId = http.getHeader("x-request-id"),
            queryDataId = queryDataId,
            queryType = queryType,
            body = body ?: emptyMap(),
        ),
    )
}
