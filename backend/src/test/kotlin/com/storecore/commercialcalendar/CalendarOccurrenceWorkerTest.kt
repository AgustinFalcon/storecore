package com.storecore.commercialcalendar

import com.storecore.commercialcalendar.application.*
import com.storecore.commercialcalendar.domain.*
import com.storecore.commercialcalendar.infrastructure.CalendarConfiguration
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.context.annotation.Bean
import org.springframework.scheduling.annotation.Scheduled
import java.time.Instant
import java.util.UUID

class CalendarOccurrenceWorkerTest {
    private val owner=requireNotNull(CalendarLeaseOwner.fromWire(UUID.randomUUID()))

    @Test fun `batch owner and fence reject invalid bounds`() {
        assertNull(CalendarOccurrenceBatchSize.from(0)); assertNull(CalendarOccurrenceBatchSize.from(51))
        assertEquals(1,CalendarOccurrenceBatchSize.from(1)?.value); assertEquals(50,CalendarOccurrenceBatchSize.Default.value)
        assertNull(CalendarLeaseOwner.fromWire(null)); assertNull(CalendarLeaseOwner.fromWire(UUID(0,0)))
        assertNull(CalendarOccurrenceLeaseToken.from(owner,0)); assertNull(CalendarOccurrenceLeaseToken.from(owner,4))
        assertEquals(3,CalendarOccurrenceLeaseToken.from(owner,3)?.attempt)
        assertEquals(CalendarOccurrenceFailureClass.UNKNOWN,CalendarOccurrenceFailureClass.fromWire("future"))
        assertEquals(CalendarOccurrenceTerminalReason.UNKNOWN,CalendarOccurrenceTerminalReason.fromWire("future"))
    }

    @Test fun `claim captures eligibility before persistence and grant time remains persistence owned`() {
        val clock=MutableCalendarClock(CalendarFixtures.now.plusNanos(999))
        val port=object: CalendarOccurrencePersistencePort {
            override fun claim(observedAt: Instant,owner: CalendarLeaseOwner,batchSize: CalendarOccurrenceBatchSize): CalendarOccurrenceClaimResult {
                assertEquals(CalendarFixtures.now,observedAt)
                clock.instant=CalendarFixtures.now.plusSeconds(120)
                return requireNotNull(CalendarOccurrenceClaimResult.Page.create(observedAt,clock.now(),1,0,1,0,emptyList()))
            }
            override fun settleFailure(id: CalendarOccurrenceId,token: CalendarOccurrenceLeaseToken,failure: CalendarOccurrenceFailureClass,settledAt: Instant)=fail<CalendarOccurrenceSettlementResult>("claim cannot settle failure")
        }
        val result=assertInstanceOf(CalendarOccurrenceClaimResult.Page::class.java,CalendarOccurrenceWorkerService(clock,port).claim(owner))
        assertEquals(CalendarFixtures.now,result.observedAt); assertEquals(CalendarFixtures.now.plusSeconds(120),result.leaseGrantedAt)
        assertEquals(1,result.selected); assertEquals(0,result.leased); assertEquals(1,result.skipped)
    }

    @Test fun `page rejects inconsistent counters and fractional or backwards grant times`() {
        val at=CalendarFixtures.now
        assertNull(CalendarOccurrenceClaimResult.Page.create(at,at,0,0,0,0,emptyList()))
        assertNull(CalendarOccurrenceClaimResult.Page.create(at,at,51,0,51,0,emptyList()))
        assertNull(CalendarOccurrenceClaimResult.Page.create(at,at,1,0,0,0,emptyList()))
        assertNull(CalendarOccurrenceClaimResult.Page.create(at,at,1,1,0,0,emptyList()))
        assertNull(CalendarOccurrenceClaimResult.Page.create(at,at.minusSeconds(1),1,0,1,0,emptyList()))
        assertNull(CalendarOccurrenceClaimResult.Page.create(at,at.plusNanos(1),1,0,1,0,emptyList()))
        assertNotNull(CalendarOccurrenceClaimResult.Page.create(at,at,1,0,0,1,emptyList()))
    }

