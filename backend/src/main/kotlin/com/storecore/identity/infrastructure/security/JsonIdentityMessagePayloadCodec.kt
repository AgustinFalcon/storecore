package com.storecore.identity.infrastructure.security

import com.fasterxml.jackson.core.JsonFactory
import com.fasterxml.jackson.core.JsonParser
import com.fasterxml.jackson.core.JsonToken
import com.storecore.identity.domain.*
import java.io.ByteArrayOutputStream
import java.time.Instant

/** A single versioned JSON boundary; no data binding or secret-bearing String properties. */
class JsonIdentityMessagePayloadCodec : IdentityMessagePayloadCodec {
    private val factory = JsonFactory().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)

    override fun encode(payload: IdentityMessagePayload): IdentitySecretBytes {
        val output = ErasableOutput()
        return try {
            factory.createGenerator(output).use { json ->
                json.writeStartObject()
                json.writeNumberField("version", 1)
                payload.usePlaintext { recipient, secret ->
                    json.writeFieldName("recipient"); json.writeString(recipient, 0, recipient.size)
                    json.writeStringField("realm", payload.realm.name)
                    json.writeStringField("kind", payload.kind.name)
                    json.writeFieldName("secret"); json.writeString(secret, 0, secret.size)
                }
                json.writeStringField("expiresAt", payload.expiresAt.toString())
                json.writeEndObject()
            }
            val bytes = output.toByteArray()
            try { IdentitySecretBytes(bytes) } finally { bytes.fill(0) }
        } catch (_: Exception) { throw IdentityMessageCryptoFailure() }
        finally { output.erase() }
    }

    override fun decode(plaintext: IdentitySecretBytes): IdentityMessagePayload = plaintext.useBytes { bytes ->
        var recipient: CharArray? = null
        var secret: CharArray? = null
        try {
            if (bytes.size > 8192) throw IdentityMessageCryptoFailure()
            factory.createParser(bytes).use { json ->
                if (json.nextToken() != JsonToken.START_OBJECT) throw IdentityMessageCryptoFailure()
                val fields = mutableSetOf<String>()
                var version: Int? = null
                var realm = RecoveryRealm.Unknown
                var kind = IdentityMessageKind.Unknown
                var expiresAt: Instant? = null
                while (json.nextToken() != JsonToken.END_OBJECT) {
                    if (json.currentToken != JsonToken.FIELD_NAME) throw IdentityMessageCryptoFailure()
                    val field = json.currentName
                    fields.add(field)
                    val token = json.nextToken()
                    when (field) {
                        "version" -> { if (token != JsonToken.VALUE_NUMBER_INT) throw IdentityMessageCryptoFailure(); version = json.intValue }
                        "recipient" -> { requireString(token); recipient = copyChars(json) }
                        "secret" -> { requireString(token); secret = copyChars(json) }
                        "realm" -> { requireString(token); realm = RecoveryRealm.fromWire(json.text) }
                        "kind" -> { requireString(token); kind = IdentityMessageKind.fromWire(json.text) }
                        "expiresAt" -> { requireString(token); expiresAt = Instant.parse(json.text) }
                        else -> throw IdentityMessageCryptoFailure()
                    }
                }
                if (json.nextToken() != null || version != 1 || fields != setOf("version", "recipient", "realm", "kind", "secret", "expiresAt")) throw IdentityMessageCryptoFailure()
                IdentityMessagePayload(recipient ?: throw IdentityMessageCryptoFailure(), realm, kind,
                    secret ?: throw IdentityMessageCryptoFailure(), expiresAt ?: throw IdentityMessageCryptoFailure())
            }
        } catch (_: Exception) { throw IdentityMessageCryptoFailure() }
        finally { recipient?.fill('\u0000'); secret?.fill('\u0000') }
    }

    private fun requireString(token: JsonToken?) { if (token != JsonToken.VALUE_STRING) throw IdentityMessageCryptoFailure() }
    private fun copyChars(json: JsonParser): CharArray = json.textCharacters.copyOfRange(json.textOffset, json.textOffset + json.textLength)
    private class ErasableOutput : ByteArrayOutputStream() { fun erase() { buf.fill(0); reset() } }
}
