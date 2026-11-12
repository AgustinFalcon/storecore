package com.storecore.identity.domain

import java.time.Instant

/** Short-lived plaintext. Neither copies nor string representations reveal destination or link secret. */
class IdentityMessagePayload(
    recipient: CharArray, val realm: RecoveryRealm, val kind: IdentityMessageKind,
    secret: CharArray, val expiresAt: Instant,
) : AutoCloseable {
    private val destination: CharArray
    private val token: CharArray
    private var closed = false
    init {
        require(realm != RecoveryRealm.Unknown && kind != IdentityMessageKind.Unknown) { "UNKNOWN_MESSAGE_IDENTITY" }
        require(recipient.size in 3..320 && recipient.none { it.isISOControl() } && recipient.contains('@')) { "INVALID_MESSAGE_DESTINATION" }
        require(secret.size == 43 && secret.all { it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' || it == '_' || it == '-' }) { "INVALID_MESSAGE_SECRET" }
        destination = recipient.copyOf()
        token = secret.copyOf()
    }
    @Synchronized fun <T> usePlaintext(action: (recipient: CharArray, secret: CharArray) -> T): T {
        check(!closed) { "PAYLOAD_CLOSED" }
        val recipient = destination.copyOf()
        val secret = token.copyOf()
        return try { action(recipient, secret) } finally { recipient.fill('\u0000'); secret.fill('\u0000') }
    }
    @Synchronized override fun close() { destination.fill('\u0000'); token.fill('\u0000'); closed = true }
    override fun toString() = "IdentityMessagePayload(REDACTED)"
}

interface IdentityMessagePayloadCodec {
    fun encode(payload: IdentityMessagePayload): IdentitySecretBytes
    fun decode(plaintext: IdentitySecretBytes): IdentityMessagePayload
}
