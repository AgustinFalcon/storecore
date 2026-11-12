package com.storecore.identity

import com.storecore.identity.application.RenderedIdentityMessage
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.*
import org.junit.jupiter.api.Test
import kotlin.test.*
import java.io.IOException
import java.net.SocketTimeoutException

class IdentitySmtpTransportTest {
    private fun settings() = IdentityDeliverySettings(host = "smtp.example.test", port = 587, tls = IdentitySmtpTls.STARTTLS,
        username = "fixture-user", password = "fixture-password", sender = "sender@example.test")
    private fun message() = RenderedIdentityMessage("<identity-fixed@example.test>", "Confirmar mi correo",
        "recipient@example.test".toCharArray(), "fixture-link".toCharArray(), "<p>fixture-link</p>".toCharArray())

    private class Connection(private val responses: MutableList<Int>, private val failOn: String? = null) : IdentitySmtpConnection {
        val commands = mutableListOf<String>()
        var tlsStarted = false
        var bodyWritten = false
        override fun reply(): Int {
            if (responses.isEmpty()) throw SocketTimeoutException()
            return responses.removeAt(0)
        }
        override fun write(bytes: ByteArray) {
            val text = String(bytes, Charsets.UTF_8)
            commands.add(text)
            if (text.startsWith("AUTH")) assertTrue(tlsStarted)
            if (text.startsWith("From:")) bodyWritten = true
            if (failOn != null && text.startsWith(failOn)) throw IOException()
        }
        override fun startTls() { tlsStarted = true }
        override fun close() { }
    }
    private fun deliver(connection: Connection) = message().use { SmtpIdentityTransport(settings()) { connection }.deliver(it) }
    private fun successResponses() = mutableListOf(220, 250, 220, 250, 235, 250, 250, 354, 250)

    @Test fun `verified TLS precedes credentials and accepted DATA carries deterministic message ID`() {
        val connection = Connection(successResponses())
        assertEquals(SmtpDeliveryResult.ACCEPTED, deliver(connection))
        val body = connection.commands.single { it.startsWith("From:") }
        assertContains(body, "Message-ID: <identity-fixed@example.test>\r\n")
        assertContains(body, "multipart/alternative")
        assertContains(body, "Content-Transfer-Encoding: base64")
        assertTrue(connection.bodyWritten)
    }
    @Test fun `explicit transient recipient refusal before DATA can retry`() {
        val connection = Connection(mutableListOf(220, 250, 220, 250, 235, 250, 450))
        assertEquals(SmtpDeliveryResult.RETRYABLE_BEFORE_HANDOFF, deliver(connection))
        assertFalse(connection.bodyWritten)
    }
    @Test fun `connect failure is provably before DATA`() {
        message().use { assertEquals(SmtpDeliveryResult.RETRYABLE_BEFORE_HANDOFF,
            SmtpIdentityTransport(settings()) { throw IOException() }.deliver(it)) }
    }
    @Test fun `failure while writing DATA command is uncertain`() {
        assertEquals(SmtpDeliveryResult.ACCEPTANCE_UNCERTAIN, deliver(Connection(successResponses(), "DATA")))
    }
    @Test fun `lost final response is uncertain and sends only once`() {
        val connection = Connection(successResponses().apply { removeAt(lastIndex) })
        assertEquals(SmtpDeliveryResult.ACCEPTANCE_UNCERTAIN, deliver(connection))
        assertEquals(1, connection.commands.count { it.startsWith("From:") })
    }
    @Test fun `negative DATA final response is conservatively uncertain`() {
        assertEquals(SmtpDeliveryResult.ACCEPTANCE_UNCERTAIN, deliver(Connection(successResponses().apply { this[lastIndex] = 451 })))
    }
    @Test fun `authentication rejection is terminal and never sends DATA`() {
        val connection = Connection(mutableListOf(220, 250, 220, 250, 535))
        assertEquals(SmtpDeliveryResult.AUTHENTICATION_FAILED, deliver(connection))
        assertFalse(connection.bodyWritten)
    }
    @Test fun `unknown exception is never guessed retryable`() {
        message().use { assertEquals(SmtpDeliveryResult.ACCEPTANCE_UNCERTAIN,
            SmtpIdentityTransport(settings()) { throw IllegalStateException("fixture") }.deliver(it)) }
    }
}
