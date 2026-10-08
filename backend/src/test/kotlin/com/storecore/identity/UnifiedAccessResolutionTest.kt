package com.storecore.identity

import com.storecore.identity.application.UnifiedAccessResolver
import com.storecore.identity.domain.*
import org.junit.jupiter.api.Test
import kotlin.test.*
import java.time.Instant
import java.util.UUID

class UnifiedAccessResolutionTest {
    private val resolver = UnifiedAccessResolver()
    private val customer = VerifiedAccessCandidate.Customer(12)
    private val user = VerifiedAccessCandidate.User(34, setOf(InternalRole.OPERATOR))

    @Test
    fun `zero eligible candidates reject without an effect`() {
        assertEquals(CandidateResolution.Rejected, resolver.resolve(emptyList(), ReturnDestination.HOME))
        assertEquals(CandidateResolution.Rejected, resolver.resolve(listOf(VerifiedAccessCandidate.User(34, setOf(InternalRole.Unknown))), ReturnDestination.HOME))
        assertEquals(CandidateResolution.Rejected, resolver.resolve(listOf(VerifiedAccessCandidate.Customer(0)), ReturnDestination.HOME))
    }

    @Test
    fun `single customer and user resolve independently with compatible destinations`() {
        val customerResolution = assertIs<CandidateResolution.Single>(resolver.resolve(listOf(customer), ReturnDestination.CUSTOMER_PROFILE))
        assertSame(customer, customerResolution.candidate)
        assertEquals(ReturnDestination.CUSTOMER_PROFILE, customerResolution.destination)
        val userResolution = assertIs<CandidateResolution.Single>(resolver.resolve(listOf(user), ReturnDestination.CUSTOMER_ORDERS))
        assertSame(user, userResolution.candidate)
        assertEquals(ReturnDestination.HOME, userResolution.destination)
    }

    @Test
    fun `roleless user does not prevent valid customer login`() {
        val roleless = VerifiedAccessCandidate.User(34, emptySet())
        assertSame(customer, assertIs<CandidateResolution.Single>(resolver.resolve(listOf(customer, roleless), ReturnDestination.HOME)).candidate)
    }

    @Test
    fun `both verified candidates require selection regardless of input order`() {
        listOf(listOf(customer, user), listOf(user, customer)).forEach { candidates ->
            val resolution = assertIs<CandidateResolution.SelectionRequired>(resolver.resolve(candidates, ReturnDestination.USER_ORDERS))
            assertSame(customer, resolution.customer)
            assertSame(user, resolution.user)
            assertEquals(ReturnDestination.USER_ORDERS, resolution.destination)
        }
    }

    @Test
    fun `duplicate realm candidates reject rather than silently choose an identity`() {
        assertEquals(CandidateResolution.Rejected, resolver.resolve(listOf(customer, customer), ReturnDestination.HOME))
        assertEquals(CandidateResolution.Rejected, resolver.resolve(listOf(user, user, customer), ReturnDestination.HOME))
    }

    @Test
    fun `candidate role snapshot cannot be changed by the caller`() {
        val roles = mutableSetOf(InternalRole.OPERATOR)
        val candidate = VerifiedAccessCandidate.User(34, roles)
        roles.clear()
        assertTrue(candidate.eligible)
        assertEquals(setOf(InternalRole.OPERATOR), candidate.roles)
    }

    @Test
    fun `issued resolution derives context and home from principal and does not print secrets`() {
        val credentials = IssuedCredentials(InternalUserPrincipal(UUID.randomUUID(), 34, setOf(InternalRole.ADMIN)), "private-session", "private-csrf")
        val result = LoginResolution.Authenticated(credentials, ReturnDestination.CUSTOMER_PROFILE)
        assertEquals(AccessContext.USER, result.context)
        assertEquals(AccessHome.OPERATIONS, result.home)
        assertEquals(ReturnDestination.HOME, result.destination)
        assertFalse(result.toString().contains("private-"))
        val challenge = LoginResolution.ContextSelectionRequired("private-challenge", "private-binding", Instant.parse("2026-10-06T00:02:00Z"), ReturnDestination.HOME)
        assertEquals(listOf(AccessContext.CUSTOMER, AccessContext.USER), challenge.contexts)
        assertFalse(challenge.toString().contains("private-challenge"))
        assertFalse(challenge.toString().contains("private-binding"))
    }
}
