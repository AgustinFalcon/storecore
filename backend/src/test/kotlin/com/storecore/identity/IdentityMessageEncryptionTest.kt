package com.storecore.identity

import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.security.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class IdentityMessageEncryptionTest {
    private val context = IdentityMessageEncryptionContext("installation-test", UUID.randomUUID(), IdentityMessageKind.EMAIL_VERIFICATION)
    private fun key(seed: Int) = ByteArray(32) { (it + seed).toByte() }

    @Test fun `envelope roundtrip uses independent randomized DEKs and nonces`() {
        IdentityMessageKeyring("active", mapOf("active" to key(1))).use { ring ->
            val crypto = AesGcmIdentityMessageEncryption(ring)
            IdentitySecretBytes("recipient and link secret".toByteArray()).use { plaintext ->
                val first = crypto.encrypt(context, plaintext)
                val second = crypto.encrypt(context, plaintext)
                assertEquals(12, first.payloadNonce().size)
                assertEquals(12, first.wrappingNonce().size)
                assertEquals(48, first.wrappedDek().size)
                assertFalse(first.payloadNonce().contentEquals(second.payloadNonce()))
                assertFalse(first.wrappingNonce().contentEquals(second.wrappingNonce()))
                assertFalse(first.wrappedDek().contentEquals(second.wrappedDek()))
                assertFalse(first.payloadCiphertext().contentEquals(second.payloadCiphertext()))
                crypto.decrypt(context, first).use { opened -> opened.useBytes { assertArrayEquals("recipient and link secret".toByteArray(), it) } }
                assertFalse(first.toString().contains("recipient"))
            }
        }
    }

    @Test fun `both ciphertexts nonces key and every context field are authenticated`() {
        IdentityMessageKeyring("active", mapOf("active" to key(1), "other" to key(2))).use { ring ->
            val crypto = AesGcmIdentityMessageEncryption(ring)
            val envelope = IdentitySecretBytes(byteArrayOf(1, 2, 3)).use { crypto.encrypt(context, it) }
            fun changed(payload: ByteArray = envelope.payloadCiphertext(), nonce: ByteArray = envelope.payloadNonce(),
                        wrapped: ByteArray = envelope.wrappedDek(), wrapNonce: ByteArray = envelope.wrappingNonce(), keyId: String = envelope.keyId) =
                IdentityMessageEnvelope(keyId, payload, nonce, wrapped, wrapNonce)
            listOf(changed(payload = flip(envelope.payloadCiphertext())), changed(nonce = flip(envelope.payloadNonce())),
                changed(wrapped = flip(envelope.wrappedDek())), changed(wrapNonce = flip(envelope.wrappingNonce())),
                changed(keyId = "other"), changed(keyId = "missing"), changed(nonce = ByteArray(11)), changed(wrapped = ByteArray(15))).forEach {
                assertRedactedFailure { crypto.decrypt(context, it) }
            }
            listOf(IdentityMessageEncryptionContext("different", context.eventId, context.kind),
                IdentityMessageEncryptionContext(context.installationId, UUID.randomUUID(), context.kind),
                IdentityMessageEncryptionContext(context.installationId, context.eventId, IdentityMessageKind.PASSWORD_RECOVERY)).forEach {
                assertRedactedFailure { crypto.decrypt(it, envelope) }
            }
        }
    }

    @Test fun `rotation reads old events writes active key and refuses retired required keys`() {
        val old = IdentityMessageKeyring("old", mapOf("old" to key(1))).use { ring ->
            IdentitySecretBytes(byteArrayOf(7)).use { AesGcmIdentityMessageEncryption(ring).encrypt(context, it) }
        }
        IdentityMessageKeyring("new", mapOf("old" to key(1), "new" to key(2))).use { ring ->
            ring.requireReadable(setOf("old", "new"))
            val crypto = AesGcmIdentityMessageEncryption(ring)
            crypto.decrypt(context, old).use { plaintext ->
                assertEquals("new", crypto.encrypt(context, plaintext).keyId)
            }
        }
        IdentityMessageKeyring("new", mapOf("new" to key(2))).use { ring ->
            assertRedactedFailure { ring.requireReadable(setOf("old")) }
            assertRedactedFailure { AesGcmIdentityMessageEncryption(ring).decrypt(context, old) }
        }
        listOf(emptyMap(), mapOf("active" to ByteArray(16)), mapOf("bad:id" to key(1))).forEach { keys ->
            assertRedactedFailure { IdentityMessageKeyring("active", keys) }
        }
        assertRedactedFailure { IdentityMessageKeyring("missing", mapOf("active" to key(1))) }
    }

    @Test fun `secret buffers are defensive erased after callback and unusable after closing`() {
        val raw = byteArrayOf(1, 2, 3)
        val secret = IdentitySecretBytes(raw)
        raw.fill(9)
        lateinit var borrowed: ByteArray
        secret.useBytes { borrowed = it; assertArrayEquals(byteArrayOf(1, 2, 3), it) }
        assertArrayEquals(ByteArray(3), borrowed)
        assertThrows(IllegalArgumentException::class.java) { secret.useBytes { borrowed = it; throw IllegalArgumentException() } }
        assertArrayEquals(ByteArray(3), borrowed)
        secret.close()
        assertThrows(IllegalStateException::class.java) { secret.useBytes {} }
        assertEquals("IdentitySecretBytes(REDACTED)", secret.toString())
        val ring = IdentityMessageKeyring("active", mapOf("active" to key(1)))
        ring.close()
        assertRedactedFailure { ring.requireReadable(emptySet()) }
        assertRedactedFailure { IdentitySecretBytes(byteArrayOf(1)).use { AesGcmIdentityMessageEncryption(ring).encrypt(context, it) } }
    }

    @Test fun `payload JSON is versioned strict and redacted with clearable char arrays`() {
        val codec = JsonIdentityMessagePayloadCodec()
        val recipient = "recipient@example.test".toCharArray()
        val token = CharArray(43) { 'x' }
        val expiry = Instant.parse("2026-11-12T12:00:00Z")
        IdentityMessagePayload(recipient, RecoveryRealm.USER, IdentityMessageKind.EMAIL_VERIFICATION, token, expiry).use { payload ->
            recipient.fill('!'); token.fill('!')
            assertEquals("IdentityMessagePayload(REDACTED)", payload.toString())
            codec.encode(payload).use { encoded -> codec.decode(encoded).use { decoded ->
                assertEquals(RecoveryRealm.USER, decoded.realm)
                assertEquals(IdentityMessageKind.EMAIL_VERIFICATION, decoded.kind)
                assertEquals(expiry, decoded.expiresAt)
                lateinit var borrowed: CharArray
                decoded.usePlaintext { email, secret ->
                    borrowed = secret
                    assertArrayEquals("recipient@example.test".toCharArray(), email)
                    assertArrayEquals(CharArray(43) { 'x' }, secret)
                }
                assertArrayEquals(CharArray(43), borrowed)
            } }
        }
        val valid = """{"version":1,"recipient":"recipient@example.test","realm":"USER","kind":"EMAIL_VERIFICATION","secret":"${"x".repeat(43)}","expiresAt":"$expiry"}"""
        listOf(valid.replace("\"version\":1", "\"version\":2"), valid.replace("\"USER\"", "\"future\""),
            valid.replace("\"EMAIL_VERIFICATION\"", "\"future\""), valid.replace("\"version\":1", "\"version\":1,\"version\":1"),
            valid.dropLast(1) + ",\"extra\":1}", "$valid {}", "{}", valid.replace("\"secret\":", "\"missing\":")).forEach { raw ->
            IdentitySecretBytes(raw.toByteArray()).use { assertRedactedFailure { codec.decode(it) } }
        }
    }

    private fun flip(bytes: ByteArray) = bytes.also { it[0] = (it[0].toInt() xor 1).toByte() }
    private fun assertRedactedFailure(action: () -> Unit) {
        val failure = assertThrows(IdentityMessageCryptoFailure::class.java, action)
        assertEquals("IDENTITY_MESSAGE_CRYPTO_FAILED", failure.message)
        assertNull(failure.cause)
    }
}
