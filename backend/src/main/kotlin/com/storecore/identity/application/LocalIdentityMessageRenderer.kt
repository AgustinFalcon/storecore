package com.storecore.identity.application

import com.storecore.identity.domain.*
import java.net.URI
import java.util.UUID

private enum class IdentityLocalTemplate(val path: String, val title: String) {
    VERIFY("/verify-email", "Confirmar mi correo"), RECOVER("/reset-password", "Restablecer mi contraseña");

    companion object {
        fun forKind(kind: IdentityMessageKind): IdentityLocalTemplate = when (kind) {
            IdentityMessageKind.EMAIL_VERIFICATION -> VERIFY
            IdentityMessageKind.PASSWORD_RECOVERY -> RECOVER
            IdentityMessageKind.Unknown -> error("UNKNOWN_MESSAGE_KIND")
        }
    }
}

/** Buffers are cleared after transport returns, including exceptional returns. */
class RenderedIdentityMessage internal constructor(
    val messageId: String, val subject: String,
    private val recipient: CharArray, private val text: CharArray, private val html: CharArray,
) : AutoCloseable {
    private var closed = false
    @Synchronized fun <T> useContent(action: (CharArray, CharArray, CharArray) -> T): T {
        check(!closed) { "MESSAGE_CLOSED" }
        val destination = recipient.copyOf(); val plain = text.copyOf(); val rich = html.copyOf()
        return try { action(destination, plain, rich) } finally { destination.fill('\u0000'); plain.fill('\u0000'); rich.fill('\u0000') }
    }
    @Synchronized override fun close() { recipient.fill('\u0000'); text.fill('\u0000'); html.fill('\u0000'); closed = true }
    override fun toString() = "RenderedIdentityMessage(REDACTED)"
}

class LocalIdentityMessageRenderer(origin: String) {
    private val base: String
    private val messageIdDomain: String
    init {
        val uri = try { URI(origin) } catch (_: Exception) { throw IllegalArgumentException("INVALID_DELIVERY_ORIGIN") }
        require(uri.scheme == "https" && uri.host != null && uri.rawUserInfo == null &&
            uri.rawQuery == null && uri.rawFragment == null && (uri.rawPath.isNullOrEmpty() || uri.rawPath == "/") &&
            (uri.port == -1 || uri.port in 1..65535)) { "INVALID_DELIVERY_ORIGIN" }
        base = origin.removeSuffix("/")
        messageIdDomain = uri.host
    }
    fun messageId(eventId: UUID) = "<identity-$eventId@$messageIdDomain>"

    fun render(eventId: UUID, payload: IdentityMessagePayload): RenderedIdentityMessage {
        val realm = when (payload.realm) { RecoveryRealm.CUSTOMER -> "customer"; RecoveryRealm.USER -> "user"; RecoveryRealm.Unknown -> error("UNKNOWN_MESSAGE_REALM") }
        val template = IdentityLocalTemplate.forKind(payload.kind)
        val title = template.title
        return payload.usePlaintext { recipient, secret ->
            // Only the configured origin and local routes are rendered; user content never selects HTML or URLs.
            val prefix = "$base${template.path}#realm=$realm&token="
            val link = prefix.toCharArray() + secret
            val escaped = escapeHtml(link)
            try {
                val plain = combine("$title\n".toCharArray(), link, "\nEste enlace vence el ${payload.expiresAt}. Si no lo solicitaste, ignorá este correo.".toCharArray())
                val html = combine("<!doctype html><html lang=\"es\"><body><p>".toCharArray(), title.toCharArray(),
                    "</p><p><a href=\"".toCharArray(), escaped, "\">".toCharArray(), title.toCharArray(),
                    "</a></p><p>Si no lo solicitaste, ignorá este correo.</p></body></html>".toCharArray())
                RenderedIdentityMessage(messageId(eventId), title, recipient.copyOf(), plain, html)
            } finally { link.fill('\u0000'); escaped.fill('\u0000') }
        }
    }

    private fun combine(vararg parts: CharArray): CharArray {
        val result = CharArray(parts.sumOf { it.size })
        var offset = 0
        parts.forEach { it.copyInto(result, offset); offset += it.size }
        return result
    }

    private fun escapeHtml(value: CharArray): CharArray {
        val buffer = CharArray(value.size * 6)
        var offset = 0
        try {
            value.forEach { char ->
                val replacement = when (char) { '&' -> "&amp;"; '<' -> "&lt;"; '>' -> "&gt;"; '"' -> "&quot;"; '\'' -> "&#39;"; else -> null }
                if (replacement == null) buffer[offset++] = char else replacement.forEach { buffer[offset++] = it }
            }
            return buffer.copyOf(offset)
        } finally { buffer.fill('\u0000') }
    }
}
