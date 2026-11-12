package com.storecore.identity

import com.storecore.identity.domain.*
import com.storecore.identity.infrastructure.*
import org.junit.jupiter.api.Test
import java.util.Base64
import kotlin.test.*
import org.springframework.boot.test.context.runner.ApplicationContextRunner
import org.springframework.jdbc.core.JdbcTemplate
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import com.storecore.identity.application.IdentityDeliveryQueue
import io.micrometer.core.instrument.simple.SimpleMeterRegistry

class IdentityDeliveryConfigurationTest {
    private fun configured(mode: EmailDeliveryMode = EmailDeliveryMode.VERIFICATION_ONLY, enabled: Boolean = true,
        tls: IdentitySmtpTls = IdentitySmtpTls.STARTTLS, origin: String = "https://shop.example.test", sender: String = "sender@example.test",
        keys: Map<String, String> = mapOf("test-key" to Base64.getEncoder().encodeToString(ByteArray(32))),
        evidence: String = "", procedure: String = "") = IdentityDeliverySettings(mode, enabled,
        "smtp.example.test", 587, tls, "fixture-user", "fixture-password", sender, origin, "fixture-installation", "test-key", keys, evidence, procedure)

    @Test fun `default is unconfigured and unavailable for both capabilities`() {
        val settings = IdentityDeliverySettings().also { it.validate() }
        val readiness = IdentityDeliveryReadiness(settings) { true }
        assertEquals(EmailDeliveryReadiness.UNAVAILABLE, readiness.state(EmailDeliveryCapability.EMAIL_VERIFICATION))
        assertEquals(IdentityDeliveryReadinessReason.UNCONFIGURED, readiness.reason(EmailDeliveryCapability.PASSWORD_RECOVERY))
    }
    @Test fun `verification mode never enables recovery and worker plus queue are required`() {
        val readiness = IdentityDeliveryReadiness(configured().also { it.validate() }) { true }
        assertEquals(EmailDeliveryReadiness.READY, readiness.state(EmailDeliveryCapability.EMAIL_VERIFICATION))
        assertEquals(IdentityDeliveryReadinessReason.CAPABILITY_DISABLED, readiness.reason(EmailDeliveryCapability.PASSWORD_RECOVERY))
        assertEquals(IdentityDeliveryReadinessReason.CAPABILITY_DISABLED, readiness.reason(EmailDeliveryCapability.Unknown))
        assertEquals(IdentityDeliveryReadinessReason.QUEUE_UNAVAILABLE, IdentityDeliveryReadiness(configured()) { false }.reason(EmailDeliveryCapability.EMAIL_VERIFICATION))
        assertEquals(IdentityDeliveryReadinessReason.WORKER_DISABLED, IdentityDeliveryReadiness(configured(enabled = false)) { true }.reason(EmailDeliveryCapability.EMAIL_VERIFICATION))
    }
    @Test fun `recovery requires explicit rollout references`() {
        assertFailsWith<IllegalArgumentException> { configured(EmailDeliveryMode.RECOVERY_ENABLED).validate() }
        val settings = configured(EmailDeliveryMode.RECOVERY_ENABLED, evidence = "fixture-evidence", procedure = "fixture-procedure").also { it.validate() }
        assertEquals(EmailDeliveryReadiness.READY, IdentityDeliveryReadiness(settings) { true }.state(EmailDeliveryCapability.PASSWORD_RECOVERY))
    }
    @Test fun `invalid TLS origin sender keyring and unknown mode fail without property values`() {
        listOf(configured(tls = IdentitySmtpTls.Unknown), configured(origin = "http://shop.example.test"),
            configured(sender = "sender@example.test\r\nBcc: injected@example.test"), configured(keys = mapOf("test-key" to "not-base64")),
            configured(EmailDeliveryMode.Unknown)).forEach { settings ->
            val failure = assertFailsWith<IllegalArgumentException> { settings.validate() }
            assertFalse(failure.message.orEmpty().contains("fixture-password"))
            assertEquals("IdentityDeliverySettings(REDACTED)", settings.toString())
        }
    }
    @Test fun `unconfigured mode cannot start worker`() {
        assertFailsWith<IllegalArgumentException> { IdentityDeliverySettings(workerEnabled = true).validate() }
    }
    @Test fun `default Spring wiring starts without database secrets or scheduler`() {
        ApplicationContextRunner().withUserConfiguration(IdentityDeliveryConfiguration::class.java).run { context ->
            assertNull(context.startupFailure)
            assertEquals(EmailDeliveryMode.UNCONFIGURED, context.getBean(IdentityDeliverySettings::class.java).mode)
            assertTrue(context.getBeansOfType(IdentityDeliveryScheduler::class.java).isEmpty())
        }
    }
    @Test fun `startup refuses a key still required by a durable secret`() {
        val jdbc = mock(JdbcTemplate::class.java)
        `when`(jdbc.queryForList(ConfiguredIdentityDeliveryBeans.ACTIVE_KEY_IDS_SQL, String::class.java)).thenReturn(listOf("retired-key"))
        val failure = assertFailsWith<IllegalStateException> {
            ConfiguredIdentityDeliveryBeans().identityMessageKeyring(configured(), jdbc)
        }
        assertEquals("IDENTITY_DELIVERY_PREFLIGHT_FAILED", failure.message)
        assertNull(failure.cause)
    }
    @Test fun `recovery startup refuses absent verified ADMIN even with rollout references`() {
        val failure = assertFailsWith<IllegalStateException> {
            ConfiguredIdentityDeliveryBeans().identityMessageKeyring(
                configured(EmailDeliveryMode.RECOVERY_ENABLED, evidence = "fixture-evidence", procedure = "fixture-procedure"),
                mock(JdbcTemplate::class.java))
        }
        assertEquals("IDENTITY_DELIVERY_PREFLIGHT_FAILED", failure.message)
    }
    @Test fun `configured Spring wiring schedules only with queue and explicit worker permission`() {
        val runner = ApplicationContextRunner().withUserConfiguration(IdentityDeliveryConfiguration::class.java)
            .withBean(JdbcTemplate::class.java, { mock(JdbcTemplate::class.java) })
            .withBean(io.micrometer.core.instrument.MeterRegistry::class.java, { SimpleMeterRegistry() })
            .withPropertyValues("storecore.identity.delivery.mode=VERIFICATION_ONLY",
                "storecore.identity.delivery.smtp.host=smtp.example.test", "storecore.identity.delivery.smtp.port=587",
                "storecore.identity.delivery.smtp.tls=STARTTLS", "storecore.identity.delivery.smtp.username=fixture-user",
                "storecore.identity.delivery.smtp.password=fixture-password", "storecore.identity.delivery.smtp.sender=sender@example.test",
                "storecore.identity.delivery.origin=https://shop.example.test", "storecore.identity.delivery.installation-id=fixture-installation",
                "storecore.identity.delivery.active-key-id=test-key", "storecore.identity.delivery.key-ids=test-key",
                "storecore.identity.delivery.keys.test-key=${Base64.getEncoder().encodeToString(ByteArray(32))}")
        runner.run { context ->
            assertNull(context.startupFailure)
            assertTrue(context.getBeansOfType(IdentityDeliveryScheduler::class.java).isEmpty())
        }
        runner.withPropertyValues("storecore.identity.delivery.worker-enabled=true").run { context ->
            assertNull(context.startupFailure)
            assertTrue(context.getBeansOfType(IdentityDeliveryScheduler::class.java).isEmpty())
            assertEquals(IdentityDeliveryReadinessReason.QUEUE_UNAVAILABLE,
                context.getBean(IdentityDeliveryReadiness::class.java).reason(EmailDeliveryCapability.EMAIL_VERIFICATION))
        }
        runner.withPropertyValues("storecore.identity.delivery.worker-enabled=true")
            .withBean(IdentityDeliveryQueue::class.java, { mock(IdentityDeliveryQueue::class.java) }).run { context ->
                assertNull(context.startupFailure)
                assertEquals(1, context.getBeansOfType(IdentityDeliveryScheduler::class.java).size)
            }
    }
}
