package com.storecore.catalog.infrastructure

import com.storecore.configuration.application.CapabilityDecisionPort
import com.storecore.configuration.domain.CapabilityActor
import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.constraints.NotBlank
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PutMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import javax.sql.DataSource

@RestController
@RequestMapping("/api/v1")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class CatalogController(
    private val catalog: JdbcCatalogService,
    private val auth: RequestAuth,
    private val mutations: IdentityMutationCoordinator,
    private val capabilities: CapabilityDecisionPort,
) {
    @GetMapping("/catalog") fun search(@RequestParam(defaultValue = "") query: String, @RequestParam(required = false) brand: Long?, @RequestParam(required = false) category: Long?, @RequestParam(defaultValue = "false") offers: Boolean, @RequestParam(defaultValue = "0") page: Int, @RequestParam(defaultValue = "50") size: Int): BaseResponse<Any?> { capabilities.decide("STOREFRONT", "SERVE", CapabilityActor.Public); return BaseResponse.ok(catalog.search(query, brand, category, offers, page, size)) }
    @GetMapping("/catalog/products/{sku}") fun product(@PathVariable sku: String): ResponseEntity<BaseResponse<Any?>> { capabilities.decide("STOREFRONT", "SERVE", CapabilityActor.Public); return catalog.product(sku)?.let { ResponseEntity.ok(BaseResponse.ok(it)) } ?: ResponseEntity.status(HttpStatus.NOT_FOUND).body(BaseResponse(404, null, "Not found", "RESOURCE_NOT_FOUND", false, null)) }
    @GetMapping("/catalog/brands") fun brands(): BaseResponse<Any?> { capabilities.decide("STOREFRONT", "SERVE", CapabilityActor.Public); return BaseResponse.ok(catalog.facets("brands")) }
    @GetMapping("/catalog/categories") fun categories(): BaseResponse<Any?> { capabilities.decide("STOREFRONT", "SERVE", CapabilityActor.Public); return BaseResponse.ok(catalog.facets("categories")) }
    @GetMapping("/user/catalog") fun adminCatalog(http: HttpServletRequest, @RequestParam(defaultValue = "0") page: Int, @RequestParam(defaultValue = "50") size: Int): BaseResponse<Any?> { val actor = auth.operatorOrAdmin(http); capabilities.decide("CATALOG", "READ", CapabilityActor.Internal(actor)); return BaseResponse.ok(catalog.adminList(page, size)) }
    @GetMapping("/user/catalog/products/{sku}") fun adminProduct(http: HttpServletRequest, @PathVariable sku: String): ResponseEntity<BaseResponse<Any?>> {
        val actor = auth.operatorOrAdmin(http); capabilities.decide("CATALOG", "READ", CapabilityActor.Internal(actor))
        return catalog.product(sku, true)?.let { ResponseEntity.ok(BaseResponse.ok(it)) } ?: ResponseEntity.status(HttpStatus.NOT_FOUND).body(BaseResponse(404, null, "Not found", "RESOURCE_NOT_FOUND", false, null))
    }
    @PutMapping("/user/catalog/products/{sku}") fun saveProduct(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable sku: String, @RequestBody request: ProductDetailRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.operatorOrAdmin(http)
        val mutation = mutations.execute(actor, csrf) { capabilities.decide("CATALOG", "MANAGE", CapabilityActor.Internal(actor)); catalog.saveProduct(sku, request.name, request.description, request.brand, request.category, request.images, request.variants, request.price, request.active, actor.userId, request.status, request.productBasePrice) }
        return csrfOk(mutation)
    }
    @PutMapping("/user/catalog/brands/{id}") fun saveBrand(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable id: Long, @RequestBody request: FacetWriteRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.operatorOrAdmin(http)
        val mutation = mutations.execute(actor, csrf) { capabilities.decide("CATALOG", "MANAGE", CapabilityActor.Internal(actor)); catalog.saveBrand(id, request.name, actor.userId) }
        return csrfOk(mutation)
    }
    @PutMapping("/user/catalog/categories/{id}") fun saveCategory(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @PathVariable id: Long, @RequestBody request: FacetWriteRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.operatorOrAdmin(http)
        val mutation = mutations.execute(actor, csrf) { capabilities.decide("CATALOG", "MANAGE", CapabilityActor.Internal(actor)); catalog.saveCategory(id, request.name, actor.userId) }
        return csrfOk(mutation)
    }
    private fun csrfOk(mutation: com.storecore.identity.infrastructure.web.CsrfMutation<*>) = ResponseEntity.ok().header(RequestAuth.CSRF_HEADER, mutation.nextCsrf).body(BaseResponse.ok(mutation.value))
}

data class FacetWriteRequest(@field:NotBlank val name: String, val id: Long? = null)
data class ProductDetailRequest(val sku: String = "", val name: String = "", val description: String = "", val brand: String = "", val category: String = "", val images: List<String> = emptyList(), val variants: List<Map<String, Any?>> = emptyList(), val price: Map<String, Any?> = emptyMap(), val offerRef: String? = null, val active: Boolean? = null, val status: String? = null, val productBasePrice: com.fasterxml.jackson.databind.JsonNode = com.fasterxml.jackson.databind.node.MissingNode.getInstance())
