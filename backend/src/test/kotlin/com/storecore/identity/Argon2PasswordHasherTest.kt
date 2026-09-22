package com.storecore.identity

import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class Argon2PasswordHasherTest {
    private val hasher = Argon2PasswordHasher()

    @Test
    fun `valid current PHC verifies and password chars are consumed`() {
        repeat(8) {
            val hash = hasher.hash("a-very-long-password".toCharArray())
            assertTrue(hasher.verify(hash, "a-very-long-password".toCharArray()), hash)
            assertFalse(hasher.verify(hash, "wrong-password-xx".toCharArray()))
        }
    }

    @Test
    fun `malformed or out of bounds PHC is rejected before native work`() {
        val hash = hasher.hash("a-very-long-password".toCharArray())
        val cases = listOf(
            hash.replace("m=19456", "m=1"),
            hash.replace("t=2", "t=11"),
            hash.replace("p=1", "p=5"),
            hash.replace("v=19", "v=18"),
            hash.replace("argon2id", "argon2i"),
            "\$argon2id\$v=19\$m=19456,t=2,p=1\$bad\$bad",
        )
        cases.forEach { candidate -> assertFalse(hasher.verify(candidate, "a-very-long-password".toCharArray())) }
    }
}