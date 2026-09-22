package com.storecore.identity.infrastructure.security

import de.mkammerer.argon2.Argon2Factory
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

@Component
class Argon2PasswordHasher {
    private val argon2 = Argon2Factory.create(Argon2Factory.Argon2Types.ARGON2id)
    private val iterations = 2
    private val memoryKiB = 19_456
    private val parallelism = 1

    fun hash(password: CharArray): String = try {
        argon2.hash(iterations, memoryKiB, parallelism, password)
    } finally {
        password.fill('\u0000')
    }

    fun verify(encoded: String, password: CharArray): Boolean = try {
        parseAndBound(encoded) && argon2.verify(encoded, password)
    } finally {
        password.fill('\u0000')
    }

    fun dummyVerify(password: CharArray) {
        verify(dummyHash, password)
    }

    private val dummyHash: String by lazy { hash("StoreCore dummy password only".toCharArray()) }

    /** Validate untrusted PHC metadata before invoking native Argon2 work. */
    private fun parseAndBound(encoded: String): Boolean {
        if (encoded.length > MAX_PHC_LENGTH || encoded.length < MIN_PHC_LENGTH) return false
        val parts = encoded.split('$')
        if (parts.size != 6 || parts[0].isNotEmpty() || parts[1] != "argon2id") return false
        if (parts[2] != "v=19") return false

        val parameters = linkedMapOf<String, String>()
        for (parameter in parts[3].split(',')) {
            val pair = parameter.split('=', limit = 2)
            if (pair.size != 2 || pair[0].isBlank() || pair[1].isBlank() || parameters.put(pair[0], pair[1]) != null) return false
        }
        if (parameters.size != 3 || parameters.keys != setOf("m", "t", "p")) return false
        val memory = parameters["m"]!!.toLongOrNull() ?: return false
        val time = parameters["t"]!!.toLongOrNull() ?: return false
        val lanes = parameters["p"]!!.toLongOrNull() ?: return false
        if (memory !in MIN_MEMORY_KIB.toLong()..MAX_MEMORY_KIB.toLong()) return false
        if (time !in MIN_ITERATIONS.toLong()..MAX_ITERATIONS.toLong()) return false
        if (lanes !in MIN_PARALLELISM.toLong()..MAX_PARALLELISM.toLong()) return false
        if (!isArgonBase64(parts[4]) || !isArgonBase64(parts[5])) return false
        val saltBytes = argonBase64DecodedLength(parts[4])
        val hashBytes = argonBase64DecodedLength(parts[5])
        return saltBytes in MIN_SALT_BYTES..MAX_SALT_BYTES && hashBytes in MIN_HASH_BYTES..MAX_HASH_BYTES
    }

    private fun isArgonBase64(value: String): Boolean =
        value.isNotEmpty() && value.length <= MAX_BASE64_PART_LENGTH && value.all { it in ARGON_BASE64_ALPHABET }

    private fun argonBase64DecodedLength(value: String): Int = (value.length * 6) / 8

    companion object {
        // Current SDD floor is retained; upper bounds prevent attacker-controlled cost.
        private const val MIN_MEMORY_KIB = 19_456
        private const val MAX_MEMORY_KIB = 131_072
        private const val MIN_ITERATIONS = 2
        private const val MAX_ITERATIONS = 10
        private const val MIN_PARALLELISM = 1
        private const val MAX_PARALLELISM = 4
        private const val MIN_SALT_BYTES = 16
        private const val MAX_SALT_BYTES = 64
        private const val MIN_HASH_BYTES = 16
        private const val MAX_HASH_BYTES = 64
        private const val MAX_BASE64_PART_LENGTH = 86
        private const val MIN_PHC_LENGTH = 60
        private const val MAX_PHC_LENGTH = 256
        // argon2-jvm emits Java Base64 (`+/`); PHC reference uses `./`. Accept both, plus optional padding.
        private const val ARGON_BASE64_ALPHABET = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/="
    }
}

@Component
class OpaqueTokenFactory {
    private val random = SecureRandom()

    fun nextRawToken(): String {
        val bytes = ByteArray(32)
        random.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    fun sha256(raw: String): String = MessageDigest.getInstance("SHA-256")
        .digest(raw.toByteArray(StandardCharsets.UTF_8))
        .joinToString("") { "%02x".format(it) }

    fun hashesEqual(raw: String, expectedHash: String): Boolean = MessageDigest.isEqual(
        sha256(raw).toByteArray(StandardCharsets.US_ASCII),
        expectedHash.toByteArray(StandardCharsets.US_ASCII),
    )
}
