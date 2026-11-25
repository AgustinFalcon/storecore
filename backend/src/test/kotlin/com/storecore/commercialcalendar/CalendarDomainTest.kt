package com.storecore.commercialcalendar

import com.storecore.commercialcalendar.domain.*
import com.storecore.commercialcalendar.infrastructure.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.UUID

internal object CalendarFixtures {
    val now=Instant.parse("2026-11-24T12:00:00Z")
    val hasher=Sha256CalendarHasher()
    fun command()=requireNotNull(CalendarCommandId.fromWire(UUID.randomUUID()))
    fun eventId()=requireNotNull(CalendarEventId.fromWire(UUID.randomUUID()))
    fun preflightId()=requireNotNull(CalendarPreflightId.fromWire(UUID.randomUUID()))
    val reason=requireNotNull(CalendarReason.fromWire("Reviewed by administrator"))
    fun time(at: Instant): CalendarTime {
        val zone=ZoneId.of("America/Argentina/Buenos_Aires")
        return requireNotNull(CalendarTime.fromWire(LocalDateTime.ofInstant(at,zone).format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss")),zone.id,zone.rules.getOffset(at).id))
    }
    fun definition(revision: Long=0,title: String="Operational event",start: Instant=now.plusSeconds(3600),end: Instant=start.plusSeconds(7200),rules: List<CalendarReminderRule> = emptyList())=
        requireNotNull(CalendarDefinition.create(requireNotNull(CalendarRevision.fromWire(revision)),requireNotNull(CalendarTitle.fromWire(title)),requireNotNull(CalendarDescription.fromWire("Internal operational reminder")),time(start),time(end),CalendarAudience.INTERNAL_ALL,null,rules,hasher))
    fun rule(offset: Long=300,id: UUID=UUID.randomUUID())=requireNotNull(CalendarReminderRule.create(requireNotNull(CalendarRuleId.fromWire(id)),CalendarReminderChannel.IN_APP,offset))
    fun draft(definition: CalendarDefinition=definition())=requireNotNull(CalendarEvent.draft(eventId(),definition,now))
}
internal class MutableCalendarClock(var instant: Instant=CalendarFixtures.now): CalendarClock { override fun now()=instant }

class CalendarDomainTest {
    @Test fun `all finite vocabularies reject future wire cases`() {
        assertEquals(CalendarLifecycle.UNKNOWN,CalendarLifecycle.fromWire("future")); assertEquals(CalendarAudience.UNKNOWN,CalendarAudience.fromWire(null))
        assertEquals(CalendarOperation.UNKNOWN,CalendarOperation.fromWire("schedule")); assertEquals(CalendarReminderChannel.UNKNOWN,CalendarReminderChannel.fromWire("EMAIL"))
        assertEquals(CalendarOccurrenceState.UNKNOWN,CalendarOccurrenceState.fromWire("future")); assertEquals(CalendarSwitchState.UNKNOWN,CalendarSwitchState.fromWire("future"))
        assertEquals(CalendarSwitchOperation.UNKNOWN,CalendarSwitchOperation.fromWire("enable")); assertEquals(CalendarSwitchEffectivity.UNKNOWN,CalendarSwitchEffectivity.fromWire("future"))
        assertEquals(CalendarSwitchAction.UNKNOWN,CalendarSwitchAction.fromWire("ACTIVATE_CAMPAIGN"))
        assertEquals(CalendarOutcome.UNKNOWN,CalendarOutcome.fromWire("future")); assertEquals(CalendarPreflightIssue.UNKNOWN,CalendarPreflightIssue.fromWire("future"))
        assertEquals(CalendarCommandFamily.UNKNOWN,CalendarCommandFamily.fromWire("future"))
        CalendarOperation.entries.filter { it!=CalendarOperation.UNKNOWN }.forEach { assertEquals(it,CalendarOperation.fromWire(it.wire)) }
        assertNull(CalendarOccurrenceId.fromWire(UUID(0,0))); assertNull(CalendarCommandPayloadHash.fromWire("x"))
    }
    @Test fun `local time resolves DST overlap explicitly and rejects gap short ids fixed offsets and unknown zones`() {
        val early=requireNotNull(CalendarTime.fromWire("2026-11-01T01:30:00","America/New_York","-04:00"))
        val late=requireNotNull(CalendarTime.fromWire("2026-11-01T01:30:00","America/New_York","-05:00"))
        assertEquals(3600L,late.instant.epochSecond-early.instant.epochSecond)
        assertNull(CalendarTime.fromWire("2026-03-08T02:30:00","America/New_York","-05:00"))
        assertNull(CalendarTime.fromWire("2026-11-01T01:30:00","America/New_York","-03:00"))
        for(zone in listOf("EST","-03:00","UTC+03:00","Etc/UTC","Not/AZone")) assertNull(CalendarTime.fromWire("2026-11-24T12:00:00",zone,"-03:00"))
        assertNull(CalendarTime.fromWire("2026-11-24T12:00:00.1","America/New_York","-05:00"))
    }
    @Test fun `text and numeric boundaries use code points ASCII trimming and checked arithmetic`() {
        assertNotNull(CalendarTitle.fromWire("😀".repeat(120))); assertNull(CalendarTitle.fromWire("😀".repeat(121)))
        assertNotNull(CalendarDescription.fromWire("")); assertNull(CalendarDescription.fromWire("x".repeat(1001)))
        assertNull(CalendarReason.fromWire(" \t\n")); assertNull(CalendarReason.fromWire("x\u0000y")); assertNull(CalendarTitle.fromWire("\uD800"))
        assertEquals("\u00a0",CalendarReason.fromWire(" \u00a0 ")!!.value)
        assertNull(CalendarRevision.fromWire(-1)); assertNull(CalendarRevision.fromWire(Long.MAX_VALUE)!!.next())
        assertNull(CalendarReminderRule.create(CalendarFixtures.rule().id,CalendarReminderChannel.IN_APP,299))
        assertNull(CalendarReminderRule.create(CalendarFixtures.rule().id,CalendarReminderChannel.IN_APP,2_592_001))
    }
    @Test fun `definition hashes bind revisions all content chosen offsets and sorted unique reminder rules`() {
        val a=CalendarFixtures.rule(300); val b=CalendarFixtures.rule(600)
        val one=CalendarFixtures.definition(rules=listOf(a,b)); val two=CalendarFixtures.definition(rules=listOf(b,a))
        assertEquals(one.hash,two.hash); assertNotEquals(one.hash,CalendarFixtures.definition(revision=1,rules=listOf(a,b)).hash)
        assertNotEquals(one.hash,CalendarFixtures.definition(title="Different",rules=listOf(a,b)).hash)
        assertNull(CalendarDefinition.create(one.revision,one.title,one.description,one.start,one.end,one.audience,null,listOf(a,a),CalendarFixtures.hasher))
        assertNotEquals(CalendarFixtures.hasher.hash(listOf("ab","c")),CalendarFixtures.hasher.hash(listOf("a","bc")))
    }
    @Test fun `preflight expires at ten minutes and scheduling revalidates lead revision definition and state`() {
        val event=CalendarFixtures.draft(); val now=CalendarFixtures.now; val p=CalendarPreflight.check(CalendarFixtures.preflightId(),event,now)
        assertTrue(p.issues.isEmpty()); assertEquals(now.plusSeconds(600),p.expiresAt)
        assertEquals(CalendarOutcome.PREFLIGHT_REQUIRED,CalendarDecision.apply(event,event.revision,CalendarStep.Schedule,now).outcome)
        assertEquals(CalendarOutcome.PREFLIGHT_EXPIRED,CalendarDecision.apply(event,event.revision,CalendarStep.Schedule,p.expiresAt,p).outcome)
        val edited=CalendarDecision.apply(event,event.revision,CalendarStep.Edit,now,definition=CalendarFixtures.definition(1)).event
        assertEquals(CalendarOutcome.PREFLIGHT_STALE,CalendarDecision.apply(edited,edited.revision,CalendarStep.Schedule,now,p).outcome)
        val near=CalendarFixtures.draft(CalendarFixtures.definition(start=now.plusSeconds(300))); val preflight=CalendarPreflight.check(CalendarFixtures.preflightId(),near,now)
        assertEquals(CalendarOutcome.INVALID_DEFINITION,CalendarDecision.apply(near,near.revision,CalendarStep.Schedule,now.plusSeconds(1),preflight).outcome)
        val far=CalendarFixtures.draft(CalendarFixtures.definition(start=now.plusSeconds(366L*86400+1)))
        assertTrue(CalendarPreflight.check(CalendarFixtures.preflightId(),far,now).issues.contains(CalendarPreflightIssue.HORIZON_EXCEEDED))
    }
    @Test fun `transition objects enforce approved windows terminal states and definition freeze`() {
        val now=CalendarFixtures.now; val draft=CalendarFixtures.draft(); val p=CalendarPreflight.check(CalendarFixtures.preflightId(),draft,now)
        val scheduled=CalendarDecision.apply(draft,draft.revision,CalendarStep.Schedule,now,p).event
        assertEquals(draft.definition.revision,scheduled.approvedDefinitionRevision)
        assertEquals(CalendarOutcome.INVALID_TRANSITION,CalendarDecision.apply(scheduled,scheduled.revision,CalendarStep.Activate,now).outcome)
        val paused=CalendarDecision.apply(scheduled,scheduled.revision,CalendarStep.Pause,now).event
        assertEquals(CalendarLifecycle.SCHEDULED,CalendarDecision.apply(paused,paused.revision,CalendarStep.Resume,now).event.lifecycle)
        assertEquals(CalendarLifecycle.ACTIVE,CalendarDecision.apply(paused,paused.revision,CalendarStep.Resume,scheduled.definition.start.instant).event.lifecycle)
        val completed=CalendarDecision.apply(scheduled,scheduled.revision,CalendarStep.Complete,scheduled.definition.end.instant).event
        assertEquals(CalendarLifecycle.COMPLETED,completed.lifecycle)
        for(step in CalendarStep.known) assertEquals(CalendarOutcome.INVALID_TRANSITION,CalendarDecision.apply(completed,completed.revision,step,now).outcome)
        assertEquals(CalendarOutcome.REVISION_CONFLICT,CalendarDecision.apply(scheduled,draft.revision,CalendarStep.Cancel,now).outcome)
        val exhausted=requireNotNull(CalendarEvent.restore(draft.id,CalendarRevision.fromWire(Long.MAX_VALUE)!!,draft.lifecycle,draft.definition,null,now))
        assertEquals(CalendarOutcome.REVISION_EXHAUSTED,CalendarDecision.apply(exhausted,exhausted.revision,CalendarStep.Cancel,now).outcome)
        assertEquals(CalendarOutcome.INVALID_TRANSITION,CalendarDecision.apply(scheduled,scheduled.revision,CalendarStep.Edit,now,definition=CalendarFixtures.definition(1)).outcome)
    }
    @Test fun `system command identity binds event revision operation and exact boundary`() {
        val event=CalendarFixtures.draft(); val h=CalendarFixtures.hasher
        assertEquals(h.systemCommand(event.id,event.revision,CalendarOperation.SYSTEM_ACTIVATE,event.definition.start.instant),h.systemCommand(event.id,event.revision,CalendarOperation.SYSTEM_ACTIVATE,event.definition.start.instant))
        assertNotEquals(h.systemCommand(event.id,event.revision,CalendarOperation.SYSTEM_ACTIVATE,event.definition.start.instant),h.systemCommand(event.id,event.revision,CalendarOperation.SYSTEM_COMPLETE,event.definition.end.instant))
    }
    @Test fun `temporary reminder switch is structurally closed and expires fail closed`() {
        val now=CalendarFixtures.now
        val owner=requireNotNull(CalendarSwitchOwner.fromWire("Operations owner"))
        val ticket=requireNotNull(CalendarRemovalTicket.fromWire("OPS-442"))
        val metadata=requireNotNull(CalendarSwitchMetadata.forNewCommand(owner,CalendarFixtures.reason,now,now.plusSeconds(301),ticket,CalendarSwitchAction.EMIT_IN_APP_CAMPAIGN_REMINDER,now))
        val bootstrap=CalendarSwitchSnapshot.bootstrap()
        assertEquals(CalendarSwitchEffectivity.DISABLED,bootstrap.effectivity(now))
        val enabled=requireNotNull(CalendarSwitchSnapshot.restore(CalendarSwitchState.ENABLED,CalendarRevision.fromWire(1)!!,metadata))
        assertEquals(CalendarSwitchEffectivity.EFFECTIVE,enabled.effectivity(metadata.expiresAt.minusNanos(1)))
        assertEquals(CalendarSwitchEffectivity.EXPIRED,enabled.effectivity(metadata.expiresAt))
        assertNull(CalendarSwitchMetadata.forNewCommand(owner,CalendarFixtures.reason,now,now.plusSeconds(300),ticket,CalendarSwitchAction.EMIT_IN_APP_CAMPAIGN_REMINDER,now))
        assertNull(CalendarSwitchMetadata.forNewCommand(owner,CalendarFixtures.reason,now,now.plusSeconds(7L*86400+1),ticket,CalendarSwitchAction.EMIT_IN_APP_CAMPAIGN_REMINDER,now))
        assertNull(CalendarSwitchSnapshot.restore(CalendarSwitchState.ENABLED,CalendarRevision.Zero,null))
        assertNull(CalendarSwitchOwner.fromWire(" ")); assertNull(CalendarRemovalTicket.fromWire("x".repeat(101)))
    }
    @Test fun `reminder switch decision enforces CAS capability and effective transitions`() {
        val now=CalendarFixtures.now
        fun metadata(at: Instant=now)=requireNotNull(CalendarSwitchMetadata.forNewCommand(
            requireNotNull(CalendarSwitchOwner.fromWire("Operations owner")),CalendarFixtures.reason,at,at.plusSeconds(3600),
            requireNotNull(CalendarRemovalTicket.fromWire("OPS-442")),CalendarSwitchAction.EMIT_IN_APP_CAMPAIGN_REMINDER,at))
        val bootstrap=CalendarSwitchSnapshot.bootstrap()
        assertEquals(CalendarOutcome.CAPABILITY_NOT_ACTIVE,CalendarSwitchDecision.apply(bootstrap,bootstrap.revision,CalendarSwitchOperation.ENABLE,metadata(),false,now).outcome)
        val enabled=CalendarSwitchDecision.apply(bootstrap,bootstrap.revision,CalendarSwitchOperation.ENABLE,metadata(),true,now)
        assertEquals(CalendarOutcome.APPLIED,enabled.outcome); assertEquals(CalendarSwitchState.ENABLED,enabled.snapshot.configuredState)
        assertEquals(CalendarOutcome.INVALID_TRANSITION,CalendarSwitchDecision.apply(enabled.snapshot,enabled.snapshot.revision,CalendarSwitchOperation.ENABLE,metadata(),true,now).outcome)
        assertEquals(CalendarOutcome.REVISION_CONFLICT,CalendarSwitchDecision.apply(enabled.snapshot,bootstrap.revision,CalendarSwitchOperation.DISABLE,metadata(),false,now).outcome)
        val disabled=CalendarSwitchDecision.apply(enabled.snapshot,enabled.snapshot.revision,CalendarSwitchOperation.DISABLE,metadata(),false,now)
        assertEquals(CalendarOutcome.APPLIED,disabled.outcome); assertEquals(CalendarSwitchState.DISABLED,disabled.snapshot.configuredState)
        val expired=requireNotNull(CalendarSwitchSnapshot.restore(CalendarSwitchState.ENABLED,CalendarRevision.fromWire(7)!!,metadata(now.minusSeconds(7200))))
        assertEquals(CalendarSwitchEffectivity.EXPIRED,expired.effectivity(now))
        assertEquals(CalendarOutcome.APPLIED,CalendarSwitchDecision.apply(expired,expired.revision,CalendarSwitchOperation.ENABLE,metadata(),true,now).outcome)
        assertEquals(CalendarOutcome.INVALID_TRANSITION,CalendarSwitchDecision.apply(expired,expired.revision,CalendarSwitchOperation.DISABLE,metadata(),false,now).outcome)
        val exhausted=requireNotNull(CalendarSwitchSnapshot.restore(CalendarSwitchState.DISABLED,CalendarRevision.fromWire(Long.MAX_VALUE)!!,metadata()))
        assertEquals(CalendarOutcome.REVISION_EXHAUSTED,CalendarSwitchDecision.apply(exhausted,exhausted.revision,CalendarSwitchOperation.ENABLE,metadata(),true,now).outcome)
    }
}
