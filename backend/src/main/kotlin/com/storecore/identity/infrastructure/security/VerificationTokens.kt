package com.storecore.identity.infrastructure.security

import com.storecore.identity.application.VerificationTokenPort
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

class VerificationTokens(private val random: SecureRandom = SecureRandom()) : VerificationTokenPort {
    override fun nextRawToken(): String {
        val bytes = ByteArray(32)
        return try { random.nextBytes(bytes); Base64.getUrlEncoder().withoutPadding().encodeToString(bytes) }
        finally { bytes.fill(0) }
    }
    override fun sha256(raw: String): String = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}
