package com.storecore.commerce.infrastructure

import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import javax.sql.DataSource

@RestController
@RequestMapping("/api/v1/user/inventory")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class InventoryController(private val inventory: JdbcInventoryService, private val auth: RequestAuth, private val capabilities: CapabilityDecisionPort) {
    @GetMapping
    fun list(http: HttpServletRequest): BaseResponse<Any?> {
        val actor = auth.operatorOrAdmin(http)
        capabilities.decide("MANUAL_FULFILLMENT", "READ", CapabilityActor.Internal(actor))
        return BaseResponse.ok(inventory.list())
    }
}
