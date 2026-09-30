package com.storecore.blackstore.application

import java.security.MessageDigest
import java.security.SecureRandom

object CompanionTokenGenerator {
    fun next256Bits(): ByteArray {
        val bytes = ByteArray(32)
        SecureRandom().nextBytes(bytes)
        return bytes
    }

    fun fingerprint(rawToken: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(rawToken).joinToString("") { "%02x".format(it) }

    fun toHex(rawToken: ByteArray): String =
        rawToken.joinToString("") { "%02x".format(it) }

    fun fromHex(hex: String): ByteArray? {
        val normalized = hex.trim().lowercase()
        if (normalized.length < 64 || normalized.length % 2 != 0 || !normalized.matches(Regex("^[0-9a-f]+$"))) {
            return null
        }
        return normalized.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }
}
