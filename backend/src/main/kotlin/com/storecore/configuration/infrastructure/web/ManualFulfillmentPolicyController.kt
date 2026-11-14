package com.storecore.configuration.infrastructure.web

import com.fasterxml.jackson.databind.ObjectMapper
import com.storecore.commerce.domain.DeliveryPolicyTranslator
import com.storecore.configuration.application.CapabilityConfigInvalid
import com.storecore.configuration.application.CapabilityConfigVersionConflict
import com.storecore.identity.infrastructure.web.*
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.*
import java.util.UUID

data class ManualFulfillmentPolicyRequest(val expectedConfigVersion:com.fasterxml.jackson.databind.JsonNode,val reason:String,val correlationId:UUID,val pickup:Map<String,Any?>,val localDelivery:Map<String,Any?>)

@RestController
@RequestMapping("/api/v1/user/capabilities/MANUAL_FULFILLMENT/policy")
@ConditionalOnProperty(name=["storecore.identity.enabled"],havingValue="true",matchIfMissing=true)
class ManualFulfillmentPolicyController(private val administration:com.storecore.configuration.application.ManualFulfillmentPolicyAdministrationPort,private val auth:RequestAuth,private val mutations:IdentityMutationCoordinator) {
    @PutMapping fun configure(http:HttpServletRequest,@RequestHeader("X-CSRF-Token") csrf:String,@RequestBody request:ManualFulfillmentPolicyRequest):ResponseEntity<BaseResponse<Map<String,Int>>> {
        auth.requireSameOrigin(http)
        val actor=auth.admin(http)
        val expected=request.expectedConfigVersion.takeIf { it.isIntegralNumber && it.canConvertToInt() }?.intValue() ?: throw CapabilityConfigInvalid()
        val config=mapOf("pickup" to request.pickup,"localDelivery" to request.localDelivery)
        val mutation=mutations.execute(actor,csrf) {
            mapOf("configurationVersion" to administration.configure(actor,expected,request.reason,request.correlationId,config))
        }
        return ResponseEntity.ok().header(RequestAuth.CSRF_HEADER,mutation.nextCsrf).body(BaseResponse.ok(mutation.value))
    }
}
