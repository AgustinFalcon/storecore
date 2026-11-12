package com.storecore.identity.domain

import java.util.UUID

/** Owns a defensive copy. The caller must also erase its input buffer. */
class IdentitySecretBytes(bytes: ByteArray) : AutoCloseable {
    private val value = bytes.copyOf()
    private var closed = false
    @Synchronized fun <T> useBytes(action: (ByteArray) -> T): T {
        check(!closed) { "SECRET_CLOSED" }
        val copy = value.copyOf()
        return try { action(copy) } finally { copy.fill(0) }
    }
    @Synchronized override fun close() { value.fill(0); closed = true }
    override fun toString() = "IdentitySecretBytes(REDACTED)"
}

class IdentityMessageEncryptionContext(val installationId: String, val eventId: UUID, val kind: IdentityMessageKind) {
    init {
        require(installationId.matches(Regex("[A-Za-z0-9][A-Za-z0-9._-]{0,127}"))) { "INVALID_INSTALLATION_ID" }
        require(kind != IdentityMessageKind.Unknown) { "UNKNOWN_MESSAGE_KIND" }
    }
    fun aad(keyId: String): ByteArray = "$installationId:$eventId:${kind.name}:$keyId".toByteArray(Charsets.UTF_8)
}

/** Ciphertext and tag travel together; getters never expose mutable backing storage. */
class IdentityMessageEnvelope(
    val keyId: String, payloadCiphertext: ByteArray, payloadNonce: ByteArray,
    wrappedDek: ByteArray, wrappingNonce: ByteArray,
) {
    private val payload = payloadCiphertext.copyOf()
    private val nonce = payloadNonce.copyOf()
    private val wrapped = wrappedDek.copyOf()
    private val wrapNonce = wrappingNonce.copyOf()
    fun payloadCiphertext() = payload.copyOf()
    fun payloadNonce() = nonce.copyOf()
    fun wrappedDek() = wrapped.copyOf()
    fun wrappingNonce() = wrapNonce.copyOf()
    override fun toString() = "IdentityMessageEnvelope(REDACTED)"
}

interface IdentityMessageEncryption {
    fun encrypt(context: IdentityMessageEncryptionContext, plaintext: IdentitySecretBytes): IdentityMessageEnvelope
    fun decrypt(context: IdentityMessageEncryptionContext, envelope: IdentityMessageEnvelope): IdentitySecretBytes
}

/** Deliberately contains neither provider messages nor causes with secret-bearing diagnostics. */
class IdentityMessageCryptoFailure : RuntimeException("IDENTITY_MESSAGE_CRYPTO_FAILED")
