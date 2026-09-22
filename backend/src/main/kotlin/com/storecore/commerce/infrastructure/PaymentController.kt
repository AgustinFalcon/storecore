package com.storecore.commerce.infrastructure

import com.storecore.identity.infrastructure.web.BaseResponse
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import javax.sql.DataSource

@RestController
@RequestMapping("/api/v1/payments/mercadopago")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class PaymentController(private val payments: JdbcPaymentService) {
    @PostMapping("/notifications")
    fun notify(@RequestParam(required = false) topic: String?, @RequestParam(required = false) id: String?, @RequestBody(required = false) body: Map<String, Any?>?) =
        BaseResponse.ok(payments.notify(topic, id, body))
}
