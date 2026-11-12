package com.storecore.identity.infrastructure

import com.storecore.identity.application.IdentitySmtpTransport
import com.storecore.identity.application.RenderedIdentityMessage
import com.storecore.identity.domain.*
import java.io.*
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.nio.CharBuffer
import java.util.Base64
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

enum class IdentitySmtpTls { STARTTLS, IMPLICIT, Unknown;
    companion object { fun fromWire(raw: String?) = entries.firstOrNull { it != Unknown && it.name == raw } ?: Unknown }
}

/** No provider replies, credentials, addresses or bodies escape this adapter. */
internal interface IdentitySmtpConnection : AutoCloseable {
    fun reply(): Int
    fun write(bytes: ByteArray)
    fun startTls()
}

class SmtpIdentityTransport internal constructor(
    private val settings: IdentityDeliverySettings,
    private val connect: () -> IdentitySmtpConnection,
) : IdentitySmtpTransport {
    constructor(settings: IdentityDeliverySettings) : this(settings, { SocketIdentitySmtpConnection(settings) })

    override fun deliver(message: RenderedIdentityMessage): SmtpDeliveryResult {
        if (settings.tls == IdentitySmtpTls.Unknown || settings.username.isBlank() || settings.password.isBlank() ||
            !IdentityDeliverySettings.validMailbox(settings.sender)) return SmtpDeliveryResult.CONFIGURATION_FAILED
        var position = SmtpProtocolPosition.BEFORE_DATA
        fun result(observation: SmtpObservation) = SmtpResultClassifier.classify(position, observation)
        return try {
            connect().use { connection ->
                fun command(value: String): Int {
                    val bytes = (value + "\r\n").toByteArray(StandardCharsets.UTF_8)
                    return try { connection.write(bytes); connection.reply() } finally { bytes.fill(0) }
                }
                fun rejection(code: Int): SmtpObservation = when (code) {
                    in 400..499 -> SmtpObservation.TRANSIENT_REJECTION
                    in 500..599 -> SmtpObservation.PERMANENT_REJECTION
                    else -> SmtpObservation.Unknown
                }
                var code = connection.reply()
                if (code != 220) return result(rejection(code))
                code = command("EHLO storecore.invalid")
                if (code != 250) return result(rejection(code))
                if (settings.tls == IdentitySmtpTls.STARTTLS) {
                    code = command("STARTTLS")
                    if (code != 220) return result(SmtpObservation.CONFIGURATION_FAILED)
                    connection.startTls()
                    if (command("EHLO storecore.invalid") != 250) return result(SmtpObservation.CONFIGURATION_FAILED)
                }
                // AUTH PLAIN is sent only after a verified TLS handshake.
                val credential = ("\u0000" + settings.username + "\u0000" + settings.password).toByteArray(StandardCharsets.UTF_8)
                val auth = try { Base64.getEncoder().encode(credential) } finally { credential.fill(0) }
                try {
                    val prefix = "AUTH PLAIN ".toByteArray(StandardCharsets.US_ASCII)
                    val line = prefix + auth + byteArrayOf(13, 10)
                    try { connection.write(line) } finally { line.fill(0) }
                } finally { auth.fill(0) }
                code = connection.reply()
                if (code != 235) return result(if (code in 400..499) SmtpObservation.TRANSIENT_REJECTION else SmtpObservation.AUTHENTICATION_FAILED)
                code = command("MAIL FROM:<${settings.sender}>")
                if (code != 250) return result(rejection(code))
                message.useContent { recipient, plain, html ->
                    if (!IdentityDeliverySettings.validMailbox(String(recipient))) return@useContent result(SmtpObservation.CONFIGURATION_FAILED)
                    code = command("RCPT TO:<${String(recipient)}>")
                    if (code != 250 && code != 251) return@useContent result(rejection(code))
                    // Leave BEFORE_DATA *before writing DATA*, even if the write itself fails.
                    position = SmtpProtocolPosition.DATA_STARTED
                    if (command("DATA") != 354) return@useContent result(SmtpObservation.Unknown)
                    val boundary = "storecore-identity-alternative"
                    ErasableMimeBuffer().use { content ->
                        content.header("From: <${settings.sender}>\r\nTo: <")
                        content.chars(recipient); content.header(">\r\nMessage-ID: ${message.messageId}\r\n")
                        content.header("Date: ${java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME.format(java.time.ZonedDateTime.now(java.time.ZoneOffset.UTC))}\r\n")
                        content.header("Subject: =?UTF-8?B?${Base64.getEncoder().encodeToString(message.subject.toByteArray(StandardCharsets.UTF_8))}?=\r\n")
                        content.header("MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=\"$boundary\"\r\n\r\n")
                        fun part(type: String, chars: CharArray) {
                            content.header("--$boundary\r\nContent-Type: $type; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n")
                            content.chars(chars, base64 = true); content.header("\r\n")
                        }
                        part("text/plain", plain); part("text/html", html)
                        content.header("--$boundary--\r\n.\r\n")
                        val bytes = content.toByteArray()
                        try { connection.write(bytes) } finally { bytes.fill(0) }
                    }
                    if (connection.reply() != 250) return@useContent result(SmtpObservation.Unknown)
                    position = SmtpProtocolPosition.FINAL_ACCEPTANCE
                    result(SmtpObservation.ACCEPTED)
                }
            }
        } catch (_: javax.net.ssl.SSLException) {
            result(SmtpObservation.CONFIGURATION_FAILED)
        } catch (_: java.net.SocketTimeoutException) {
            result(SmtpObservation.TIMEOUT)
        } catch (_: IOException) {
            result(SmtpObservation.CONNECTION_LOST)
        } catch (_: Exception) {
            result(SmtpObservation.Unknown)
        }
    }
}

