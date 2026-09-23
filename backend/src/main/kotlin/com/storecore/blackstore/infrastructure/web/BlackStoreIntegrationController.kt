package com.storecore.blackstore.infrastructure.web

import com.storecore.blackstore.application.BlackStoreCapabilityDisabled
import com.storecore.blackstore.application.port.BlackStoreMlListingPort
import com.storecore.blackstore.infrastructure.JdbcBlackStoreCompanionStore
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.application.CapabilityDisabled
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.configuration.infrastructure.JdbcCapabilityService
import com.storecore.identity.infrastructure.web.BaseResponse
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.core.io.ClassPathResource
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/blackstore-integration/v1")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class BlackStoreIntegrationController(
    private val capabilities: CapabilityDecisionPort,
    private val companions: JdbcBlackStoreCompanionStore,
    private val mlListing: BlackStoreMlListingPort,
) {
    @GetMapping("/catalog")
    fun catalog(): BaseResponse<Nothing> = deny("CATALOG_READ")

    @GetMapping("/stock/variants/{variantId}")
    fun stock(@PathVariable variantId: Long): BaseResponse<Nothing> = deny("STOCK_READ")

    @PostMapping("/reservations")
    fun reserve(): BaseResponse<Nothing> = deny("STOCK_RESERVE")

    @PostMapping("/reservations/{reservationRef}/commit")
    fun commit(@PathVariable reservationRef: String): BaseResponse<Nothing> = deny("STOCK_COMMIT")

    @PostMapping("/reservations/{reservationRef}/release")
    fun release(@PathVariable reservationRef: String): BaseResponse<Nothing> = deny("STOCK_RELEASE")

    @GetMapping("/operations/{operationId}")
    fun operation(@PathVariable operationId: String): BaseResponse<Nothing> = deny("STOCK_READ")

    @PostMapping("/operations/reconcile")
    fun reconcile(): BaseResponse<Nothing> = deny("STOCK_READ")

    @GetMapping(value = ["/openapi.yaml"], produces = ["application/yaml", MediaType.TEXT_PLAIN_VALUE])
    fun openApi(): ResponseEntity<String> {
        val yaml = ClassPathResource("openapi/blackstore-integration.openapi.yaml").inputStream.bufferedReader().readText()
        return ResponseEntity.ok().header("X-Contract-Version", "1.0.0-draft").body(yaml)
    }

    private fun deny(action: String): BaseResponse<Nothing> {
        try {
            capabilities.decide(JdbcCapabilityService.BLACKSTORE_MODULE, action, CapabilityActor.System)
        } catch (_: CapabilityDisabled) {
            companions.assertNoLiveTraffic()
            mlListing.enqueueDesiredQuantityAfterBlackStore(null)
            throw BlackStoreCapabilityDisabled()
        }
        companions.assertNoLiveTraffic()
        mlListing.enqueueDesiredQuantityAfterBlackStore(null)
        throw BlackStoreCapabilityDisabled()
    }
}
