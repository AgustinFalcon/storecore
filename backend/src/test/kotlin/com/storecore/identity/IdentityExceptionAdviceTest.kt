package com.storecore.identity

import com.storecore.identity.application.LoginRateLimited
import com.storecore.identity.infrastructure.web.IdentityCookieWriter
import com.storecore.identity.infrastructure.web.IdentityExceptionAdvice
import org.springframework.http.HttpHeaders
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class IdentityExceptionAdviceTest {
    @Test
    fun `credential rate limit preserves unrelated challenge binding`() {
        val response = IdentityExceptionAdvice(IdentityCookieWriter()).loginRateLimited(LoginRateLimited(37))

        assertEquals(429, response.statusCode.value())
        assertEquals("37", response.headers.getFirst("Retry-After"))
        assertTrue(response.headers.getValuesAsList(HttpHeaders.SET_COOKIE).isEmpty())
    }
}
