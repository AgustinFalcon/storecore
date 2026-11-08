package com.storecore.commerce.infrastructure.mporders

import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.RequestAuth
import com.storecore.configuration.application.CapabilityAdministrationPort
import com.storecore.configuration.domain.CapabilityModuleView
import com.storecore.configuration.domain.CapabilityState
import com.storecore.configuration.domain.InstallationCapabilityModule
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.CacheControl
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/user/showcase-safety")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class ShowcaseSafetyController(
    private val properties: MpOrdersProperties,
    private val auth: RequestAuth,
    private val capabilities: CapabilityAdministrationPort,
) {
    @GetMapping
    fun read(http: HttpServletRequest): ResponseEntity<BaseResponse<Map<String, Any>>> {
        auth.admin(http)
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(BaseResponse.ok(showcaseSafetyPayload(properties, capabilities.list())))
    }
}

/** Safety projection includes hidden external modules without exposing console controls. */
internal enum class ShowcaseExternalCapability(val module: InstallationCapabilityModule) {
    MARKETPLACE(InstallationCapabilityModule.MarketplaceMl),
    PRICE_AUTOMATION(InstallationCapabilityModule.MlPriceAutomation),
    PROMOTIONS(InstallationCapabilityModule.MlPromotionOrchestrator),
    INSIGHTS(InstallationCapabilityModule.MlCompetitionInsights),
    KITS(InstallationCapabilityModule.MlVirtualKits),
    CARRIERS(InstallationCapabilityModule.Carriers),
    BLACKSTORE(InstallationCapabilityModule.BlackStoreIntegration),
}

internal fun showcaseSafetyPayload(properties: MpOrdersProperties, capabilities: List<CapabilityModuleView> = emptyList()): Map<String, Any> =
    mapOf(
        "mpOrdersAdapter" to properties.adapterMode.wire,
        "externalCheckoutDisabled" to (properties.adapterMode == MpOrdersAdapterMode.UNCONFIGURED),
        "externalCapabilities" to ShowcaseExternalCapability.entries.map { external ->
            val matches = capabilities.filter { it.module == external.module }
            val state = matches.singleOrNull()?.state ?: CapabilityState.UNKNOWN
            mapOf("module" to external.module.wire, "state" to state.wire)
        },
    )
