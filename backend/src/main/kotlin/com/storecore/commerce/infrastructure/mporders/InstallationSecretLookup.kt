package com.storecore.commerce.infrastructure.mporders

import org.springframework.stereotype.Component

fun interface InstallationSecretLookup {
    fun read(name: String): String?
}

@Component
class EnvironmentInstallationSecretLookup : InstallationSecretLookup {
    override fun read(name: String): String? {
        if (!name.matches(REF_NAME)) return null
        return System.getenv(name)?.takeIf { it.isNotBlank() }
    }

    private companion object {
        val REF_NAME = Regex("^[A-Z][A-Z0-9_]{0,127}$")
    }
}
