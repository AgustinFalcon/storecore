package com.storecore.identity

import com.storecore.identity.infrastructure.web.UnifiedLoginRequest
import jakarta.validation.Validation
import kotlin.test.Test
import kotlin.test.assertEquals

class UnifiedLoginRequestValidationTest {
    private val validator = Validation.buildDefaultValidatorFactory().validator

    @Test
    fun `password transport uses unicode code points at the approved boundaries`() {
        assertEquals(1, violations("x".repeat(11)))
        assertEquals(0, violations("x".repeat(12)))
        assertEquals(0, violations("😀".repeat(128)))
        assertEquals(1, violations("😀".repeat(129)))
    }

    private fun violations(password: String): Int =
        validator.validate(UnifiedLoginRequest("person@example.com", password)).count { it.propertyPath.toString() == "passwordLengthValid" }
}
