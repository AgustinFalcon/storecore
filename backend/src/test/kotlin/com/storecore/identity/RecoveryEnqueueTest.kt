package com.storecore.identity

import com.storecore.identity.application.*
import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.persistence.JdbcRecoveryDelivery
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.mockito.Mockito.*
import org.springframework.jdbc.core.JdbcTemplate
import java.time.Instant
import java.util.UUID

class RecoveryEnqueueTest {
    @Test fun `every unavailable mode cuts off before transaction lookup token and crypto`() {
        EmailDeliveryMode.entries.filter { !it.readiness(EmailDeliveryCapability.PASSWORD_RECOVERY).permitsEnqueue }.forEach { mode ->
            val jdbc = mock(JdbcTemplate::class.java)
            val crypto = mock(IdentityMessageEncryption::class.java)
            val codec = mock(IdentityMessagePayloadCodec::class.java)
            val delivery = JdbcRecoveryDelivery(jdbc, mode, "fixture", crypto, codec)
            val repository = mock(RecoveryRepository::class.java)
            val transactions = mock(RecoveryTransactions::class.java)
            val tokens = mock(RecoveryTokenPort::class.java)
            val budgets = mock(RecoveryBudgetPort::class.java)
            val step = RequestRecoveryStep(repository, delivery, budgets, tokens, transactions)
            listOf("present@example.test", "absent@example.test").forEach {
                assertThrows(RecoveryUnavailable::class.java) { step.execute(RecoveryRealm.CUSTOMER, it, "ip") }
            }
            assertEquals(RecoveryDeliveryState.UNCONFIGURED, delivery.deliver(dispatch()))
            verifyNoInteractions(repository, transactions, jdbc, crypto, codec)
            verify(tokens, never()).nextRawToken()
        }
    }

    @Test fun `enqueue requires the authorization transaction even when ready`() {
        val jdbc = mock(JdbcTemplate::class.java)
        val crypto = mock(IdentityMessageEncryption::class.java)
        val codec = mock(IdentityMessagePayloadCodec::class.java)
        val delivery = JdbcRecoveryDelivery(jdbc, EmailDeliveryMode.RECOVERY_ENABLED, "fixture", crypto, codec)
        assertEquals(RecoveryDeliveryState.READY, delivery.state)
        assertThrows(IllegalStateException::class.java) { delivery.deliver(dispatch()) }
        verifyNoInteractions(jdbc, crypto, codec)
    }

    private fun dispatch() = RecoveryDispatch(UUID.randomUUID(), RecoveryRealm.CUSTOMER,
        CanonicalEmail.fromWire("present@example.test")!!, RecoverySecret.fromWire("a".repeat(43))!!, Instant.now().plusSeconds(900))
}
