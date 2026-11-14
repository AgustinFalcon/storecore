package com.storecore.branding.infrastructure

import com.fasterxml.jackson.databind.JsonNode
import com.storecore.branding.application.*
import com.storecore.branding.domain.*
import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.infrastructure.web.*
import jakarta.servlet.http.HttpServletRequest
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.*
import org.springframework.web.bind.annotation.*

data class MerchantBrandingResponse(val revision: Long, val businessName: String, val logoUrl: String?, val primaryColor: String, val onPrimaryColor: String)

@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class MerchantBrandingConfiguration {
    @Bean fun merchantBrandingService(repository: MerchantBrandingRepository) = MerchantBrandingService(repository)
}

@RestController
@RequestMapping("/api/v1")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class MerchantBrandingController(
    private val branding: MerchantBrandingService,
    private val auth: RequestAuth,
    private val capabilities: CapabilityDecisionPort,
    private val mutations: IdentityMutationCoordinator,
) {
    @GetMapping("/storefront/branding")
    fun publicBranding(): ResponseEntity<BaseResponse<MerchantBrandingResponse>> {
        capabilities.decide("STOREFRONT", "SERVE", CapabilityActor.Public)
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(BaseResponse.ok(response(branding.read())))
    }

    @GetMapping("/user/settings/branding")
    fun adminBranding(http: HttpServletRequest): ResponseEntity<BaseResponse<MerchantBrandingResponse>> {
        val actor = auth.admin(http)
        capabilities.decide("PROFILE_CONTENT", "READ", CapabilityActor.Internal(actor))
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(BaseResponse.ok(response(branding.read())))
    }

    @PutMapping("/user/settings/branding")
    fun replace(http: HttpServletRequest, @RequestHeader(RequestAuth.CSRF_HEADER) csrf: String,
                @RequestBody request: JsonNode): ResponseEntity<BaseResponse<MerchantBrandingResponse>> {
        auth.requireSameOrigin(http)
        val actor = auth.admin(http)
        val mutation = mutations.execute(actor, csrf) {
            capabilities.decide("PROFILE_CONTENT", "MANAGE", CapabilityActor.Internal(actor))
            branding.replace(actor, fromRequest(request))
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header(RequestAuth.CSRF_HEADER, mutation.nextCsrf)
            .body(BaseResponse.ok(response(mutation.value)))
    }

    private fun response(value: MerchantBranding) = MerchantBrandingResponse(value.revision, value.businessName, value.logo.url, value.primaryColor.hex, value.onPrimaryColor.hex)

    private fun fromRequest(node: JsonNode): MerchantBranding {
        val fields = setOf("expectedRevision", "businessName", "logoUrl", "primaryColor", "onPrimaryColor")
        if (!node.isObject || node.fieldNames().asSequence().any { it !in fields }) throw BrandingInvalid()
        val revision = node.get("expectedRevision")?.takeIf { it.isIntegralNumber && it.canConvertToLong() }?.longValue() ?: throw BrandingInvalid()
        fun text(field: String): String = node.get(field)?.takeIf { it.isTextual }?.textValue() ?: throw BrandingInvalid()
        val logo = node.get("logoUrl")?.let { if (it.isNull) null else it.takeIf { value -> value.isTextual }?.textValue() ?: throw BrandingInvalid() }
        return MerchantBranding.create(revision, text("businessName"), BrandLogo.fromWire(logo),
            BrandColor.fromWire(text("primaryColor")) ?: throw BrandingInvalid(),
            BrandColor.fromWire(text("onPrimaryColor")) ?: throw BrandingInvalid())
    }
}

@RestControllerAdvice(assignableTypes = [MerchantBrandingController::class])
class MerchantBrandingExceptionAdvice {
    @ExceptionHandler(BrandingInvalid::class)
    fun invalid() = error(HttpStatus.BAD_REQUEST, "MERCHANT_BRANDING_INVALID")
    @ExceptionHandler(BrandingRevisionConflict::class)
    fun conflict() = error(HttpStatus.CONFLICT, "MERCHANT_BRANDING_REVISION_CONFLICT")
    private fun error(status: HttpStatus, code: String) = ResponseEntity.status(status).cacheControl(CacheControl.noStore())
        .body(BaseResponse<Nothing>(status.value(), null, "Request rejected", code, false, null))
}
