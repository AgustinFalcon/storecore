package com.storecore.identity.infrastructure.security

import com.storecore.identity.domain.*
import java.security.GeneralSecurityException
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/** Independent random DEK and nonces per event. Both GCM operations bind the same immutable context. */
class AesGcmIdentityMessageEncryption(
    private val keyring: IdentityMessageKeyring,
    private val random: SecureRandom = SecureRandom(),
) : IdentityMessageEncryption {
    override fun encrypt(context: IdentityMessageEncryptionContext, plaintext: IdentitySecretBytes): IdentityMessageEnvelope {
        val dek = randomBytes(32)
        val payloadNonce = randomBytes(12)
        val wrappingNonce = randomBytes(12)
        val keyId = keyring.activeKeyId
        val aad = context.aad(keyId)
        return try {
            val payload = plaintext.useBytes { crypt(Cipher.ENCRYPT_MODE, dek, payloadNonce, aad, it) }
            val wrapped = keyring.withKey(keyId) { crypt(Cipher.ENCRYPT_MODE, it, wrappingNonce, aad, dek) }
            IdentityMessageEnvelope(keyId, payload, payloadNonce, wrapped, wrappingNonce)
        } catch (_: GeneralSecurityException) {
            throw IdentityMessageCryptoFailure()
        } finally { dek.fill(0); aad.fill(0) }
    }

    override fun decrypt(context: IdentityMessageEncryptionContext, envelope: IdentityMessageEnvelope): IdentitySecretBytes {
        val aad = context.aad(envelope.keyId)
        var dek: ByteArray? = null
        var plaintext: ByteArray? = null
        return try {
            dek = keyring.withKey(envelope.keyId) { crypt(Cipher.DECRYPT_MODE, it, envelope.wrappingNonce(), aad, envelope.wrappedDek()) }
            if (dek.size != 32) throw IdentityMessageCryptoFailure()
            plaintext = crypt(Cipher.DECRYPT_MODE, dek, envelope.payloadNonce(), aad, envelope.payloadCiphertext())
            IdentitySecretBytes(plaintext)
        } catch (_: GeneralSecurityException) {
            throw IdentityMessageCryptoFailure()
        } finally { dek?.fill(0); plaintext?.fill(0); aad.fill(0) }
    }

    private fun randomBytes(size: Int) = ByteArray(size).also(random::nextBytes)

    private fun crypt(mode: Int, key: ByteArray, nonce: ByteArray, aad: ByteArray, input: ByteArray): ByteArray {
        if (key.size != 32 || nonce.size != 12 || (mode == Cipher.DECRYPT_MODE && input.size < 16)) throw IdentityMessageCryptoFailure()
        return Cipher.getInstance("AES/GCM/NoPadding").run {
            init(mode, SecretKeySpec(key, "AES"), GCMParameterSpec(128, nonce))
            updateAAD(aad)
            doFinal(input)
        }
    }
}
