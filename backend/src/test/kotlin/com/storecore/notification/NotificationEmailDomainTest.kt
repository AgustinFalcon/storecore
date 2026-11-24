package com.storecore.notification

import com.storecore.notification.domain.*
import com.storecore.notification.infrastructure.NotificationHttpTranslator
import com.storecore.notification.infrastructure.InvalidNotificationRequest
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class NotificationEmailDomainTest {
    private val filters=requireNotNull(NotificationEmailFilters.create(listOf(NotificationCategory.STOCK),listOf(NotificationSeverity.WARNING)))
    @Test fun `closed vocabularies reject unknown and delivery terminal states never reopen`() {
        NotificationEmailReadiness.entries.forEach { assertEquals(it,NotificationEmailReadiness.fromWire(it.wire)) }
        NotificationEmailOperation.entries.forEach { assertEquals(it,NotificationEmailOperation.fromWire(it.wire)) }
        NotificationEmailPreferenceState.entries.forEach { assertEquals(it,NotificationEmailPreferenceState.fromWire(it.wire)) }
        NotificationEmailDeliveryState.entries.forEach { state ->
            assertEquals(state,NotificationEmailDeliveryState.fromWire(state.wire))
            if(state.terminal || state==NotificationEmailDeliveryState.UNKNOWN) NotificationEmailDeliveryState.entries.forEach { after ->
                listOf(NotificationEmailDeliveryStep.Lease,NotificationEmailDeliveryStep.Cancel,NotificationEmailDeliveryStep.Settle).forEach { assertFalse(it.accepts(state,after)) }
            }
        }
        assertEquals(NotificationEmailReadiness.UNKNOWN,NotificationEmailReadiness.fromWire("ready"))
        assertEquals(NotificationEmailTemplate.UNKNOWN,NotificationEmailTemplate.fromWire("future"))
        assertEquals(NotificationCommandFamily.UNKNOWN,NotificationCommandFamily.fromWire("future"))
    }
    @Test fun `preferences enforce eligible subsets binding revisions and disable without verified address`() {
        assertNull(NotificationEmailFilters.create(emptyList(),listOf(NotificationSeverity.WARNING)))
        assertNull(NotificationEmailFilters.create(listOf(NotificationCategory.CAMPAIGN),listOf(NotificationSeverity.WARNING)))
        assertNull(NotificationEmailFilters.create(listOf(NotificationCategory.STOCK),listOf(NotificationSeverity.INFO)))
        assertNull(NotificationEmailFilters.create(listOf(NotificationCategory.STOCK,NotificationCategory.STOCK),listOf(NotificationSeverity.WARNING)))
        val enable=requireNotNull(NotificationEmailPreferenceCommand.create(requireNotNull(NotificationCommandId.fromWire(UUID.randomUUID())),NotificationEmailOperation.ENABLE,NotificationEmailPreference.disabled().revision,filters))
        assertEquals(NotificationEmailPreferenceOutcome.EMAIL_UNVERIFIED,ApplyNotificationEmailPreference.apply(NotificationEmailPreference.disabled(),enable,null).outcome)
        val enabled=ApplyNotificationEmailPreference.apply(NotificationEmailPreference.disabled(),enable,requireNotNull(NotificationEmailBinding.create(1,"a".repeat(64)))).preference
        assertEquals(NotificationEmailPreferenceState.ENABLED,enabled.state)
        val disable=requireNotNull(NotificationEmailPreferenceCommand.create(requireNotNull(NotificationCommandId.fromWire(UUID.randomUUID())),NotificationEmailOperation.DISABLE,enabled.revision,null))
        val disabled=ApplyNotificationEmailPreference.apply(enabled,disable,null)
        assertEquals(NotificationEmailPreferenceOutcome.APPLIED,disabled.outcome); assertNull(disabled.preference.binding)
        assertEquals(2L,disabled.preference.revision.value)
        assertNull(NotificationEmailPreferenceCommand.create(enable.id,NotificationEmailOperation.DISABLE,enabled.revision,filters))
    }
    @Test fun `bounded retry proof rules and generic renderer prohibit sensitive inputs`() {
        val now=Instant.parse("2026-11-24T00:00:00Z")
        val policy=NotificationEmailRetryPolicy(NotificationEmailJitter { 1.2 })
        listOf(36L,144L,720L,2160L).forEachIndexed { index,seconds ->
            assertEquals(now.plusSeconds(seconds),policy.settle(NotificationEmailTransportResult.ProvenPreDataFailure,index+1,now).retryAt)
        }
        assertEquals(NotificationEmailDeliveryState.DEAD,policy.retry(5,now).state)
        assertEquals(NotificationEmailDeliveryState.UNCERTAIN,policy.settle(NotificationEmailTransportResult.Unknown,1,now).state)
        assertEquals(NotificationEmailDeliveryState.UNCERTAIN,policy.settle(NotificationEmailTransportResult.Uncertain,1,now).state)
        val link=requireNotNull(NotificationEmailCenterLink.fromOrigin("https://merchant.example.test"))
        val rendered=requireNotNull(RenderNotificationEmail.render(NotificationEmailTemplate.OPERATIONAL_ALERT_V1,link))
        assertEquals("https://merchant.example.test/user/notifications",link.value)
        assertTrue(rendered.body.endsWith(link.value)); assertFalse(rendered.body.contains("source")); assertFalse(rendered.body.contains("amount"))
        assertNull(NotificationEmailCenterLink.fromOrigin("https://evil@example.test")); assertNull(NotificationEmailCenterLink.fromOrigin("https://merchant.example.test/path"))
        assertNull(RenderNotificationEmail.render(NotificationEmailTemplate.UNKNOWN,link))
    }
    @Test fun `preference HTTP boundary excludes targets duplicates invalid filters and scalar coercions`() {
        val translator=NotificationHttpTranslator(jacksonObjectMapper()); val key=UUID.randomUUID().toString()
        val enable="""{"operation":"ENABLE","expectedRevision":"0","categories":["STOCK"],"severities":["WARNING"]}"""
        assertEquals(NotificationEmailOperation.ENABLE,translator.emailPreference(key,enable.toByteArray()).operation)
        listOf(enable.dropLast(1)+",\"userId\":1}",enable.replace("STOCK","CAMPAIGN"),enable.replace("WARNING","INFO"),enable.replace("\"0\"","0"),enable.dropLast(1)+",\"operation\":\"ENABLE\"}").forEach {
            assertThrows(InvalidNotificationRequest::class.java) { translator.emailPreference(key,it.toByteArray()) }
        }
        assertEquals(NotificationEmailOperation.DISABLE,translator.emailPreference(key,"""{"operation":"DISABLE","expectedRevision":"1"}""".toByteArray()).operation)
    }
}
