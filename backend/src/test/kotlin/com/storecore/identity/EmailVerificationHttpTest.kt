package com.storecore.identity

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.persistence.IdentityMutationLocks
import com.storecore.identity.infrastructure.web.*
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.Mockito.*
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.transaction.TransactionStatus
import org.springframework.transaction.support.TransactionCallback
import org.springframework.transaction.support.TransactionTemplate
import java.time.Instant
import java.util.UUID

class EmailVerificationHttpTest {
    private val identity = mock(IdentityUseCases::class.java)
    private val verification = mock(EmailVerificationUseCases::class.java)
    private val locks = mock(IdentityMutationLocks::class.java)
    private val customer = CustomerPrincipal(UUID.randomUUID(), 42)
    private val user = InternalUserPrincipal(UUID.randomUUID(), 84, setOf(InternalRole.OPERATOR))
    private val mapper = jacksonObjectMapper()
    private lateinit var mvc: MockMvc

    @BeforeEach fun setup() {
        val transactions = object : TransactionTemplate() {
            override fun <T : Any?> execute(action: TransactionCallback<T>): T? = action.doInTransaction(mock(TransactionStatus::class.java))
        }
        val auth = RequestAuth(identity, InstallationOrigin(origin))
        val mutations = IdentityMutationCoordinator(transactions, identity, locks)
        mvc = MockMvcBuilders.standaloneSetup(EmailVerificationController(verification, auth, mutations, ClientAddressResolver("")))
            .setControllerAdvice(EmailVerificationExceptionAdvice(), IdentityExceptionAdvice(IdentityCookieWriter()))
            .addFilters<org.springframework.test.web.servlet.setup.StandaloneMockMvcBuilder>(RecoveryBodyLimitFilter()).build()
        `when`(identity.authenticate(IdentityRealm.CUSTOMER, "customer-session")).thenReturn(customer)
        `when`(identity.authenticate(IdentityRealm.USER, "user-session")).thenReturn(user)
        listOf(customer, user).forEach { actor ->
            `when`(locks.own(actor)).thenReturn(IdentityMutationScope.Own(IdentitySubject.of(actor)))
            `when`(identity.rotateCsrf(actor)).thenReturn("next-csrf")
            doThrow(CsrfInvalid()).`when`(identity).verifyCsrf(actor, "invalid")
            `when`(verification.request(actor)).thenReturn(VerificationRequestState.ACCEPTED)
        }
    }

    @Test fun `ownership requires own realm session and known user role`() {
        `when`(verification.ownership(customer)).thenReturn(EmailOwnershipState.Unknown)
        `when`(verification.ownership(user)).thenReturn(EmailOwnershipState.VERIFIED)
        assertEquals("UNKNOWN", json(mvc.perform(get(customerPath).cookie(customerCookie)).andReturn().response.contentAsString)["data"]["ownership"].asText())
        val result = mvc.perform(get(userPath).cookie(userCookie)).andReturn().response
        assertEquals("VERIFIED", json(result.contentAsString)["data"]["ownership"].asText())
        assertEquals("no-store", result.getHeader("Cache-Control"))
        assertEquals(401, mvc.perform(get(customerPath).cookie(userCookie)).andReturn().response.status)
        assertEquals(401, mvc.perform(get(userPath).cookie(customerCookie)).andReturn().response.status)
        `when`(identity.authenticate(IdentityRealm.USER, "user-session")).thenReturn(user.copy(roles = setOf(InternalRole.Unknown)))
        assertEquals(401, mvc.perform(get(userPath).cookie(userCookie)).andReturn().response.status)
        verify(verification).ownership(user)
    }

