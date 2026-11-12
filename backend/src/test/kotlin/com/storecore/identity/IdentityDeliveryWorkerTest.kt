package com.storecore.identity

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class IdentityDeliveryWorkerTest {
    private val now = Instant.parse("2026-11-12T12:00:00Z")
    private val id = UUID.fromString("12345678-1234-1234-1234-123456789abc")
    private val owner = UUID.randomUUID()
    private val secret = "a".repeat(43)
    private val expires = now.plusSeconds(1800)
    private val policy = IdentityDeliveryPolicy { 0.5 }
    private val renderer = LocalIdentityMessageRenderer("https://shop.example.test")

    @Test fun `only positive pre DATA evidence retries and all ambiguous positions fail closed`() {
        SmtpProtocolPosition.entries.forEach { position -> SmtpObservation.entries.forEach { observation ->
            val result = SmtpResultClassifier.classify(position, observation)
            if (result == SmtpDeliveryResult.RETRYABLE_BEFORE_HANDOFF) {
                assertEquals(SmtpProtocolPosition.BEFORE_DATA, position)
                assertTrue(observation in setOf(SmtpObservation.TRANSIENT_REJECTION, SmtpObservation.CONNECTION_FAILED, SmtpObservation.CONNECTION_LOST, SmtpObservation.TIMEOUT))
            }
            if (position in setOf(SmtpProtocolPosition.DATA_STARTED, SmtpProtocolPosition.Unknown)) assertEquals(SmtpDeliveryResult.ACCEPTANCE_UNCERTAIN, result)
            if (result == SmtpDeliveryResult.ACCEPTED) {
                assertEquals(SmtpProtocolPosition.FINAL_ACCEPTANCE, position)
                assertEquals(SmtpObservation.ACCEPTED, observation)
            }
        } }
        assertEquals(SmtpDeliveryResult.AUTHENTICATION_FAILED, SmtpResultClassifier.classify(SmtpProtocolPosition.BEFORE_DATA, SmtpObservation.AUTHENTICATION_FAILED))
        assertEquals(SmtpDeliveryResult.PERMANENT_REJECTION, SmtpResultClassifier.classify(SmtpProtocolPosition.BEFORE_DATA, SmtpObservation.PERMANENT_REJECTION))
        assertEquals(SmtpDeliveryResult.ACCEPTANCE_UNCERTAIN, SmtpResultClassifier.classify(SmtpProtocolPosition.FINAL_ACCEPTANCE, SmtpObservation.TIMEOUT))
    }

    @Test fun `backoff is bounded at exact jitter extremes and fifth attempt is terminal`() {
        listOf(30L, 120L, 600L, 1800L).forEachIndexed { index, seconds ->
            listOf(0.0 to 0.8, 0.5 to 1.0, 1.0 to 1.2).forEach { (sample, multiplier) ->
                val settled = IdentityDeliveryPolicy { sample }.settle(SmtpDeliveryResult.RETRYABLE_BEFORE_HANDOFF, index + 1, now)
                assertEquals(now.plusMillis((seconds * 1000 * multiplier).toLong()), settled.retryAt)
                assertFalse(settled.destroySecret)
            }
        }
        val dead = policy.settle(SmtpDeliveryResult.RETRYABLE_BEFORE_HANDOFF, 5, now)
        assertEquals(IdentityOutboxState.DEAD, dead.state)
        assertTrue(dead.destroySecret)
        assertNull(dead.retryAt)
        assertThrows(IllegalArgumentException::class.java) { IdentityDeliveryPolicy { Double.NaN }.settle(SmtpDeliveryResult.RETRYABLE_BEFORE_HANDOFF, 1, now) }
    }

    @Test fun `expired leases retry only when durable handoff was never started`() {
        assertEquals(IdentityOutboxState.RETRY, policy.recoverExpiredLease(IdentityHandoffProgress.NOT_STARTED, 1, now).state)
        listOf(IdentityHandoffProgress.STARTED, IdentityHandoffProgress.Unknown).forEach {
            val settlement = policy.recoverExpiredLease(it, 1, now)
            assertEquals(IdentityOutboxState.UNCERTAIN, settlement.state)
            assertTrue(settlement.destroySecret)
        }
    }

    @Test fun `worker leases revalidates records handoff and sends only once after restart`() {
        val fixture = Fixture()
        assertEquals(IdentityDeliveryRun.SETTLED, fixture.worker.runOnce(owner))
        assertEquals(listOf("acquire", "decrypt", "decode", "revalidate", "begin", "smtp", "settle"), fixture.calls)
        assertEquals(Duration.ofSeconds(60), fixture.requestedLease)
        assertEquals(IdentityOutboxState.SENT, fixture.settlement!!.state)
        assertTrue(fixture.settlement!!.destroySecret)
        assertEquals(IdentityDeliveryRun.IDLE, fixture.worker.runOnce(UUID.randomUUID()))
        assertEquals(1, fixture.sends)
        assertThrows(IllegalStateException::class.java) { fixture.decoded!!.usePlaintext { _, _ -> Unit } }
        assertThrows(IllegalStateException::class.java) { fixture.rendered!!.useContent { _, _, _ -> Unit } }
    }

    @Test fun `post DATA response loss is terminal uncertain and never resent`() {
        val fixture = Fixture(transport = { throw IllegalStateException("secret=$secret recipient=private@example.test") })
        fixture.worker.runOnce(owner)
        assertEquals(IdentityOutboxState.UNCERTAIN, fixture.settlement!!.state)
        assertTrue(fixture.settlement!!.destroySecret)
        fixture.worker.runOnce(owner)
        assertEquals(1, fixture.sends)
        assertEquals(listOf(IdentityOutboxState.UNCERTAIN to IdentityDeliveryError.SMTP_UNCERTAIN), fixture.observations)
        assertFalse(fixture.rendered.toString().contains(secret))
        assertFalse(fixture.decoded.toString().contains("private"))
    }

    @Test fun `explicit pre DATA transient schedules retry without destroying secret`() {
        val fixture = Fixture(transport = { SmtpResultClassifier.classify(SmtpProtocolPosition.BEFORE_DATA, SmtpObservation.TRANSIENT_REJECTION) })
        fixture.worker.runOnce(owner)
        assertEquals(IdentityOutboxState.RETRY, fixture.settlement!!.state)
        assertEquals(now.plusSeconds(30), fixture.settlement!!.retryAt)
        assertFalse(fixture.settlement!!.destroySecret)
    }

    @Test fun `invalidated expired and unknown eligibility never hand off`() {
        listOf(IdentityDeliveryEligibility.INVALIDATED, IdentityDeliveryEligibility.EXPIRED, IdentityDeliveryEligibility.Unknown).forEach {
            val fixture = Fixture(eligibility = it)
            fixture.worker.runOnce(owner)
            assertEquals(IdentityOutboxState.CANCELLED, fixture.settlement!!.state)
            assertEquals(0, fixture.sends)
            assertFalse("begin" in fixture.calls)
            assertTrue(fixture.settlement!!.destroySecret)
        }
    }

    @Test fun `lost lease at revalidation handoff or settle cannot publish successful observation`() {
        listOf(Fixture(eligibility = IdentityDeliveryEligibility.LEASE_LOST), Fixture(begin = false), Fixture(commit = false)).forEach {
            assertEquals(IdentityDeliveryRun.LEASE_LOST, it.worker.runOnce(owner))
            assertTrue(it.observations.isEmpty())
            if (!it.commit) assertEquals(1, it.sends) else assertEquals(0, it.sends)
        }
    }

    @Test fun `decryption failure and mismatched payload are terminal without SMTP`() {
        listOf(Fixture(decryptFailure = true), Fixture(payloadRealm = RecoveryRealm.USER), Fixture(payloadKind = IdentityMessageKind.PASSWORD_RECOVERY)).forEach {
            it.worker.runOnce(owner)
            assertEquals(IdentityOutboxState.DEAD, it.settlement!!.state)
            assertEquals(IdentityDeliveryError.PAYLOAD_INVALID, it.settlement!!.error)
            assertEquals(0, it.sends)
        }
    }

    @Test fun `all results produce correct terminal erasure and observers cannot change settlement`() {
        SmtpDeliveryResult.entries.filter { it != SmtpDeliveryResult.RETRYABLE_BEFORE_HANDOFF }.forEach { result ->
            val fixture = Fixture(transport = { result }, observerFailure = true)
            fixture.worker.runOnce(owner)
            assertEquals(result.resultingState, fixture.settlement!!.state)
            assertTrue(fixture.settlement!!.destroySecret)
        }
    }

    @Test fun `local templates bind origin kind realm and deterministic message id and escape HTML`() {
        RecoveryRealm.entries.filter { it != RecoveryRealm.Unknown }.forEach { realm ->
            IdentityMessageKind.entries.filter { it != IdentityMessageKind.Unknown }.forEach { kind ->
                IdentityMessagePayload("private@example.test".toCharArray(), realm, kind, secret.toCharArray(), expires).use { payload ->
                    renderer.render(id, payload).use { message ->
                        assertEquals("<identity-$id@shop.example.test>", message.messageId)
                        message.useContent { recipient, plain, html ->
                            assertEquals("private@example.test", String(recipient))
                            val path = if (kind == IdentityMessageKind.EMAIL_VERIFICATION) "/verify-email" else "/reset-password"
                            val link = "https://shop.example.test$path#realm=${realm.name.lowercase()}&token=$secret"
                            assertTrue(String(plain).contains(link))
                            assertTrue(String(html).contains(link.replace("&", "&amp;")))
                            assertFalse(String(html).contains("private@example.test"))
                        }
                    }
                }
            }
        }
        listOf("http://shop.example.test", "https://user:secret@shop.example.test", "https://shop.example.test/path", "https://shop.example.test?redirect=x", "https://shop.example.test#x").forEach {
            assertThrows(IllegalArgumentException::class.java) { LocalIdentityMessageRenderer(it) }
        }
    }

    private inner class Fixture(
        private val eligibility: IdentityDeliveryEligibility = IdentityDeliveryEligibility.READY,
        private val begin: Boolean = true, val commit: Boolean = true,
        private val decryptFailure: Boolean = false,
        private val payloadRealm: RecoveryRealm = RecoveryRealm.CUSTOMER,
        private val payloadKind: IdentityMessageKind = IdentityMessageKind.EMAIL_VERIFICATION,
        private val observerFailure: Boolean = false,
        private val transport: (RenderedIdentityMessage) -> SmtpDeliveryResult = { SmtpDeliveryResult.ACCEPTED },
    ) {
        val calls = mutableListOf<String>()
        val observations = mutableListOf<Pair<IdentityOutboxState, IdentityDeliveryError>>()
        var settlement: IdentityDeliverySettlement? = null
        var requestedLease: Duration? = null
        var sends = 0
        var decoded: IdentityMessagePayload? = null
        var rendered: RenderedIdentityMessage? = null
        private val context = IdentityMessageEncryptionContext("fixture", id, IdentityMessageKind.EMAIL_VERIFICATION)
        private val envelope = IdentityMessageEnvelope("key", byteArrayOf(1), ByteArray(12), byteArrayOf(2), ByteArray(12))
        private val lease = IdentityDeliveryLease(id, owner, 1, now.plusSeconds(60), context, RecoveryRealm.CUSTOMER, expires, envelope)
        private val queue = object : IdentityDeliveryQueue {
            override fun acquire(owner: UUID, now: Instant, duration: Duration): IdentityDeliveryLease? {
                calls += "acquire"; requestedLease = duration
                return if (settlement?.state?.isTerminal == true) null else lease
            }
            override fun revalidate(lease: IdentityDeliveryLease, now: Instant): IdentityDeliveryEligibility { calls += "revalidate"; return eligibility }
            override fun beginHandoff(lease: IdentityDeliveryLease, now: Instant): Boolean { calls += "begin"; return begin }
            override fun settle(lease: IdentityDeliveryLease, settlement: IdentityDeliverySettlement, now: Instant): Boolean {
                calls += "settle"
                if (commit) this@Fixture.settlement = settlement
                return commit
            }
        }
        private val encryption = object : IdentityMessageEncryption {
            override fun encrypt(context: IdentityMessageEncryptionContext, plaintext: IdentitySecretBytes): IdentityMessageEnvelope = error("UNUSED")
            override fun decrypt(context: IdentityMessageEncryptionContext, envelope: IdentityMessageEnvelope): IdentitySecretBytes {
                calls += "decrypt"
                if (decryptFailure) throw IdentityMessageCryptoFailure()
                return IdentitySecretBytes(byteArrayOf(1))
            }
        }
        private val codec = object : IdentityMessagePayloadCodec {
            override fun encode(payload: IdentityMessagePayload): IdentitySecretBytes = error("UNUSED")
            override fun decode(plaintext: IdentitySecretBytes): IdentityMessagePayload {
                calls += "decode"
                return IdentityMessagePayload("private@example.test".toCharArray(), payloadRealm, payloadKind, secret.toCharArray(), expires).also { decoded = it }
            }
        }
        val worker = IdentityDeliveryWorker(queue, DecryptIdentityDeliveryStep(encryption, codec), renderer,
            object : IdentitySmtpTransport {
                override fun deliver(message: RenderedIdentityMessage): SmtpDeliveryResult {
                    calls += "smtp"; sends++; rendered = message; return transport(message)
                }
            }, policy, Clock.fixed(now, ZoneOffset.UTC), IdentityDeliveryObserver { state, category ->
                observations += state to category
                if (observerFailure) error("OBSERVER_FAILED")
            })
    }
}
