package com.storecore.blackstore.infrastructure.web

import com.storecore.blackstore.BlackStoreSagaException
import com.storecore.blackstore.application.BlackStoreForbidden
import com.storecore.blackstore.application.BlackStoreProviderUnavailable
import com.storecore.blackstore.application.BlackStoreUnauthorized
import com.storecore.blackstore.application.CompanionRouteScopeMatrix
import com.storecore.blackstore.application.CompanionTokenGenerator
import com.storecore.blackstore.application.port.CompanionCredentialVerifier
import com.storecore.blackstore.application.port.CompanionVerifyResult
import com.storecore.blackstore.domain.CompanionLifecycleStatus
import com.storecore.blackstore.domain.VerifiedCompanionPrincipal
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.http.HttpMethod
import org.springframework.stereotype.Component
import org.springframework.web.servlet.HandlerInterceptor
import java.util.UUID

@Component
class CompanionAuthInterceptor(
    private val verifier: CompanionCredentialVerifier,
) : HandlerInterceptor {
    override fun preHandle(request: HttpServletRequest, response: HttpServletResponse, handler: Any): Boolean {
        val path = request.requestURI
        if (path.endsWith("/openapi.yaml")) return true
        val raw = bearerBytes(request.getHeader("Authorization")) ?: throw BlackStoreUnauthorized()
        when (val verified = verifier.verify(raw)) {
            CompanionVerifyResult.Invalid -> throw BlackStoreUnauthorized()
            CompanionVerifyResult.ProviderUnavailable -> throw BlackStoreProviderUnavailable()
            is CompanionVerifyResult.Verified -> {
                val principal = verified.principal
                val headerId = request.getHeader("X-Client-Instance-Id")
                if (headerId.isNullOrBlank()) throw BlackStoreSagaException.validation()
                val client = try {
                    UUID.fromString(headerId.trim())
                } catch (_: IllegalArgumentException) {
                    throw BlackStoreSagaException.validation()
                }
                if (client != principal.clientInstanceId) throw BlackStoreForbidden()
                if (principal.companionStatus != CompanionLifecycleStatus.ACTIVE) throw BlackStoreForbidden()
                val method = HttpMethod.valueOf(request.method)
                val required = CompanionRouteScopeMatrix.required(method, path) ?: throw BlackStoreForbidden()
                if (!principal.has(required)) throw BlackStoreForbidden()
                if (request.getParameter("includeCost")?.equals("true", ignoreCase = true) == true) {
                    throw BlackStoreSagaException.costForbidden()
                }
                validateOverrideHeaders(request, method, path)
                request.setAttribute(VerifiedCompanionPrincipal.REQUEST_ATTR, principal)
                return true
            }
        }
    }

    private fun validateOverrideHeaders(request: HttpServletRequest, method: HttpMethod, path: String) {
        if (method != HttpMethod.POST || CompanionRouteScopeMatrix.required(method, path)?.wire != "stock:reserve") {
            return
        }
        val reason = request.getHeader("X-Override-Reason")
        if (reason != null) {
            val trimmed = reason.trim()
            if (trimmed.length !in 3..500) throw BlackStoreSagaException.validation()
        }
        val actorRole = request.getHeader("X-Actor-Role")
        if (actorRole != null && actorRole.trim() !in setOf("SUPERVISOR", "OWNER")) {
            throw BlackStoreSagaException.validation()
        }
    }

    private fun bearerBytes(header: String?): ByteArray? {
        if (header.isNullOrBlank()) return null
        val prefix = "Bearer "
        if (!header.startsWith(prefix, ignoreCase = true)) return null
        val token = header.substring(prefix.length).trim()
        if (token.isEmpty()) return null
        return CompanionTokenGenerator.fromHex(token)
    }
}
