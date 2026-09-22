package com.storecore.commerce.infrastructure

import com.storecore.identity.infrastructure.web.BaseResponse
import com.storecore.identity.infrastructure.web.IdentityMutationCoordinator
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import javax.sql.DataSource

@RestController
@RequestMapping("/api/v1/user/profiles")
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class ProfileController(private val profiles: JdbcProfileService, private val auth: RequestAuth, private val mutations: IdentityMutationCoordinator) {
    @PostMapping("/preview")
    fun preview(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @Valid @RequestBody request: ProfileRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.admin(http)
        return csrfOk(mutations.execute(actor, csrf) { profiles.preview(actor, request.manifest) })
    }

    @PostMapping("/merge")
    fun merge(http: HttpServletRequest, @RequestHeader("X-CSRF-Token") csrf: String, @Valid @RequestBody request: ProfileRequest): ResponseEntity<BaseResponse<Any?>> {
        auth.requireSameOrigin(http); val actor = auth.admin(http)
        return csrfOk(mutations.execute(actor, csrf) { profiles.merge(actor, request.manifest) })
    }
}

data class ProfileRequest(@field:NotBlank val manifest: String)
