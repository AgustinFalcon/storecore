package com.storecore.identity.infrastructure.web

import com.fasterxml.jackson.databind.ObjectMapper
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.http.CacheControl
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

/** Enforces the unified credential boundary before Spring CORS can replace its canonical response. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class UnifiedOriginFilter(
    private val installationOrigin: InstallationOrigin,
    private val cookies: IdentityCookieWriter,
    private val objectMapper: ObjectMapper,
) : OncePerRequestFilter() {
    override fun shouldNotFilter(request: HttpServletRequest): Boolean =
        request.method != "POST" || request.servletPath !in UNIFIED_POST_PATHS

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain,
    ) {
        val origin = request.getHeader(HttpHeaders.ORIGIN)
        if (origin != null && installationOrigin.accepts(origin)) {
            filterChain.doFilter(request, response)
            return
        }

        response.status = HttpStatus.FORBIDDEN.value()
        response.contentType = MediaType.APPLICATION_JSON_VALUE
        response.setHeader(HttpHeaders.CACHE_CONTROL, CacheControl.noStore().headerValue)
        response.addHeader(HttpHeaders.SET_COOKIE, cookies.expireChallenge().toString())
        objectMapper.writeValue(
            response.outputStream,
            BaseResponse<Nothing>(403, null, "Request rejected", "CSRF_INVALID", false, null),
        )
    }

    private companion object {
        val UNIFIED_POST_PATHS = setOf("/api/v1/auth/login", "/api/v1/auth/context-selection")
    }
}
