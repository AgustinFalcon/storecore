package com.storecore.identity.infrastructure.security

import com.storecore.identity.domain.IdentityMessageCryptoFailure

/** External secret loading belongs to the configuration adapter, never to domain or persistence. */
class IdentityMessageKeyring(val activeKeyId: String, keys: Map<String, ByteArray>) : AutoCloseable {
    private val material: Map<String, ByteArray>
    private var closed = false
    init {
        if (keys.isEmpty() || activeKeyId !in keys || keys.any { (id, key) ->
            !id.matches(Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,127}")) || key.size != 32
        }) throw IdentityMessageCryptoFailure()
        material = keys.mapValues { (_, key) -> key.copyOf() }
    }

    /** Must be invoked with the active secret-row key IDs before starting a worker. */
    @Synchronized fun requireReadable(requiredActiveKeyIds: Set<String>) {
        if (closed || !material.keys.containsAll(requiredActiveKeyIds)) throw IdentityMessageCryptoFailure()
    }

    @Synchronized internal fun <T> withKey(keyId: String, action: (ByteArray) -> T): T {
        if (closed) throw IdentityMessageCryptoFailure()
        val key = material[keyId]?.copyOf() ?: throw IdentityMessageCryptoFailure()
        return try { action(key) } finally { key.fill(0) }
    }

    @Synchronized override fun close() {
        material.values.forEach { it.fill(0) }
        closed = true
    }
    override fun toString() = "IdentityMessageKeyring(REDACTED)"
}
