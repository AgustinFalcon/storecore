package com.storecore.commerce.infrastructure

import com.storecore.commerce.application.LegacyMpNotificationRetired
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/payments/mercadopago")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class PaymentController {
    @PostMapping("/notifications")
    fun notify(
        http: HttpServletRequest,
        @RequestParam(required = false) topic: String?,
        @RequestParam(required = false) id: String?,
        @RequestBody(required = false) body: Map<String, Any?>?,
    ): Nothing {
        throw LegacyMpNotificationRetired()
    }
}
