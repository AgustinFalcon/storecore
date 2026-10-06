package com.storecore.identity

import com.storecore.identity.application.ClientAddressRejected
import com.storecore.identity.infrastructure.web.ClientAddressResolver
import org.junit.jupiter.api.assertThrows
import org.springframework.mock.web.MockHttpServletRequest
import kotlin.test.Test
import kotlin.test.assertEquals

class ClientAddressResolverTest {
    private val resolver = ClientAddressResolver("10.0.0.0/8,2001:db8:1::/48")

    @Test
    fun `direct clients cannot forge forwarding headers`() {
        val request = request("203.0.113.7", "X-Forwarded-For" to "198.51.100.4")
        assertEquals("203.0.113.7", resolver.resolve(request))
    }

    @Test
    fun `trusted proxy resolves a single forwarded client`() {
        assertEquals("198.51.100.4", resolver.resolve(request("10.0.0.4", "X-Forwarded-For" to "198.51.100.4")))
    }

    @Test
    fun `two clients behind one trusted proxy keep distinct budget identities`() {
        val first = resolver.resolve(request("10.0.0.4", "X-Forwarded-For" to "198.51.100.4"))
        val second = resolver.resolve(request("10.0.0.4", "X-Forwarded-For" to "198.51.100.5"))
        assertEquals("198.51.100.4", first)
        assertEquals("198.51.100.5", second)
    }

    @Test
    fun `trusted proxy walks trusted hops from the right`() {
        val request = request("10.0.0.4", "X-Forwarded-For" to "198.51.100.4, 10.0.0.3")
        assertEquals("198.51.100.4", resolver.resolve(request))
    }

    @Test
    fun `untrusted intermediate is the client boundary and hides earlier spoofed values`() {
        val request = request("10.0.0.4", "X-Forwarded-For" to "198.51.100.4, 192.0.2.9, 10.0.0.3")
        assertEquals("192.0.2.9", resolver.resolve(request))
    }

    @Test
    fun `forwarded header accepts a strict ipv6 literal`() {
        val request = request("10.0.0.4", "Forwarded" to "for=\"[2001:db8::8]:443\";proto=https")
        assertEquals("2001:db8:0:0:0:0:0:8", resolver.resolve(request))
    }

    @Test
    fun `trusted proxy rejects ambiguous or missing evidence`() {
        assertThrows<ClientAddressRejected> { resolver.resolve(request("10.0.0.4")) }
        assertThrows<ClientAddressRejected> {
            resolver.resolve(request("10.0.0.4", "Forwarded" to "for=198.51.100.4", "X-Forwarded-For" to "198.51.100.4"))
        }
        assertThrows<ClientAddressRejected> {
            resolver.resolve(request("10.0.0.4", "X-Forwarded-For" to "198.51.100.4", "X-Forwarded-For" to "198.51.100.5"))
        }
        assertThrows<ClientAddressRejected> { resolver.resolve(request("10.0.0.4", "X-Forwarded-For" to "not-an-ip")) }
        assertThrows<ClientAddressRejected> { resolver.resolve(request("10.0.0.4", "Forwarded" to "for=\"[2001:db8::8\"")) }
        assertThrows<ClientAddressRejected> { resolver.resolve(request("10.0.0.4", "Forwarded" to "for=198.51.100.4:")) }
        assertThrows<ClientAddressRejected> { resolver.resolve(request("10.0.0.4", "Forwarded" to "for=\"[2001:db8::8]:99999\"")) }
        assertThrows<ClientAddressRejected> { resolver.resolve(request("10.0.0.4", "Forwarded" to "for=198.51.100.4:99999")) }
    }

    private fun request(remoteAddress: String, vararg headers: Pair<String, String>) = MockHttpServletRequest().apply {
        remoteAddr = remoteAddress
        headers.forEach { (name, value) -> addHeader(name, value) }
    }
}
