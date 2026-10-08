package com.storecore.identity

import com.storecore.identity.application.*
import com.storecore.identity.infrastructure.UnifiedAccessCoordinator
import com.storecore.identity.infrastructure.persistence.JdbcIdentityService
import com.storecore.identity.infrastructure.security.*
import com.storecore.identity.infrastructure.web.*
import org.mockito.Mockito.*
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpServletRequest
import org.springframework.transaction.support.TransactionTemplate
import kotlin.test.*

/** Real endpoint/use-case wiring; JDBC/password work substituted, no DB claim. */
class CredentialEndpointBudgetTest {
    private class Fixture {
        val passwords = mock(Argon2PasswordHasher::class.java)
        val credentialBudget = LoginAttemptBudget()
        val selectionBudget = ChallengeAttemptBudget()
        val tokens = OpaqueTokenFactory()
        val limiter = LoginRateLimiter()
        val identity = JdbcIdentityService(mock(JdbcTemplate::class.java), passwords, tokens, limiter, credentialBudget)
        val transactions = mock(TransactionTemplate::class.java)
        val coordinator = UnifiedAccessCoordinator(identity, identity, mock(AccessChallengePort::class.java),
            UnifiedAccessResolver(), credentialBudget, limiter, selectionBudget, tokens, transactions)
        val origin = InstallationOrigin("https://shop.example")
        val auth = RequestAuth(identity, origin)
        val cookies = IdentityCookieWriter()
        val addresses = ClientAddressResolver("10.0.0.0/8")
        val unified = UnifiedAccessController(coordinator, auth, cookies, addresses)
        val legacy = IdentityController(identity, IdentityMutationCoordinator(transactions, identity), auth, cookies, addresses)
        fun request(proxy: Boolean) = MockHttpServletRequest().apply {
            remoteAddr = if (proxy) "10.0.0.1" else "127.0.0.1"
            addHeader("Origin", "https://shop.example")
            addHeader("X-Forwarded-For", if (proxy) "127.0.0.1" else "198.51.100.9")
        }
        fun firstFive() {
            val email = "person@example.com"
            assertFailsWith<AuthenticationFailed> { unified.login(request(false), UnifiedLoginRequest(" PERSON@EXAMPLE.COM ", "wrong-password-xx")) }
            assertFailsWith<AuthenticationFailed> { legacy.loginCustomer(request(true), LoginRequest(email, "wrong-password-xx")) }
            assertFailsWith<AuthenticationFailed> { legacy.loginInternal(request(false), LoginRequest("ＰＥＲＳＯＮ@example.com", "wrong-password-xx")) }
            assertFailsWith<AuthenticationFailed> { unified.login(request(true), UnifiedLoginRequest(email, "wrong-password-xx")) }
            assertFailsWith<AuthenticationFailed> { legacy.loginCustomer(request(false), LoginRequest(email, "wrong-password-xx")) }
        }
    }

    @Test fun `three credential endpoints share five slots under one canonical source before password work`() {
        val fixture = Fixture()
        fixture.firstFive()
        assertFailsWith<LoginRateLimited> {
            fixture.legacy.loginInternal(fixture.request(true), LoginRequest("person@example.com", "wrong-password-xx"))
        }
        verify(fixture.passwords, times(7)).dummyVerify(any(CharArray::class.java) ?: charArrayOf())
    }

    @Test fun `context selection exhaustion cannot consume or reset the shared credential budget`() {
        val fixture = Fixture()
        repeat(10) {
            assertFailsWith<AccessChallengeRejected> {
                fixture.coordinator.select("random-challenge-$it", "missing-binding", "UNKNOWN", "127.0.0.1", "https://shop.example")
            }
        }
        fixture.firstFive()
        assertFailsWith<LoginRateLimited> {
            fixture.unified.login(fixture.request(false), UnifiedLoginRequest("person@example.com", "wrong-password-xx"))
        }
        verify(fixture.passwords, times(7)).dummyVerify(any(CharArray::class.java) ?: charArrayOf())
    }
}
