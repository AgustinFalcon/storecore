package com.storecore.blackstore.infrastructure

import com.storecore.blackstore.application.port.CompanionSecretProvider
import com.storecore.blackstore.application.port.SecretResolveResult
import org.springframework.stereotype.Component
import java.util.concurrent.ConcurrentHashMap

@Component
class InMemoryCompanionSecretProvider : CompanionSecretProvider {
    private val secrets = ConcurrentHashMap<String, ByteArray>()
    private val prepared = ConcurrentHashMap<String, String>()
    @Volatile
    var unavailable: Boolean = false

    fun put(secretRef: String, rawToken: ByteArray) {
        secrets[secretRef] = rawToken.copyOf()
    }

    fun clear() {
        secrets.clear()
        prepared.clear()
        unavailable = false
    }

    override fun resolve(credentialSecretRef: String): SecretResolveResult {
        if (unavailable) return SecretResolveResult.TransientFailure
        val stored = secrets[credentialSecretRef] ?: return SecretResolveResult.Missing
        return SecretResolveResult.SecretBytes(stored.copyOf())
    }

    override fun prepare(requestId: String, rawBearer: ByteArray): String {
        val existing = prepared[requestId]
        if (existing != null) return existing
        val ref = "synthetic:$requestId"
        secrets.putIfAbsent(ref, rawBearer.copyOf())
        prepared[requestId] = ref
        return ref
    }

    override fun discard(credentialSecretRef: String, requestId: String) {
        secrets.remove(credentialSecretRef)
        prepared.remove(requestId)
    }
}
