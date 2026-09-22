package com.storecore.identity.infrastructure.web

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Component
import java.net.URI

/** Exact browser origin permitted for state-changing requests in this installation. */
@Component
class InstallationOrigin(
    @Value("\${storecore.installation.origin:http://localhost:4200}") configuredOrigin: String,
) {
    private val canonical = parse(configuredOrigin)

    fun accepts(origin: String?): Boolean {
        if (origin == null) return false
        val candidate = runCatching { parse(origin) }.getOrNull() ?: return false
        return candidate.scheme == canonical.scheme &&
            candidate.host == canonical.host &&
            effectivePort(candidate) == effectivePort(canonical)
    }

    private fun parse(raw: String): URI {
        val uri = URI(raw.trim())
        require(uri.isAbsolute && uri.userInfo == null && uri.path.isNullOrEmpty() && uri.query == null && uri.fragment == null && !uri.host.isNullOrBlank())
        require(uri.scheme.equals("http", true) || uri.scheme.equals("https", true))
        return URI(uri.scheme.lowercase(), null, uri.host.lowercase(), effectivePort(uri), null, null, null)
    }

    private fun effectivePort(uri: URI): Int = if (uri.port >= 0) uri.port else if (uri.scheme.equals("https", true)) 443 else 80
}