/** Never materializes link plaintext or encoded payload in immutable Strings. */
private class ErasableMimeBuffer : ByteArrayOutputStream() {
    fun header(value: String) { write(value.toByteArray(StandardCharsets.UTF_8)) }
    fun chars(value: CharArray, base64: Boolean = false) {
        val encoded = StandardCharsets.UTF_8.encode(CharBuffer.wrap(value))
        val bytes = ByteArray(encoded.remaining())
        try {
            encoded.get(bytes)
            if (base64) {
                val wire = Base64.getMimeEncoder(76, byteArrayOf(13, 10)).encode(bytes)
                try { write(wire) } finally { wire.fill(0) }
            } else write(bytes)
        } finally { bytes.fill(0); if (encoded.hasArray()) encoded.array().fill(0) }
    }
    override fun close() { buf.fill(0); reset() }
}

/** TLS uses the JVM trust store and HTTPS hostname verification; debug is never enabled. */
private class SocketIdentitySmtpConnection(private val settings: IdentityDeliverySettings) : IdentitySmtpConnection {
    private var socket: Socket = Socket()
    private lateinit var input: InputStream
    // Bound the whole protocol session below the 60-second lease, including slow/trickled replies.
    private val deadline = watchdog.schedule({ try { socket.close() } catch (_: Exception) { } }, 45, TimeUnit.SECONDS)
    init {
        try {
            socket.connect(InetSocketAddress(settings.host, settings.port), IdentityDeliveryPolicy.CONNECT_TIMEOUT.toMillis().toInt())
            socket.soTimeout = IdentityDeliveryPolicy.IO_TIMEOUT.toMillis().toInt()
            input = socket.getInputStream()
            if (settings.tls == IdentitySmtpTls.IMPLICIT) startTls()
        } catch (failure: Exception) { deadline.cancel(false); socket.close(); throw failure }
    }
    override fun startTls() {
        val secured = (SSLSocketFactory.getDefault() as SSLSocketFactory).createSocket(socket, settings.host, settings.port, true) as SSLSocket
        socket = secured
        secured.soTimeout = IdentityDeliveryPolicy.IO_TIMEOUT.toMillis().toInt()
        secured.sslParameters = secured.sslParameters.apply { endpointIdentificationAlgorithm = "HTTPS"; protocols = arrayOf("TLSv1.3", "TLSv1.2") }
        secured.startHandshake()
        input = secured.getInputStream()
    }
    override fun write(bytes: ByteArray) {
        // Socket SO_TIMEOUT covers reads only. Closing the socket bounds blocked writes too.
        val timeout = watchdog.schedule({ try { socket.close() } catch (_: Exception) { } }, IdentityDeliveryPolicy.IO_TIMEOUT.toMillis(), TimeUnit.MILLISECONDS)
        try { socket.getOutputStream().write(bytes); socket.getOutputStream().flush() } finally { timeout.cancel(false) }
    }
    override fun reply(): Int {
        var expected: Int? = null
        repeat(100) {
            val line = ByteArrayOutputStream()
            while (true) {
                val value = input.read()
                if (value < 0) throw EOFException()
                if (value == 10) break
                if (line.size() >= 1024) throw IOException()
                line.write(value)
            }
            val raw = line.toByteArray()
            if (raw.size < 4 || raw[raw.size - 1] != 13.toByte()) throw IOException()
            val code = String(raw, 0, 3, StandardCharsets.US_ASCII).toIntOrNull() ?: throw IOException()
            if (expected != null && expected != code) throw IOException()
            expected = code
            when (raw[3].toInt().toChar()) { ' ' -> return code; '-' -> Unit; else -> throw IOException() }
        }
        throw IOException()
    }
    override fun close() { deadline.cancel(false); try { socket.close() } catch (_: Exception) { } }
    companion object { private val watchdog = Executors.newSingleThreadScheduledExecutor { runnable -> Thread(runnable, "identity-smtp-write-timeout").apply { isDaemon = true } } }
}
