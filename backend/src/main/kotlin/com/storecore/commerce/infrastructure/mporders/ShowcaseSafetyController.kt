package com.storecore.commerce.infrastructure.mporders

import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/user/showcase-safety")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class ShowcaseSafetyController(
    private val properties: MpOrdersProperties,
    private val auth: RequestAuth,
) {
    @GetMapping
    fun read(http: HttpServletRequest): BaseResponse<Map<String, Any>> {
        auth.admin(http)
        return BaseResponse.ok(showcaseSafetyPayload(properties))
    }
}

internal fun showcaseSafetyPayload(properties: MpOrdersProperties): Map<String, Any> =
    mapOf(
        "mpOrdersAdapter" to properties.adapterMode.wire,
        "externalCheckoutDisabled" to (properties.adapterMode == MpOrdersAdapterMode.UNCONFIGURED),
    )