    @Test fun `lease preserves a fresh grant and rejects an inconsistent deadline or future occurrence`() {
        val observed=CalendarFixtures.now; val granted=observed.plusSeconds(120)
        val occurrenceId=requireNotNull(CalendarOccurrenceId.fromWire(UUID.randomUUID()))
        val eventId=CalendarFixtures.draft().id; val ruleId=requireNotNull(CalendarRuleId.fromWire(UUID.randomUUID()))
        fun leased(scheduled: Instant,until: Instant)=requireNotNull(CalendarReminderOccurrence.restore(occurrenceId,eventId,CalendarRevision.Zero,ruleId,scheduled,CalendarOccurrenceState.LEASED,1,owner.value,until))
        val lease=requireNotNull(CalendarOccurrenceLease.from(leased(observed,granted.plusSeconds(60)),observed,granted))
        assertEquals(granted.plusSeconds(60),lease.leaseUntil); assertEquals(owner,lease.token.owner); assertEquals(1,lease.token.attempt)
        assertNull(CalendarOccurrenceLease.from(leased(observed,observed.plusSeconds(60)),observed,granted))
        assertNull(CalendarOccurrenceLease.from(leased(observed.plusSeconds(1),granted.plusSeconds(60)),observed,granted))
        val records=mutableListOf(lease)
        val page=requireNotNull(CalendarOccurrenceClaimResult.Page.create(observed,granted,1,1,0,0,records))
        records.clear(); assertEquals(1,page.records.size)
        assertNull(CalendarOccurrenceClaimResult.Page.create(observed,granted,2,2,0,0,listOf(lease,lease)))
        assertNull(CalendarOccurrenceSettlementResult.RetryScheduled.from(observed.plusNanos(1)))
        assertNull(CalendarOccurrenceSettlementResult.Dead.from(CalendarOccurrenceTerminalReason.LATE))
    }

    @Test fun `settlement captures whole second time and does not infer a retry for unknown failure`() {
        val clock=MutableCalendarClock(CalendarFixtures.now.plusNanos(50))
        val id=requireNotNull(CalendarOccurrenceId.fromWire(UUID.randomUUID())); val token=requireNotNull(CalendarOccurrenceLeaseToken.from(owner,1))
        var calls=0
        val port=object: CalendarOccurrencePersistencePort {
            override fun claim(observedAt: Instant,owner: CalendarLeaseOwner,batchSize: CalendarOccurrenceBatchSize)=CalendarOccurrenceClaimResult.Empty(observedAt)
            override fun settleFailure(id: CalendarOccurrenceId,token: CalendarOccurrenceLeaseToken,failure: CalendarOccurrenceFailureClass,settledAt: Instant): CalendarOccurrenceSettlementResult {
                calls++; assertEquals(CalendarFixtures.now,settledAt)
                return CalendarOccurrenceSettlementResult.LostFence
            }
        }
        val service=CalendarOccurrenceWorkerService(clock,port)
        assertSame(CalendarOccurrenceSettlementResult.Corrupt,service.settleFailure(id,token,CalendarOccurrenceFailureClass.UNKNOWN))
        assertEquals(0,calls)
        assertSame(CalendarOccurrenceSettlementResult.LostFence,service.settleFailure(id,token,CalendarOccurrenceFailureClass.RETRYABLE_PRE_HANDOFF))
        assertEquals(1,calls)
    }

    @Test fun `PCC 008D has no automatic worker bean or scheduled method`() {
        assertTrue(CalendarConfiguration::class.java.declaredMethods.filter { it.getAnnotation(Bean::class.java)!=null }.none { CalendarOccurrenceWorkerService::class.java.isAssignableFrom(it.returnType) })
        assertTrue(CalendarOccurrenceWorkerService::class.java.declaredMethods.none { it.getAnnotation(Scheduled::class.java)!=null })
    }
}