    @Test fun `authenticated requests bind actor rotate csrf and return neutral acceptance with cooldown`() {
        for ((path, cookie, actor) in listOf(Triple(customerPath, customerCookie, customer), Triple(userPath, userCookie, user))) {
            val response = mvc.perform(post("$path/requests").cookie(cookie).header("Origin", origin)
                .header(RequestAuth.CSRF_HEADER, "csrf").contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn().response
            assertEquals(202, response.status)
            assertEquals("next-csrf", response.getHeader(RequestAuth.CSRF_HEADER))
            assertEquals("no-store", response.getHeader("Cache-Control"))
            assertEquals("ACCEPTED", json(response.contentAsString)["data"]["kind"].asText())
            assertEquals(60, json(response.contentAsString)["data"]["cooldownSeconds"].asInt())
            assertNull(response.getHeader("Set-Cookie"))
            val order = inOrder(locks, identity, verification)
            order.verify(locks).revalidateActor(actor)
            order.verify(identity).verifyCsrf(actor, "csrf")
            order.verify(verification).request(actor)
            order.verify(identity).rotateCsrf(actor)
        }
    }

    @Test fun `request rejects missing session wrong csrf origin and destination override before emission`() {
        assertEquals(401, request().andReturn().response.status)
        assertEquals(403, request(cookie = customerCookie, csrf = null).andReturn().response.status)
        assertEquals(403, request(cookie = customerCookie, csrf = "invalid").andReturn().response.status)
        assertEquals(403, request(cookie = customerCookie, requestOrigin = null).andReturn().response.status)
        assertEquals(403, request(cookie = customerCookie, requestOrigin = "https://evil.test").andReturn().response.status)
        for (body in listOf("[]", "null", "{\"email\":\"other@example.test\"}", "{\"realm\":\"USER\"}", "{\"subjectId\":84}")) {
            assertEquals(400, request(cookie = customerCookie, body = body).andReturn().response.status)
        }
        verifyNoInteractions(verification)
    }

    @Test fun `public inspection never confirms and completion never issues session in either realm`() {
        for ((path, realm) in listOf(customerPath to RecoveryRealm.CUSTOMER, userPath to RecoveryRealm.USER)) {
            `when`(verification.inspect(realm, token, "127.0.0.1")).thenReturn(EmailVerificationInspection.ready(Instant.parse("2026-11-12T12:30:00Z")))
            `when`(verification.complete(realm, token, "127.0.0.1")).thenReturn(EmailVerificationCompletion.VERIFIED)
            repeat(2) {
                val response = publicPost(path, "inspect").andReturn().response
                assertEquals(200, response.status)
                assertEquals("READY", json(response.contentAsString)["data"]["kind"].asText())
                assertTrue(json(response.contentAsString)["data"].has("expiresAt"))
                assertNull(response.getHeader("Set-Cookie"))
            }
            verify(verification, never()).complete(realm, token, "127.0.0.1")
            assertEquals(405, mvc.perform(get("$path/complete")).andReturn().response.status)
            val response = publicPost(path, "complete").andReturn().response
            assertEquals("VERIFIED", json(response.contentAsString)["data"]["kind"].asText())
            assertEquals("no-store", response.getHeader("Cache-Control"))
            assertNull(response.getHeader("Set-Cookie"))
        }
        verifyNoInteractions(identity, locks)
    }

    @Test fun `terminal and unknown results have no expiry or internal details`() {
        for (state in EmailVerificationStatus.entries.filter { it != EmailVerificationStatus.READY }) {
            `when`(verification.inspect(RecoveryRealm.CUSTOMER, token, "127.0.0.1")).thenReturn(EmailVerificationInspection.terminal(state))
            val response = json(publicPost(customerPath, "inspect").andReturn().response.contentAsString)
            assertEquals(if (state == EmailVerificationStatus.Unknown) "INVALID_LINK" else state.name, response["data"]["kind"].asText())
            assertEquals(setOf("kind"), response["data"].fieldNames().asSequence().toSet())
        }
        for (state in EmailVerificationCompletion.entries) {
            `when`(verification.complete(RecoveryRealm.CUSTOMER, token, "127.0.0.1")).thenReturn(state)
            val response = json(publicPost(customerPath, "complete").andReturn().response.contentAsString)
            assertEquals(if (state == EmailVerificationCompletion.Unknown) "INVALID_LINK" else state.name, response["data"]["kind"].asText())
            assertEquals(setOf("kind"), response["data"].fieldNames().asSequence().toSet())
        }
    }

    @Test fun `public bodies origins and oversized payloads fail closed without token operations`() {
        for (action in listOf("inspect", "complete")) {
            for (body in listOf("{}", "[]", "{\"token\":42}", "{\"token\":null}", "{\"token\":\"x\",\"realm\":\"USER\"}", mapper.writeValueAsString(mapOf("token" to "x".repeat(257))))) {
                assertEquals(400, publicPost(customerPath, action, body).andReturn().response.status)
            }
            assertEquals(403, mvc.perform(post("$customerPath/$action").contentType(MediaType.APPLICATION_JSON).content("{\"token\":\"x\"}")).andReturn().response.status)
            val oversized = publicPost(customerPath, action, mapper.writeValueAsString(mapOf("token" to "x".repeat(5000)))).andReturn().response
            assertEquals(413, oversized.status)
            assertEquals("EMAIL_VERIFICATION_REQUEST_TOO_LARGE", json(oversized.contentAsString)["errorCode"].asText())
            assertEquals("no-store", oversized.getHeader("Cache-Control"))
        }
        verifyNoInteractions(verification)
    }

    @Test fun `unavailability and rate limits are categorical redacted and not accepted`() {
        `when`(verification.request(customer)).thenThrow(EmailVerificationUnavailable())
        val unavailable = request(cookie = customerCookie).andReturn().response
        assertEquals(503, unavailable.status)
        assertEquals("EMAIL_VERIFICATION_UNAVAILABLE", json(unavailable.contentAsString)["errorCode"].asText())
        assertNull(unavailable.getHeader(RequestAuth.CSRF_HEADER))
        `when`(verification.inspect(RecoveryRealm.CUSTOMER, token, "127.0.0.1")).thenThrow(EmailVerificationRateLimited(900))
        val limited = publicPost(customerPath, "inspect").andReturn().response
        assertEquals(429, limited.status)
        assertEquals("900", limited.getHeader("Retry-After"))
        assertEquals("EMAIL_VERIFICATION_RATE_LIMITED", json(limited.contentAsString)["errorCode"].asText())
        assertEquals("no-store", limited.getHeader("Cache-Control"))
        assertFalse(limited.contentAsString.contains(token))
    }

    private fun request(cookie: Cookie? = null, csrf: String? = "csrf", requestOrigin: String? = origin, body: String = "{}"): org.springframework.test.web.servlet.ResultActions {
        val builder = post("$customerPath/requests").contentType(MediaType.APPLICATION_JSON).content(body)
        cookie?.let { builder.cookie(it) }; csrf?.let { builder.header(RequestAuth.CSRF_HEADER, it) }; requestOrigin?.let { builder.header("Origin", it) }
        return mvc.perform(builder)
    }
    private fun publicPost(path: String, action: String, body: String = mapper.writeValueAsString(mapOf("token" to token))) =
        mvc.perform(post("$path/$action").header("Origin", origin).contentType(MediaType.APPLICATION_JSON).content(body))
    private fun json(body: String) = mapper.readTree(body)
    private val customerCookie get() = Cookie(RequestAuth.CUSTOMER_COOKIE, "customer-session")
    private val userCookie get() = Cookie(RequestAuth.INTERNAL_COOKIE, "user-session")
    companion object {
        private const val origin = "https://shop.example.test"
        private const val customerPath = "/api/v1/customer/auth/email-verification"
        private const val userPath = "/api/v1/internal/auth/email-verification"
        private val token = "a".repeat(43)
    }
}
