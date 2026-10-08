package com.storecore.identity.infrastructure.web

import com.storecore.identity.application.AuthenticationFailed
import com.storecore.identity.application.UnifiedOriginRejected
import com.storecore.identity.application.UnifiedAccessUseCases
import com.storecore.identity.domain.AccessContext
import com.storecore.identity.domain.LoginResolution
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.AssertTrue
import jakarta.validation.constraints.Size
import com.fasterxml.jackson.annotation.JsonIgnore
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpHeaders
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.CookieValue
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@Configuration
open class UnifiedAccessConfiguration {
    @Bean open fun unifiedAccessResolver() = com.storecore.identity.application.UnifiedAccessResolver()
}

@RestController
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
@RequestMapping("/api/v1/auth")
class UnifiedAccessController(
    private val access: UnifiedAccessUseCases,
    private val auth: RequestAuth,
    private val cookies: IdentityCookieWriter,
    private val clientAddresses: ClientAddressResolver,
) {
    @PostMapping("/login")
    fun login(http: HttpServletRequest, @Valid @RequestBody request: UnifiedLoginRequest): ResponseEntity<BaseResponse<UnifiedLoginView>> {
        requireUnifiedOrigin(http)
        val origin = http.getHeader(HttpHeaders.ORIGIN) ?: throw AuthenticationFailed()
        return when (val result = access.login(request.email, request.password, request.returnPath, clientAddresses.resolve(http), origin)) {
            is LoginResolution.Authenticated -> authenticated(result)
            is LoginResolution.ContextSelectionRequired -> ResponseEntity.ok()
                .cacheControl(org.springframework.http.CacheControl.noStore())
                .header(HttpHeaders.SET_COOKIE, cookies.challengeBinding(result.bindingNonce).toString())
                .body(BaseResponse.ok(ContextSelectionView(result.challenge, result.contexts, result.expiresAt, ReturnDestinationView(result.destination))))
            LoginResolution.Rejected -> throw AuthenticationFailed()
        }
    }

    @PostMapping("/context-selection")
    fun select(
        http: HttpServletRequest,
        @CookieValue(name = IdentityCookieWriter.CHALLENGE_COOKIE, required = false) bindingNonce: String?,
        @Valid @RequestBody request: ContextSelectionRequest,
    ): ResponseEntity<BaseResponse<UnifiedLoginView>> {
        requireUnifiedOrigin(http)
        val origin = http.getHeader(HttpHeaders.ORIGIN) ?: throw AuthenticationFailed()
        val result = access.select(request.challenge, bindingNonce ?: "", request.context, clientAddresses.resolve(http), origin)
        return authenticated(result)
    }

    private fun authenticated(result: LoginResolution.Authenticated): ResponseEntity<BaseResponse<UnifiedLoginView>> =
        ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
            .header(
                HttpHeaders.SET_COOKIE,
                cookies.session(result.credentials.principal.realm, result.credentials.sessionToken).toString(),
                cookies.expireChallenge().toString(),
            )
            .header(RequestAuth.CSRF_HEADER, result.credentials.csrfToken)
            .body(BaseResponse.ok(AuthenticatedAccessView(result.context, result.home, ReturnDestinationView(result.destination))))

    private fun requireUnifiedOrigin(http: HttpServletRequest) {
        try { auth.requireSameOrigin(http) } catch (_: com.storecore.identity.application.CsrfInvalid) { throw UnifiedOriginRejected() }
    }
}

data class UnifiedLoginRequest(
    @field:NotBlank @field:Size(max = 320) val email: String,
    @field:NotBlank val password: String,
    @field:Size(max = 4096) val returnPath: String? = null,
) {
    @get:AssertTrue(message = "password length")
    @get:JsonIgnore
    val passwordLengthValid: Boolean get() = password.codePointCount(0, password.length) in 12..128
}
data class ContextSelectionRequest(
    @field:NotBlank @field:Size(min = 32, max = 256) val challenge: String,
    @field:NotBlank @field:Size(max = 16) val context: String,
)

enum class UnifiedLoginKind { AUTHENTICATED, CONTEXT_SELECTION_REQUIRED }
sealed interface UnifiedLoginView { val kind: UnifiedLoginKind }
data class AuthenticatedAccessView(
    val context: AccessContext,
    val home: com.storecore.identity.domain.AccessHome,
    val destination: ReturnDestinationView,
) : UnifiedLoginView { override val kind = UnifiedLoginKind.AUTHENTICATED }
data class ContextSelectionView(
    val challenge: String,
    val contexts: List<AccessContext>,
    val expiresAt: java.time.Instant,
    val destination: ReturnDestinationView,
) : UnifiedLoginView { override val kind = UnifiedLoginKind.CONTEXT_SELECTION_REQUIRED }
data class ReturnDestinationView(val kind: com.storecore.identity.domain.ReturnDestination)
