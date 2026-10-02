package com.storecore.identity

import com.storecore.identity.application.AuthenticationFailed
import com.storecore.identity.application.AuthorizationDenied
import com.storecore.identity.application.IdentityUseCases
import com.storecore.identity.domain.IdentityRealm
import com.storecore.identity.domain.InternalRole
import com.storecore.identity.domain.InternalUserPrincipal
import com.storecore.identity.infrastructure.persistence.JdbcIdentityService
import com.storecore.identity.infrastructure.security.Argon2PasswordHasher
import com.storecore.identity.infrastructure.security.LoginRateLimiter
import com.storecore.identity.infrastructure.security.OpaqueTokenFactory
import com.storecore.identity.infrastructure.web.InstallationOrigin
import com.storecore.identity.infrastructure.web.RequestAuth
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockHttpServletRequest
import java.util.UUID

class InternalRoleTest {
    @Test
    fun `only exact registered codes decode as known roles`() {
        assertEquals(InternalRole.ADMIN, InternalRole.fromWire("ADMIN"))
        assertEquals(InternalRole.OPERATOR, InternalRole.fromWire("OPERATOR"))
        listOf(null, "", "admin", " ADMIN ", "CUSTOMER", "SUPER_ADMIN", "Unknown").forEach {
            assertEquals(InternalRole.Unknown, InternalRole.fromWire(it))
        }
        assertFalse(InternalRole.hasKnownRole(emptySet()))
        assertFalse(InternalRole.hasKnownRole(setOf(InternalRole.Unknown)))
        assertTrue(InternalRole.hasKnownRole(setOf(InternalRole.Unknown, InternalRole.OPERATOR)))
    }

    @Test
    fun `unknown-only database roles cannot login or authenticate and never issue a session`() {
        val writes = mutableListOf<String>()
        val identity = identity(listOf("SUPER_ADMIN", "admin"), writes)
        assertThrows(AuthenticationFailed::class.java) { identity.login(IdentityRealm.USER, "user@example.test", "valid-long-password") }
        assertThrows(AuthenticationFailed::class.java) { identity.authenticate(IdentityRealm.USER, "opaque-session") }
        assertFalse(writes.any { it.contains("INSERT INTO identity_sessions") })
    }

    @Test
    fun `known and mixed database roles preserve only their known privileges`() {
        listOf(listOf("ADMIN"), listOf("OPERATOR"), listOf("OPERATOR", "SUPER_ADMIN")).forEach { codes ->
            val identity = identity(codes, mutableListOf())
            val authenticated = identity.authenticate(IdentityRealm.USER, "opaque-session") as InternalUserPrincipal
            val issued = identity.login(IdentityRealm.USER, "user@example.test", "valid-long-password").principal as InternalUserPrincipal
            val expected = codes.map { InternalRole.fromWire(it) }.toSet()
            assertEquals(expected, authenticated.roles)
            assertEquals(expected, issued.roles)
            assertTrue(authenticated.hasKnownRole)
        }
    }

    @Test
    fun `unknown cannot establish request identity and operator plus unknown cannot become admin`() {
        val request = MockHttpServletRequest().apply { setCookies(Cookie(RequestAuth.INTERNAL_COOKIE, "opaque")) }
        fun auth(roles: Set<InternalRole>): RequestAuth {
            val identity = mock(IdentityUseCases::class.java) { invocation ->
                if (invocation.method.name == "authenticate") InternalUserPrincipal(UUID.randomUUID(), 1, roles) else null
            }
            return RequestAuth(identity, InstallationOrigin("https://example.test"))
        }
        val unknown = auth(setOf(InternalRole.Unknown))
        assertThrows(AuthenticationFailed::class.java) { unknown.internal(request) }
        assertThrows(AuthenticationFailed::class.java) { unknown.admin(request) }
        assertThrows(AuthenticationFailed::class.java) { unknown.operatorOrAdmin(request) }
        val mixed = auth(setOf(InternalRole.OPERATOR, InternalRole.Unknown))
        assertEquals(1L, mixed.operatorOrAdmin(request).userId)
        assertThrows(AuthorizationDenied::class.java) { mixed.admin(request) }
        assertEquals(1L, auth(setOf(InternalRole.ADMIN, InternalRole.Unknown)).admin(request).userId)
    }

    private fun identity(codes: List<String>, writes: MutableList<String>): JdbcIdentityService {
        val sessionId = UUID.randomUUID()
        val jdbc = mock(JdbcTemplate::class.java) { invocation ->
            val sql = invocation.arguments.firstOrNull() as? String ?: ""
            when (invocation.method.name) {
                "queryForList" -> when {
                    sql.contains("SELECT r.code") -> codes.map { mapOf("code" to it) }
                    sql.contains("FROM identity_sessions s") -> listOf(mapOf("id" to sessionId.toString(), "user_id" to 1L))
                    sql.contains("FROM users WHERE email") -> listOf(mapOf("id" to 1L, "password_hash" to "test-hash", "active" to true))
                    else -> error("Unexpected query: $sql")
                }
                "update" -> { writes.add(sql); 1 }
                else -> null
            }
        }
        val passwords = mock(Argon2PasswordHasher::class.java) { invocation ->
            if (invocation.method.name == "verify") true else null
        }
        return JdbcIdentityService(jdbc, passwords, OpaqueTokenFactory(), LoginRateLimiter())
    }
}
