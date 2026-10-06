package com.storecore.identity.infrastructure.web

import com.storecore.identity.application.ClientAddressRejected
import jakarta.servlet.http.HttpServletRequest
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.net.InetAddress
import java.util.Collections

/** Resolves a client address without trusting forwarding headers from arbitrary peers. */
@Component
@ConditionalOnProperty(name = ["storecore.identity.enabled"], havingValue = "true", matchIfMissing = true)
class ClientAddressResolver(
    @Value("\${storecore.identity.trusted-proxies:}") trustedProxyWire: String,
) {
    private val trustedProxies = trustedProxyWire.split(',')
        .map(String::trim)
        .filter(String::isNotEmpty)
        .map(TrustedNetwork::fromWire)

    fun resolve(request: HttpServletRequest): String {
        val peer = IpLiteral.fromWire(request.remoteAddr) ?: throw ClientAddressRejected()
        if (!isTrusted(peer)) return peer.canonical

        val forwarded = request.singleHeader("Forwarded")
        val xForwardedFor = request.singleHeader("X-Forwarded-For")
        if (forwarded != null && xForwardedFor != null) throw ClientAddressRejected()
        val chain = when {
            forwarded != null -> parseForwarded(forwarded)
            xForwardedFor != null -> parseXForwardedFor(xForwardedFor)
            else -> throw ClientAddressRejected()
        }
        if (chain.isEmpty() || chain.size > MAX_HOPS) throw ClientAddressRejected()

        var boundary = peer
        chain.asReversed().forEach { hop ->
            if (!isTrusted(boundary)) return boundary.canonical
            boundary = hop
        }
        return boundary.canonical
    }

    private fun isTrusted(address: IpLiteral): Boolean = trustedProxies.any { it.contains(address) }

    private fun parseXForwardedFor(value: String): List<IpLiteral> = bounded(value)
        .split(',')
        .map { IpLiteral.fromWire(it.trim()) ?: throw ClientAddressRejected() }

    private fun parseForwarded(value: String): List<IpLiteral> = bounded(value).split(',').map { element ->
        val forValues = element.split(';').map(String::trim).mapNotNull { parameter ->
            val separator = parameter.indexOf('=')
            if (separator <= 0 || !parameter.substring(0, separator).trim().equals("for", ignoreCase = true)) null
            else parameter.substring(separator + 1).trim()
        }
        if (forValues.size != 1) throw ClientAddressRejected()
        val token = forValues.single().removeSurrounding("\"")
        val host = forwardedHost(token)
        IpLiteral.fromWire(host) ?: throw ClientAddressRejected()
    }

    private fun forwardedHost(token: String): String {
        if (token.startsWith('[')) {
            val closingBracket = token.indexOf(']')
            if (closingBracket <= 1) throw ClientAddressRejected()
            val suffix = token.substring(closingBracket + 1)
            if (suffix.isNotEmpty() && !validPortSuffix(suffix)) throw ClientAddressRejected()
            return token.substring(1, closingBracket)
        }
        if (token.count { it == ':' } == 1 && IpLiteral.fromWire(token.substringBeforeLast(':'))?.bytes?.size == 4) {
            if (!validPortSuffix(token.substringAfterLast(':').let { ":$it" })) throw ClientAddressRejected()
            return token.substringBeforeLast(':')
        }
        return token
    }

    private fun validPortSuffix(value: String): Boolean =
        value.startsWith(':') && value.length > 1 && value.substring(1).all(Char::isDigit) &&
            value.substring(1).toIntOrNull()?.let { it in 1..65535 } == true

    private fun bounded(value: String): String = value.takeIf { it.length <= MAX_HEADER_LENGTH } ?: throw ClientAddressRejected()

    private fun HttpServletRequest.singleHeader(name: String): String? {
        val values = Collections.list(getHeaders(name)).filter(String::isNotBlank)
        if (values.size > 1) throw ClientAddressRejected()
        return values.singleOrNull()
    }

    private data class IpLiteral(val bytes: ByteArray, val canonical: String) {
        companion object {
            fun fromWire(value: String?): IpLiteral? {
                val wire = value?.trim()?.takeIf(String::isNotEmpty) ?: return null
                val isIpv4 = wire.matches(Regex("(?:\\d{1,3}\\.){3}\\d{1,3}"))
                val isIpv6 = ':' in wire && wire.matches(Regex("[0-9A-Fa-f:.]+"))
                if (!isIpv4 && !isIpv6) return null
                val parsed = runCatching { InetAddress.getByName(wire) }.getOrNull() ?: return null
                if (isIpv4 && parsed.address.size != 4) return null
                return IpLiteral(parsed.address, parsed.hostAddress.lowercase())
            }
        }
    }

    private data class TrustedNetwork(val network: ByteArray, val prefixBits: Int) {
        fun contains(address: IpLiteral): Boolean {
            if (address.bytes.size != network.size) return false
            val fullBytes = prefixBits / 8
            val remainingBits = prefixBits % 8
            if ((0 until fullBytes).any { address.bytes[it] != network[it] }) return false
            if (remainingBits == 0) return true
            val mask = (0xff shl (8 - remainingBits)) and 0xff
            return (address.bytes[fullBytes].toInt() and mask) == (network[fullBytes].toInt() and mask)
        }

        companion object {
            fun fromWire(value: String): TrustedNetwork {
                val address = IpLiteral.fromWire(value.substringBefore('/'))
                    ?: throw IllegalArgumentException("Invalid trusted proxy network")
                val maximum = address.bytes.size * 8
                val prefix = value.substringAfter('/', maximum.toString()).toIntOrNull()
                    ?.takeIf { it in 0..maximum } ?: throw IllegalArgumentException("Invalid trusted proxy prefix")
                return TrustedNetwork(address.bytes, prefix)
            }
        }
    }

    private companion object {
        const val MAX_HOPS = 16
        const val MAX_HEADER_LENGTH = 2048
    }
}
