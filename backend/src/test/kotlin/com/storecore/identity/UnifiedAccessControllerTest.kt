package com.storecore.identity

import com.storecore.identity.application.IdentityUseCases
import com.storecore.identity.application.UnifiedAccessUseCases
import com.storecore.identity.application.UnifiedOriginRejected
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.web.*
import org.mockito.Mockito.mock
import org.springframework.http.HttpHeaders
import org.springframework.mock.web.MockHttpServletRequest
import java.time.Instant
import java.util.UUID
import kotlin.test.*

/** Controller boundary only: deliberately not a browser or JDBC acceptance claim. */
class UnifiedAccessControllerTest {
    private class AccessStub(var result: LoginResolution) : UnifiedAccessUseCases {
        var calls = 0
        override fun login(email: String, password: String, returnPath: String?, sourceIp: String, acceptedOrigin: String): LoginResolution {
            calls++
            return result
        }
        override fun select(challenge: String, bindingNonce: String, context: String?, sourceIp: String, acceptedOrigin: String): LoginResolution.Authenticated = error("not used")
    }

    private fun controller(access: AccessStub) = UnifiedAccessController(
        access, RequestAuth(mock(IdentityUseCases::class.java), InstallationOrigin("https://shop.example")),
        IdentityCookieWriter(), ClientAddressResolver(""),
    )
    private fun request(origin: String = "https://shop.example") = MockHttpServletRequest().apply {
        remoteAddr = "127.0.0.1"
        addHeader(HttpHeaders.ORIGIN, origin)
    }
    private val credentials = IssuedCredentials(CustomerPrincipal(UUID.randomUUID(), 1), "opaque-session", "csrf-secret")

    @Test fun `authenticated response issues only the resolved realm cookie and csrf`() {
        val access = AccessStub(LoginResolution.Authenticated(credentials, ReturnDestination.CUSTOMER_PROFILE))
        val response = controller(access).login(request(), UnifiedLoginRequest("person@example.com", "long-password-value"))
        // Set-Cookie Expires contains a comma and is not a comma-separated header.
        val cookies = response.headers[HttpHeaders.SET_COOKIE]!!
        assertEquals(2, cookies.size)
        assertTrue(cookies.any { it.startsWith(RequestAuth.CUSTOMER_COOKIE + "=") && it.contains("HttpOnly") && it.contains("Secure") })
        assertFalse(cookies.any { it.startsWith(RequestAuth.INTERNAL_COOKIE + "=") })
        assertTrue(cookies.any { it.startsWith(IdentityCookieWriter.CHALLENGE_COOKIE + "=") && it.contains("Max-Age=0") })
        assertEquals(credentials.csrfToken, response.headers.getFirst(RequestAuth.CSRF_HEADER))
        assertEquals("no-store", response.headers.cacheControl)
        assertEquals(AccessContext.CUSTOMER, (response.body!!.data as AuthenticatedAccessView).context)
    }

    @Test fun `selection response sets no identity cookie or csrf`() {
        val access = AccessStub(LoginResolution.ContextSelectionRequired("opaque-challenge", "binding-nonce", Instant.now().plusSeconds(120), ReturnDestination.HOME))
        val response = controller(access).login(request(), UnifiedLoginRequest("person@example.com", "long-password-value"))
        val cookie = response.headers[HttpHeaders.SET_COOKIE]!!.single()
        assertTrue(cookie.startsWith(IdentityCookieWriter.CHALLENGE_COOKIE + "="))
        assertTrue(cookie.contains("Max-Age=120"))
        assertNull(response.headers.getFirst(RequestAuth.CSRF_HEADER))
        assertEquals(UnifiedLoginKind.CONTEXT_SELECTION_REQUIRED, response.body!!.data!!.kind)
    }

    @Test fun `invalid origin is rejected before credential work`() {
        val access = AccessStub(LoginResolution.Authenticated(credentials, ReturnDestination.HOME))
        assertFailsWith<UnifiedOriginRejected> {
            controller(access).login(request("https://evil.example"), UnifiedLoginRequest("person@example.com", "long-password-value"))
        }
        assertEquals(0, access.calls)
    }
}
